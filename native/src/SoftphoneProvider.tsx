/** SoftphoneProvider (React Native), same API as the web provider. */

import React, { useEffect, useMemo } from 'react';
import { AppState, Vibration, type AppStateStatus } from 'react-native';
import InCallManager from 'react-native-incall-manager';

import { nativeSignalingSocket } from './nativeSignalingSocket';
import type { NativeCallBridge } from './bridge/NativeCallBridge';
import { type CountryCode } from 'libphonenumber-js';
import {
  SoftphoneProviderBase,
  SoftphoneContext,
  useSoftphoneBase,
  selectIncomingCall,
  resolveSoftphonePalette,
  type SoftphoneContextBase,
  type Locale,
  type UseCallActions,
  type UseEmergencyBinding,
  type SoftphoneConnectionState,
  type Call,
  type CallEndReason,
  type DialStackPhone,
  type EmergencyAddressInput,
  type PlatformStorage,
  type Ringback,
  type AppResumeSubscribe,
} from '@dialstack/sdk-react/core';

// Derived from the resolver, not imported from the SDK root, which would pull
// the web component graph into RN.
type AppearanceOptions = Parameters<typeof resolveSoftphonePalette>[0];

// Outbound ringback for RN: WebAudio's AudioContext (the core's default) doesn't
// exist on RN. Every call is guarded because the core never guards the call site.
class InCallManagerRingback implements Ringback {
  private playing = false;

  get isPlaying(): boolean {
    return this.playing;
  }

  start(): void {
    if (this.playing) return;
    try {
      InCallManager.startRingback('_DTMF_');
      this.playing = true;
    } catch {
      // Best-effort.
    }
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    try {
      InCallManager.stopRingback();
    } catch {
      // Best-effort.
    }
  }
}

const nativeRingback: Ringback = new InCallManagerRingback();

// RN has no `document`, so the core's DOM foreground-resume default can't fire.
// The transport uses this to re-verify the connection on foreground (the OS may
// have torn the socket down while backgrounded).
const nativeAppResume: AppResumeSubscribe = (cb) => {
  const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
    if (s === 'active') cb();
  });
  return () => sub.remove();
};

export type ConnectionState = SoftphoneConnectionState;

export interface SoftphoneProviderProps {
  /**
   * Adopt an existing phone instead of constructing one from `token`, for a
   * native call surface where a call can exist before any phone does. Neither
   * connected nor disconnected by the provider.
   */
  existingPhone?: DialStackPhone | null;
  /** WebRTC user session token. */
  token: string;
  /**
   * Persistence for the selected E911 address id. REQUIRED on RN: the SDK takes
   * no persistence dependency of its own. A synchronous in-memory adapter is
   * valid if you don't need persistence.
   */
  storage: PlatformStorage;
  /** API base URL (defaults to the SDK's production endpoint). */
  apiBaseUrl?: string;
  /**
   * Called shortly before the session token expires. Return a fresh token; the
   * SDK delivers it in-band with no reconnect. On reject the SDK keeps the
   * still-valid connection and surfaces an `error`.
   */
  onTokenExpiring?: () => Promise<string>;
  /** E911 address id to present on connect; when supplied the host manages E911
   *  and the built-in prompt is disabled. */
  emergencyAddressId?: string;
  /**
   * Device-location source for the E911 form's "Use my current location" action;
   * the host owns the permission prompt, geolocation, and reverse-geocoding.
   */
  locationProvider?: () => Promise<EmergencyAddressInput>;
  /** Connect automatically once mounted (default: true). */
  autoConnect?: boolean;
  /** Theming — the shared appearance surface. */
  appearance?: AppearanceOptions;
  /** Locale for UI strings (defaults to English). */
  locale?: Locale;
  /** Default country for number formatting. */
  defaultCountry?: CountryCode;
  onConnectionStateChange?: (event: { state: ConnectionState }) => void;
  onIncomingCall?: (event: {
    /** Handle for `callActionsFor()` / `answerCall()`, and what a host bridging
     *  to a native call UI binds its OS session to. */
    callId: string;
    from: string;
    fromName: string | null;
  }) => void;
  onCallStarted?: (event: { direction: 'inbound' | 'outbound'; peer: string }) => void;
  onCallEnded?: (event: { reason: CallEndReason }) => void;
  onError?: (event: { code: string; message: string }) => void;
  /**
   * The call bridge, when this app reports calls to the OS. Outbound placement
   * then goes through it, so the OS learns about the call BEFORE it is dialled —
   * on Android that report is what starts the foreground service, without which
   * backgrounding mid-dial lets the OS reap the process and drop the call.
   */
  bridge?: Pick<NativeCallBridge, 'call'>;
  children: React.ReactNode;
}

/** The native softphone context: the shared base plus the native-only
 *  `locationProvider`. */
