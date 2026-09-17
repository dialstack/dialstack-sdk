/**
 * Shared core of the softphone provider — the wiring both the web and native
 * providers reuse so it can't drift between them. It provides the context and
 * renders `children`; each platform supplies its own side-effects (web:
 * `<style>`/`<audio>`/ringtone; native: InCallManager) as ordinary child
 * components that read the context via `useSoftphoneBase`.
 *
 * Must stay DOM- and React-Native-free: it's part of the shared headless core
 * (src/react/softphone/core) that @dialstack/sdk-native inlines at build time.
 */

import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import {
  usePhone,
  useCalls,
  MAX_CALLS,
  useCallActions,
  useCallOverlays,
  useCallDuration,
  useEmergencyBinding,
  type PhoneE911Api,
  useLastError,
  shouldRingIncoming,
  isIncomingRinging,
  formatDisplayNumber,
  type UseCallActions,
  type UseCallOverlays,
  type UseEmergencyBinding,
  type SoftphoneConnectionState,
  type UsePhoneOptions,
} from '../hooks';
import {
  createPaginatedList,
  type Call,
  type CallEndReason,
  type DialStackPhone,
  type EmergencyAddress,
  type ListResponse,
  type PlatformStorage,
} from '@dialstack/sdk-webrtc';
import { resolveSoftphonePalette, type SoftphonePalette } from '../core/theme';
import { defaultLocale, type Locale, type AppearanceOptions } from '@dialstack/sdk-js/pure';
import type { CountryCode } from 'libphonenumber-js';

/** Context fields both platforms expose. Platforms add their own via `extra`. */
export interface SoftphoneContextBase {
  connection: SoftphoneConnectionState;
  /**
   * The live WebRTC phone, or null before the first one is constructed. For the
   * phone-scoped settings that aren't per-call — audio device selection, which
   * must work whether or not a call is up. Per-call actions belong on `actions`.
   */
  webrtcPhone: DialStackPhone | null;
  calls: Call[];
  activeCall: Call | null;
  incomingCalls: Call[];
  /** True while an unanswered inbound call should be audibly ringing. */
  incomingRinging: boolean;
  heldCalls: Call[];
  answerCall: (call: Call) => void;
  switchToCall: (call: Call) => void;
  actions: UseCallActions;
  /**
   * Internal built-in-UI machinery: the mutually-exclusive keypad/transfer
   * overlay flags the bundled `OngoingCall` renders. Not part of the public
   * softphone API — a custom layout owns its own presentation state and ignores
   * this. Kept on the shared context (rather than local to `OngoingCall`) only so
   * web and React Native can't drift on when the overlays reset.
   */
  overlays: UseCallOverlays;
  duration: string;
  consultCall: Call | null;
  transferOriginal: Call | null;
  startAttendedTransfer: (destination: string) => Promise<void>;
  completeAttendedTransfer: () => void;
  cancelAttendedTransfer: () => void;
  placeCall: (destination: string) => Promise<void>;
  /** The calls bridged into a local three-way conference (empty when not merged). */
  mergedCalls: Call[];
  isMerged: boolean;
  /** While merged, every remote party mixed — what the local user hears. */
  conferenceAudio: MediaStream | null;
  /** Whether merging is possible: two connected calls, no transfer, WebAudio present. */
  canMerge: boolean;
  mergeCalls: () => void;
  splitMerge: () => void;
  /** Hang up every leg of the conference (the merged UI shows one Hang up). */
  hangupConference: () => void;
  /** Hold or resume every leg of the conference together. */
  holdConference: (held: boolean) => void;
  emergency: UseEmergencyBinding;
  emergencyManagedByHost: boolean;
  lastError: { code: string; message: string } | null;
  clearError: () => void;
  t: (key: keyof Locale['softphone']) => string;
  displayNumber: (value: string) => string;
  /** Resolved theme palette — computed on both platforms so mobile themes like web. */
  palette: SoftphonePalette;
}

const SoftphoneContext = createContext<SoftphoneContextBase | null>(null);

// Stands in for the phone while `usePhone` has none — before the first construct
// and after teardown.
//
// EVERY member rejects, reads included. Nothing here resolves, so no caller can
// mistake "there is no phone" for an answer about the user's emergency address.
// A write that resolved would report a successful bind while the server bound
// nothing; a read that resolved empty would say "no saved address" for a user who
// has one. The E911 hook already treats a failed read as unbound (its catch sets
// `bound = false`), which is the safe state, so rejecting needs no handling there.
//
// In practice the reads are unreachable — the post-connect effect early-returns
// unless `connection === 'connected'`, and usePhone sets the phone before it ever
// reports connected. Rejecting anyway means that ordering is a nice-to-have
// rather than load-bearing: if it ever changes, this fails closed instead of
// silently answering with an empty list.
const notConnected = () => Promise.reject(new Error('Phone not connected'));

