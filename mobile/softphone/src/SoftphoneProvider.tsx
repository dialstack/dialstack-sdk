/**
 * SoftphoneProvider (React Native) — the headless owner of the softphone
 * connection, the RN sibling of the web SoftphoneProvider with the SAME API.
 *
 * It owns the DialStackPhone (via the shared `useCalls` brain), the E911 binding
 * flow, and the audio session (react-native-incall-manager, held while any call
 * is connected — the SDK core never depends on it), and exposes all of it through
 * context. The presentational components (DialPad /
 * IncomingCall / OngoingCall) and the batteries-included Softphone read from that
 * context and own no connection themselves.
 *
 * Because the connection lives here (not in a visual component), an app can keep
 * the phone connected while mounting the call UI only when there's a call — an
 * inbound call still rings even when no softphone screen is shown.
 */

import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import InCallManager from 'react-native-incall-manager';
import { type CountryCode } from 'libphonenumber-js';
import type { Call, CallEndReason } from '@dialstack/sdk/webrtc';
import {
  useCalls,
  useCallActions,
  useCallDuration,
  useEmergencyBinding,
  useLastError,
  isIncomingRinging,
  shouldRingIncoming,
  formatDisplayNumber,
  defaultLocale,
  type Locale,
  type UseCallActions,
  type UseEmergencyBinding,
  type SoftphoneConnectionState,
} from '@dialstack/sdk/react/softphone';
import {
  resolveSoftphonePalette,
  type SoftphonePalette,
} from '@dialstack/sdk/components/softphone-theme';

// Derive the appearance type from the theme resolver rather than importing it
// from the SDK root (which would pull the web component graph into RN).
type AppearanceOptions = Parameters<typeof resolveSoftphonePalette>[0];

export type ConnectionState = SoftphoneConnectionState;

export interface SoftphoneProviderProps {
  /** WebRTC user session token. */
  token: string;
  /** API base URL (defaults to the SDK's production endpoint). */
  apiBaseUrl?: string;
  /** Emergency (E911) address id to present on connect; when supplied the host
   *  manages E911 and the built-in prompt is disabled. */
  emergencyAddressId?: string;
  /** Connect automatically once mounted (default: true). */
  autoConnect?: boolean;
  /** Theming — the shared appearance surface. */
  appearance?: AppearanceOptions;
  /** Locale for UI strings (defaults to English), same surface as the web softphone. */
  locale?: Locale;
  /** Default country for number formatting. */
  defaultCountry?: CountryCode;
  onConnectionStateChange?: (event: { state: ConnectionState }) => void;
  onIncomingCall?: (event: { from: string; fromName: string | null }) => void;
  onCallStarted?: (event: { direction: 'inbound' | 'outbound'; peer: string }) => void;
  onCallEnded?: (event: { reason: CallEndReason }) => void;
  onError?: (event: { code: string; message: string }) => void;
  children: React.ReactNode;
}