export interface SoftphoneContextValue extends SoftphoneContextBase {
  /** Host-supplied device-location source for the E911 form, or undefined. */
  locationProvider: (() => Promise<EmergencyAddressInput>) | undefined;
}

export function SoftphoneProvider({
  existingPhone,
  token,
  storage,
  apiBaseUrl,
  onTokenExpiring,
  emergencyAddressId,
  locationProvider,
  autoConnect = true,
  appearance,
  locale,
  defaultCountry = 'US',
  onConnectionStateChange,
  onIncomingCall,
  onCallStarted,
  onCallEnded,
  onError,
  bridge,
  children,
}: SoftphoneProviderProps): React.JSX.Element {
  // Stable identity so the base's context-value memo isn't busted every render.
  const extra = useMemo(() => ({ locationProvider }), [locationProvider]);

  // The bridge's BridgeCall is structurally the webrtc Call the softphone renders
  // — the port is narrow on purpose, so the two types are decoupled by design
  // rather than by accident.
  const placeOutbound = useMemo(
    () => (bridge ? (destination: string) => bridge.call(destination) as Promise<Call> : undefined),
    [bridge]
  );

  return (
    <SoftphoneProviderBase
      existingPhone={existingPhone}
      token={token}
      storage={storage}
      ringback={nativeRingback}
      createSignalingSocket={nativeSignalingSocket}
      onAppResume={nativeAppResume}
      apiBaseUrl={apiBaseUrl}
      onTokenExpiring={onTokenExpiring}
      emergencyAddressId={emergencyAddressId}
      autoConnect={autoConnect}
      appearance={appearance}
      locale={locale}
      defaultCountry={defaultCountry}
      onConnectionStateChange={onConnectionStateChange}
      onIncomingCall={onIncomingCall}
      onCallStarted={onCallStarted}
      onCallEnded={onCallEnded}
      onError={onError}
      placeOutbound={placeOutbound}
      extra={extra}
    >
      <NativeAudioSession osOwnsCallAudio={bridge !== undefined} />
      {children}
    </SoftphoneProviderBase>
  );
}

/**
 * Ringtone and audio-session ownership.
 *
 * `osOwnsCallAudio` is the whole story: with a call bridge, Telecom/CallKit is
 * already ringing the phone and already owns the mode, so doing either here is
 * not just duplicated — it breaks capture. InCallManager's ringtone puts the
 * device in MODE_RINGTONE, and WebRTC cannot initialise the recorder in that
 * mode: it releases it and never rebuilds, so the answered call has no
 * microphone. Only inbound calls have a ringing phase, which is why outbound
 * always worked and inbound never did.
 */
function NativeAudioSession({ osOwnsCallAudio }: { osOwnsCallAudio: boolean }): null {
  const { calls, incomingRinging } = useSoftphoneBase();
  // Hold the session while ANY call is connected so switching/promoting calls
  // doesn't drop the route. Left to the OS when it owns the call.
  const hasConnectedCall = !osOwnsCallAudio && calls.some((c) => c.isConnected);
  useEffect(() => {
    if (!hasConnectedCall) return;
    InCallManager.start({ media: 'audio' });
    return () => InCallManager.stop();
  }, [hasConnectedCall]);

  useEffect(() => {
    if (osOwnsCallAudio || !incomingRinging) return;
    // Pass a NON-array vibrate arg so InCallManager skips its own one-shot
    // vibrate: that path can't loop and, given any array, crashes on Android 14+
    // (all-zero [0] waveform rejected). We drive the repeating vibration below.
    InCallManager.startRingtone('_DEFAULT_', 0, '', -1);
    // Guarded: Android enforces VIBRATE by throwing, and an unguarded throw here
    // would escape before the cleanup is registered, stranding the ringtone past
    // answer/decline.
    try {
      Vibration.vibrate([0, 800, 800], true);
    } catch {
      // Missing android.permission.VIBRATE — ring without haptics.
    }
    return () => {
      Vibration.cancel();
      InCallManager.stopRingtone();
    };
  }, [incomingRinging, osOwnsCallAudio]);
  return null;
}

/** Access the full softphone context. Throws when used outside the provider. */
export function useSoftphone(): SoftphoneContextValue {
  return useSoftphoneBase<SoftphoneContextValue>();
}

/** The active foreground call + its actions (build-your-own convenience). */
export function useActiveCall(): { activeCall: Call | null; actions: UseCallActions } {
  const { activeCall, actions } = useSoftphone();
  return { activeCall, actions };
}

/** The currently-ringing inbound call, or null. */
export function useIncomingCall(): Call | null {
  const { incomingCalls } = useSoftphone();
  return selectIncomingCall(incomingCalls);
}

export { SoftphoneContext };
export type { UseEmergencyBinding };