const DISCONNECTED_PHONE: PhoneE911Api = {
  // Built per call, not once at module scope: the rejected promise must be
  // created only when a caller is there to await it, or it would be an unhandled
  // rejection at import time.
  listEmergencyAddresses: () =>
    createPaginatedList<ListResponse<EmergencyAddress>>(notConnected(), notConnected),
  setEmergencyAddress: notConnected,
  presentedEmergencyAddressId: null,
  clearEmergencyAddressRegisteredIp: notConnected,
  reconnectWithEmergency: notConnected,
};

export interface SoftphoneCoreProps {
  token: string;
  /**
   * Adopt an existing phone instead of constructing one from `token` — for a
   * native call surface where a call can exist before any phone does (see
   * `usePhone`). Neither connected nor disconnected by the provider.
   */
  existingPhone?: DialStackPhone | null;
  apiBaseUrl?: string;
  /** Host callback invoked shortly before the token expires; returns a fresh token. */
  onTokenExpiring?: () => Promise<string>;
  iceServers?: UsePhoneOptions['iceServers'];
  storage?: PlatformStorage;
  ringback?: UsePhoneOptions['ringback'];
  createSignalingSocket?: UsePhoneOptions['createSignalingSocket'];
  onAppResume?: UsePhoneOptions['onAppResume'];
  emergencyAddressId?: string;
  autoConnect?: boolean;
  appearance?: AppearanceOptions;
  locale?: Locale;
  defaultCountry?: CountryCode;
  onConnectionStateChange?: (event: { state: SoftphoneConnectionState }) => void;
  onIncomingCall?: (event: {
    /**
     * The call's id — the handle a host bridging to a native call UI uses to bind
     * its OS session to THIS call (guessing from `incomingCalls` is wrong once two ring).
     */
    callId: string;
    from: string;
    fromName: string | null;
  }) => void;
  onCallStarted?: (event: { direction: 'inbound' | 'outbound'; peer: string }) => void;
  onCallEnded?: (event: { reason: CallEndReason }) => void;
  onError?: (event: { code: string; message: string }) => void;
}

export interface SoftphoneProviderBaseProps<Extra extends object> extends SoftphoneCoreProps {
  /**
   * Wraps outbound-call placement. Not host-facing: a platform provider sets it
   * (RN routes the dial through the call bridge, so the OS is told about the call
   * before it is dialled and the foreground service exists in time). Defaults to
   * `phone.call`; web never sets it. See `useCalls`.
   */
  placeOutbound?: (destination: string) => Promise<Call>;
  /** Platform-only context fields (web: `{ scope }`; native: `{ locationProvider }`). */
  extra: Extra;
  children: React.ReactNode;
}