export interface SoftphoneContextValue {
  connection: ConnectionState;
  /**
   * Every live call leg — active, held, and ringing inbound. Feed to
   * `selectLayout` for the composite multi-call view.
   */
  calls: Call[];
  activeCall: Call | null;
  /**
   * Ringing inbound calls not yet answered — a call-waiting interrupt during an
   * active call, or one or more concurrent inbound calls while idle. Shown as
   * (compact when >1) answer/decline cards; answering holds the active call.
   */
  incomingCalls: Call[];
  /**
   * Held (backgrounded) answered calls the user can switch back to — excludes
   * ringing inbound calls. Rendered as a switchable list during an active call.
   */
  heldCalls: Call[];
  /**
   * Answer a specific ringing inbound call: holds the current active call and
   * makes the answered call active. Route incoming-card answers through this.
   */
  answerCall: (call: Call) => void;
  /**
   * Switch the active call to an already-answered held call: holds the current
   * active call and resumes the target. No-op if it's already active.
   */
  switchToCall: (call: Call) => void;
  actions: UseCallActions;
  duration: string;
  /**
   * The consult leg of an in-progress attended transfer, or null. While set,
   * `activeCall` is the live consult leg and `transferOriginal` is the held
   * original party.
   */
  consultCall: Call | null;
  /** The held original party during an attended transfer (opposite consultCall), or null. */
  transferOriginal: Call | null;
  /**
   * The last call/connection error surfaced to the user, or null. The built-in
   * UI shows this so a failed dial isn't silent; `clearError()` dismisses it.
   */
  lastError: { code: string; message: string } | null;
  /** Dismiss the current `lastError`. */
  clearError: () => void;
  /** Attended transfer: hold the active call and dial `destination` as a consult. */
  startAttendedTransfer: (destination: string) => Promise<void>;
  /** Attended transfer: bridge the held original to the consult party. */
  completeAttendedTransfer: () => void;
  /** Attended transfer: hang up the consult and resume the held original. */
  cancelAttendedTransfer: () => void;
  placeCall: (destination: string) => Promise<void>;
  dial: (destination: string) => void;
  emergency: UseEmergencyBinding;
  emergencyManagedByHost: boolean;
  /** Format a raw number for display using the configured default country. */
  displayNumber: (value: string) => string;
  /** Locale string accessor for the `softphone` namespace (mirrors the web softphone). */
  t: (key: keyof Locale['softphone']) => string;
  /** Resolved palette; RN components build their StyleSheet from it. */
  palette: SoftphonePalette;
}

const SoftphoneContext = createContext<SoftphoneContextValue | null>(null);

