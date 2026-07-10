/**
 * SoftphoneProvider (React Native) — the headless owner of the softphone
 * connection, the RN sibling of the web SoftphoneProvider with the SAME API.
 *
 * It owns the DialStackPhone (via the shared `useCall` brain), the E911 binding
 * flow, and the audio session (react-native-incall-manager, driven through the
 * onCallActivated/onCallEnded seam — the SDK core never depends on it), and
 * exposes all of it through context. The presentational components (DialPad /
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
  useCall,
  useCallActions,
  useCallDuration,
  useEmergencyBinding,
  isIncomingRinging,
  formatDisplayNumber,
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
  activeCall: Call | null;
  actions: UseCallActions;
  duration: string;
  placeCall: (destination: string) => Promise<void>;
  dial: (destination: string) => void;
  emergency: UseEmergencyBinding;
  emergencyManagedByHost: boolean;
  /** Format a raw number for display using the configured default country. */
  displayNumber: (value: string) => string;
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
  defaultCountry = 'US',
  onConnectionStateChange,
  onIncomingCall,
  onCallStarted,
  onCallEnded,
  onError,
  children,
}: SoftphoneProviderProps): React.JSX.Element {
  // Memoize so the palette keeps a stable identity across renders — it flows
  // into the context value and is the dep of each child's makeStyles(palette)
  // memo, so recomputing it every render would rebuild every StyleSheet on every
  // render (e.g. once/sec during a call from the duration tick).
  const palette = useMemo(() => resolveSoftphonePalette(appearance), [appearance]);
  const displayNumber = (v: string) => formatDisplayNumber(v, defaultCountry);

  // network.changed must reach useEmergencyBinding, created after useCall.
  const onNetworkChangedRef = useRef<() => void>(() => {});

  const {
    connection,
    activeCall,
    placeCall,
    listEmergencyAddresses,
    setEmergencyAddress,
    selectEmergencyAddress,
    clearEmergencyAddressRegisteredIp,
    reconnect,
  } = useCall({
    token,
    apiBaseUrl,
    emergencyAddressId,
    autoConnect,
    onIncomingCall,
    onCallStarted,
    onCallEnded,
    onError,
    onNetworkChanged: () => onNetworkChangedRef.current(),
    // RN owns the audio session for the call's duration (earpiece by default;
    // the user can flip to speaker). The SDK core never depends on this.
    onCallActivated: () => {
      InCallManager.start({ media: 'audio' });
    },
  });

  // Release the audio session when the foreground call ends. Kept separate from
  // useCall's onCallEnded prop so a host-supplied onCallEnded still fires too.
  // The cleanup ALSO stops the session if the provider unmounts (or the call
  // changes) while a call is still live — otherwise the earpiece/proximity
  // session started in onCallActivated would leak past the call.
  useEffect(() => {
    if (!activeCall) return;
    const call = activeCall;
    const stop = () => InCallManager.stop();
    call.on('ended', stop);
    return () => {
      call.off('ended', stop);
      if (call.state !== 'ended') InCallManager.stop();
    };
  }, [activeCall]);

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

  const actions = useCallActions(activeCall, { onError });
  const duration = useCallDuration(activeCall);

  useEffect(() => {
    onConnectionStateChange?.({ state: connection });
  }, [connection, onConnectionStateChange]);

  const value = useMemo<SoftphoneContextValue>(
    () => ({
      connection,
      activeCall,
      actions,
      duration,
      placeCall,
      dial: (destination: string) => {
        const target = destination.trim();
        if (target) void placeCall(target);
      },
      emergency,
      emergencyManagedByHost: !!emergencyAddressId,
      displayNumber,
      palette,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      connection,
      activeCall,
      actions,
      duration,
      placeCall,
      emergency,
      emergencyAddressId,
      palette,
      defaultCountry,
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
  const { activeCall } = useSoftphone();
  return activeCall && isIncomingRinging(activeCall) ? activeCall : null;
}

export { SoftphoneContext };
