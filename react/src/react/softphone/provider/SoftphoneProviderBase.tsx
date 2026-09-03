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
  onIncomingCall?: (event: { from: string; fromName: string | null }) => void;
  onCallStarted?: (event: { direction: 'inbound' | 'outbound'; peer: string }) => void;
  onCallEnded?: (event: { reason: CallEndReason }) => void;
  onError?: (event: { code: string; message: string }) => void;
}

export interface SoftphoneProviderBaseProps<Extra extends object> extends SoftphoneCoreProps {
  /** Platform-only context fields (web: `{ scope }`; native: `{ locationProvider }`). */
  extra: Extra;
  children: React.ReactNode;
}

// eslint-disable-next-line react/function-component-definition -- generic component; a `React.FC` arrow can't carry the <Extra> type parameter, so this must stay a function declaration
export function SoftphoneProviderBase<Extra extends object>({
  token,
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
  extra,
  children,
}: SoftphoneProviderBaseProps<Extra>): React.JSX.Element {
  const { lastError, handleError, clearError } = useLastError(onError);
  // Key on appearance CONTENT, not object identity, so a host passing an inline
  // `appearance={{ theme }}` literal (new object each render) doesn't recompute
  // the palette every render (incl. every 1s duration tick during a call).
  const appearanceKey = `${appearance?.theme ?? ''}|${JSON.stringify(appearance?.variables ?? {})}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on appearance content (appearanceKey), not identity
  const palette = useMemo(() => resolveSoftphonePalette(appearance), [appearanceKey]);
  const t = (k: keyof Locale['softphone']) => locale.softphone[k];
  const displayNumber = (v: string) => formatDisplayNumber(v, defaultCountry);

  // The composition root owns the phone: usePhone constructs it + tracks its
  // connection lifecycle, then it's handed to both useCalls (call state) and
  // useEmergencyBinding (E911). Neither of those owns the phone anymore.
  const { phone, connection } = usePhone({
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
  } = useCalls(phone, connection, {
    onIncomingCall,
    onCallStarted,
    onCallEnded,
    onError: handleError,
  });

  // E911 binding wired once here so web and native can't drift. It talks to the
  // phone directly via its narrow E911 interface — no rename layer.
  //
  // `usePhone` yields null before the first construct and after teardown, but the
  // hook takes a NON-nullable phone: absorbing that here keeps every E911 call
  // site unconditional. Were the hook to branch on a null phone instead, the
  // natural `phone?.bind()` spelling would resolve without binding anything and
  // report success on a safety gate. DISCONNECTED_PHONE rejects instead, so the
  // banner surfaces an error and stays open.
  const emergency = useEmergencyBinding(phone ?? DISCONNECTED_PHONE, {
    disabled: !!emergencyAddressId,
    connection,
    identityKey: token,
  });
  // The server's network.changed signal (emergency address rejected for this
  // network) drives the E911 gate. Subscribe here — after both hooks exist — so
  // no forward-ref is needed to reach useEmergencyBinding from usePhone.
  //
  // This attaches a commit after the phone is constructed, where the pre-split
  // code subscribed synchronously before connect(). No signal can be missed in
  // that gap: network.changed is a server frame, so it cannot arrive until the
  // socket has opened and authenticated — many round-trips after React has
  // flushed this effect.
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