export function SoftphoneProvider({
  token,
  apiBaseUrl,
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
  children,
}: SoftphoneProviderProps): React.JSX.Element {
  // Last error surfaced to the user (shared hook so web + RN can't drift): wraps
  // the host onError and stores it locally for the built-in banner. Cleared on a
  // successful reconnect.
  const { lastError, handleError, clearError } = useLastError(onError);
  // Memoize so the palette keeps a stable identity across renders — it flows
  // into the context value and is the dep of each child's makeStyles(palette)
  // memo, so recomputing it every render would rebuild every StyleSheet on every
  // render (e.g. once/sec during a call from the duration tick).
  const palette = useMemo(() => resolveSoftphonePalette(appearance), [appearance]);
  const displayNumber = (v: string) => formatDisplayNumber(v, defaultCountry);
  const t = (k: keyof Locale['softphone']) => locale.softphone[k];

  // network.changed must reach useEmergencyBinding, created after useCalls.
  const onNetworkChangedRef = useRef<() => void>(() => {});

  const {
    connection,
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
    listEmergencyAddresses,
    setEmergencyAddress,
    selectEmergencyAddress,
    clearEmergencyAddressRegisteredIp,
    reconnect,
  } = useCalls({
    token,
    apiBaseUrl,
    emergencyAddressId,
    autoConnect,
    onIncomingCall,
    onCallStarted,
    onCallEnded,
    onError: handleError,
    onNetworkChanged: () => onNetworkChangedRef.current(),
  });

  // RN owns the audio session (earpiece by default; the user can flip to
  // speaker) for as long as ANY call is connected — not just the foreground one.
  // Keying this on "a connected call exists" rather than on `activeCall` identity
  // is what makes multi-call safe: switching between calls, or promoting a held
  // call after a hangup, keeps the session up (the old per-activeCall effect ran
  // its cleanup on every switch, killing the route since resume() emits no
  // `activated`). Start when the first connected call appears, stop only when the
  // last one goes away (incl. provider unmount). The SDK core never depends on this.
  const hasConnectedCall = callEntries.some((e) => e.call.isConnected);
  useEffect(() => {
    if (!hasConnectedCall) return;
    InCallManager.start({ media: 'audio' });
    return () => InCallManager.stop();
  }, [hasConnectedCall]);

  // Play the device ringtone while an inbound call is ringing. RN rings natively
  // via InCallManager (the web softphone synthesizes its own tone); the SDK core
  // only does outbound ringback, so the inbound ring is the provider's job.
  // Keyed on the derived ringing flag so it re-evaluates on ringing→active.
  // Ring while ANY inbound call is alerting (idle inbound OR a call-waiting
  // interrupt during an active call). `incomingCalls` is the ringing subset.
  const incomingRinging = shouldRingIncoming(incomingCalls);
  useEffect(() => {
    // '_DEFAULT_' ringtone, default vibrate pattern, default iOS category,
    // -1 seconds = ring until stopped.
    if (incomingRinging) InCallManager.startRingtone('_DEFAULT_', [0], '', -1);
    else InCallManager.stopRingtone();
    return () => InCallManager.stopRingtone();
  }, [incomingRinging]);

  const emergency = useEmergencyBinding({
    disabled: !!emergencyAddressId,
    connection,
    // Token identifies the session's user; a change is a user switch → reset the
    // binding state so no stale E911 unlock carries over on a shared client.
    identityKey: token,
    list: listEmergencyAddresses,
    save: setEmergencyAddress,
    select: selectEmergencyAddress,
    clearRegisteredIp: clearEmergencyAddressRegisteredIp,
    reconnect,
  });
  useEffect(() => {
    onNetworkChangedRef.current = emergency.onNetworkChanged;
  }, [emergency.onNetworkChanged]);

  const actions = useCallActions(activeCall, { onError: handleError });
  const duration = useCallDuration(activeCall);

  // Flatten the hook's CallEntry[] to the plain Call[] the context exposes.
  const calls = useMemo(() => callEntries.map((e) => e.call), [callEntries]);

  // Surface connection-state changes to the host, and clear a stale error banner
  // once we're connected again (guarded so clearError only fires on the actual
  // error→connected edge, not on every connected render).
  const prevConnectionRef = useRef(connection);
  useEffect(() => {
    onConnectionStateChange?.({ state: connection });
    if (connection === 'connected' && prevConnectionRef.current !== 'connected') {
      clearError();
    }
    prevConnectionRef.current = connection;
  }, [connection, onConnectionStateChange, clearError]);

  const value = useMemo<SoftphoneContextValue>(
    () => ({
      connection,
      calls,
      activeCall,
      incomingCalls,
      heldCalls,
      answerCall,
      switchToCall,
      actions,
      duration,
      consultCall,
      transferOriginal,
      lastError,
      clearError,
      startAttendedTransfer,
      completeAttendedTransfer,
      cancelAttendedTransfer,
      placeCall,
      dial: (destination: string) => {
        const target = destination.trim();
        if (target) void placeCall(target);
      },
      emergency,
      emergencyManagedByHost: !!emergencyAddressId,
      displayNumber,
      t,
      palette,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      connection,
      calls,
      activeCall,
      incomingCalls,
      heldCalls,
      answerCall,
      switchToCall,
      actions,
      duration,
      consultCall,
      transferOriginal,
      lastError,
      clearError,
      startAttendedTransfer,
      completeAttendedTransfer,
      cancelAttendedTransfer,
      placeCall,
      emergency,
      emergencyAddressId,
      palette,
      defaultCountry,
      locale,
    ]
  );

  return <SoftphoneContext.Provider value={value}>{children}</SoftphoneContext.Provider>;
}

/** Access the full softphone context. Throws when used outside the provider. */
export function useSoftphone(): SoftphoneContextValue {
  const ctx = useContext(SoftphoneContext);
  if (!ctx) {
    throw new Error(
      'Could not find softphone context; wrap your softphone UI in a <SoftphoneProvider>.'
    );
  }
  return ctx;
}

/** The active foreground call + its actions (build-your-own convenience). */
export function useActiveCall(): { activeCall: Call | null; actions: UseCallActions } {
  const { activeCall, actions } = useSoftphone();
  return { activeCall, actions };
}

/** The currently-ringing inbound call, or null. */
export function useIncomingCall(): Call | null {
  const { incomingCalls } = useSoftphone();
  // A ringing inbound never lives in `activeCall` (the multi-call model keeps
  // alerting calls in `incomingCalls` until answered), so read the list.
  return incomingCalls.find(isIncomingRinging) ?? null;
}

export { SoftphoneContext };