// eslint-disable-next-line react/function-component-definition -- generic component; a `React.FC` arrow can't carry the <Extra> type parameter, so this must stay a function declaration
export function SoftphoneProviderBase<Extra extends object>({
  token,
  existingPhone,
  apiBaseUrl,
  onTokenExpiring,
  iceServers,
  storage,
  ringback,
  createSignalingSocket,
  onAppResume,
  emergencyAddressId,
  autoConnect = true,
  appearance,
  locale = defaultLocale,
  defaultCountry = 'US',
  onConnectionStateChange,
  onIncomingCall,
  onCallStarted,
  onCallEnded,
  onError,
  placeOutbound,
  extra,
  children,
}: SoftphoneProviderBaseProps<Extra>): React.JSX.Element {
  const { lastError, handleError, clearError } = useLastError(onError);
  // Key on appearance CONTENT, not object identity, so an inline `appearance`
  // literal doesn't recompute the palette every render (incl. the 1s duration tick).
  const appearanceKey = `${appearance?.theme ?? ''}|${JSON.stringify(appearance?.variables ?? {})}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on appearance content (appearanceKey), not identity
  const palette = useMemo(() => resolveSoftphonePalette(appearance), [appearanceKey]);
  const t = (k: keyof Locale['softphone']) => locale.softphone[k];
  const displayNumber = (v: string) => formatDisplayNumber(v, defaultCountry);

  // usePhone owns the phone; it's handed to useCalls and useEmergencyBinding.
  const { phone, connection } = usePhone({
    existingPhone,
    token,
    apiBaseUrl,
    onTokenExpiring,
    iceServers,
    storage,
    ringback,
    createSignalingSocket,
    onAppResume,
    emergencyAddressId,
    autoConnect,
    onError: handleError,
  });

  const {
    calls: callEntries,
    activeCall,
    incomingCalls,
    heldCalls,
    answerCall,
    switchToCall,
    placeCall,
    consultCall,
    transferOriginal,
    startAttendedTransfer,
    completeAttendedTransfer,
    cancelAttendedTransfer,
    mergedCalls,
    isMerged,
    conferenceAudio,
    canMerge,
    mergeCalls,
    splitMerge,
    hangupConference,
    holdConference,
  } = useCalls(phone, connection, {
    onIncomingCall,
    onCallStarted,
    onCallEnded,
    onError: handleError,
    placeOutbound,
  });

  // The hook takes a NON-nullable phone; DISCONNECTED_PHONE stands in so a null
  // phone can't resolve a `phone?.bind()` without binding and report success on a
  // safety gate — it rejects, so the banner surfaces an error and stays open.
  const emergency = useEmergencyBinding(phone ?? DISCONNECTED_PHONE, {
    disabled: !!emergencyAddressId,
    connection,
    identityKey: token,
    // `callEntries` is the one array every call lives in (active, ringing, held,
    // transfer legs are all derived views), so a woken inbound counts and a consult
    // leg isn't double-counted the way summing the derived views did.
    liveCallCount: callEntries.length,
  });
  // Subscribe to network.changed here — after both hooks exist — so no forward-ref
  // is needed. Attaching a commit after construct misses no signal: network.changed
  // is a server frame, so it can't arrive until the socket has authenticated.
  useEffect(() => {
    if (!phone) return;
    const onNetworkChanged = emergency.onNetworkChanged;
    phone.on('network.changed', onNetworkChanged);
    return () => phone.off('network.changed', onNetworkChanged);
  }, [phone, emergency.onNetworkChanged]);

  const actions = useCallActions(activeCall, { onError: handleError });
  // Built-in-UI overlay flags for the bundled OngoingCall. Owns the
  // reset-on-foreground-call-change invariant so web and native can't drift.
  // Force the add-call panel closed at the concurrent-call cap, so it cannot
  // linger unreachable and reappear with stale digits when a leg drops.
  const overlays = useCallOverlays(activeCall, callEntries.length < MAX_CALLS);
  const duration = useCallDuration(activeCall);

  const calls = useMemo(() => callEntries.map((e) => e.call), [callEntries]);
  const incomingRinging = shouldRingIncoming(incomingCalls);

  // Clear a stale error banner only on the error→connected edge, not every render.
  const prevConnectionRef = useRef(connection);
  useEffect(() => {
    onConnectionStateChange?.({ state: connection });
    if (connection === 'connected' && prevConnectionRef.current !== 'connected') {
      clearError();
    }
    prevConnectionRef.current = connection;
  }, [connection, onConnectionStateChange, clearError]);

  const value = useMemo(
    () => ({
      connection,
      webrtcPhone: phone,
      calls,
      activeCall,
      incomingCalls,
      incomingRinging,
      heldCalls,
      answerCall,
      switchToCall,
      actions,
      overlays,
      duration,
      consultCall,
      transferOriginal,
      startAttendedTransfer,
      completeAttendedTransfer,
      cancelAttendedTransfer,
      placeCall,
      mergedCalls,
      isMerged,
      conferenceAudio,
      canMerge,
      mergeCalls,
      splitMerge,
      hangupConference,
      holdConference,
      emergency,
      emergencyManagedByHost: !!emergencyAddressId,
      lastError,
      clearError,
      t,
      displayNumber,
      palette,
      ...extra,
    }),
    // t/displayNumber recompute from locale/defaultCountry each render; the
    // meaningful identity drivers are the state + stable callbacks + extra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      connection,
      phone,
      calls,
      activeCall,
      incomingCalls,
      incomingRinging,
      heldCalls,
      answerCall,
      switchToCall,
      actions,
      overlays,
      duration,
      consultCall,
      transferOriginal,
      startAttendedTransfer,
      completeAttendedTransfer,
      cancelAttendedTransfer,
      placeCall,
      mergedCalls,
      isMerged,
      conferenceAudio,
      canMerge,
      mergeCalls,
      splitMerge,
      hangupConference,
      holdConference,
      emergency,
      emergencyAddressId,
      lastError,
      clearError,
      palette,
      locale,
      defaultCountry,
      extra,
    ]
  );

  return (
    <SoftphoneContext.Provider value={value as unknown as SoftphoneContextBase}>
      {children}
    </SoftphoneContext.Provider>
  );
}

/** Access the shared context, typed as each platform's own value. Throws outside a provider. */
export function useSoftphoneBase<T extends SoftphoneContextBase>(): T {
  const ctx = useContext(SoftphoneContext);
  if (!ctx) {
    throw new Error(
      'Could not find softphone context; wrap your softphone UI in a <SoftphoneProvider>.'
    );
  }
  return ctx as T;
}

/** Shared accessor: the currently-ringing inbound call, or null. */
export function selectIncomingCall(incomingCalls: Call[]): Call | null {
  return incomingCalls.find(isIncomingRinging) ?? null;
}

export { SoftphoneContext };
