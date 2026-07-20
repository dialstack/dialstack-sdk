/**
 * SoftphoneProvider (React Native), same API as the web provider. Shared wiring
 * lives in SoftphoneProviderBase (from `@dialstack/sdk/react/core`); this
 * file adds only the native bits: the required `storage` adapter,
 * `locationProvider`, `appearance`/`defaultCountry`, and the InCallManager audio
 * session + ringtone.
 */

import React, { useEffect, useMemo } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import { type CountryCode } from 'libphonenumber-js';
import {
  SoftphoneProviderBase,
  SoftphoneContext,
  useSoftphoneBase,
  selectIncomingCall,
  resolveSoftphonePalette,
  type SoftphoneContextBase,
  type PlatformEffectState,
  type Locale,
  type UseCallActions,
  type UseEmergencyBinding,
  type SoftphoneConnectionState,
  type Call,
  type CallEndReason,
  type EmergencyAddressInput,
  type PlatformStorage,
  type Ringback,
  type AppResumeSubscribe,
  type SignalingSocketFactory,
} from '@dialstack/sdk/react/core';

// Derive the appearance type from the theme resolver rather than importing it
// from the SDK root (which would pull the web component graph into RN).
type AppearanceOptions = Parameters<typeof resolveSoftphonePalette>[0];

/**
 * Outbound ringback for React Native. WebAudio's `AudioContext` (the web core's
 * default `RingbackTone`) doesn't exist on RN, so the synthetic tone is produced
 * by react-native-incall-manager instead. Supplied to the core via
 * `PhoneOptions.ringback`. Every call is guarded so a missing/older InCallManager
 * degrades to a silent no-op rather than throwing — the core (call.ts) never
 * guards the call site. Stateless beyond `playing`, so one shared instance backs
 * every call (outbound ringback plays one call at a time).
 */
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
      // No InCallManager / unsupported — ringback is best-effort.
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

// One shared instance backs every call — see the class doc above.
const nativeRingback: Ringback = new InCallManagerRingback();

// The signaling ingress 403s a handshake with no `User-Agent`. iOS's WebSocket
// (SocketRocket) sends none by default, so we set one explicitly. RN's WebSocket
// takes a third `options` arg the DOM type doesn't declare; hence the cast.
const NATIVE_USER_AGENT = 'dialstack-sdk (react-native)';

const nativeSignalingSocket: SignalingSocketFactory = (url, protocols) => {
  const RNWebSocket = globalThis.WebSocket as unknown as new (
    url: string,
    protocols: string[],
    options: { headers: Record<string, string> }
  ) => WebSocket;
  return new RNWebSocket(url, protocols, {
    headers: { 'User-Agent': NATIVE_USER_AGENT },
  });
};

// React Native has no `document`, so the web core's DOM-lifecycle default for
// detecting a foreground resume can't fire. Supply an AppState-backed variant:
// the transport uses it to re-verify the connection when the app returns to the
// foreground (the OS may have torn the socket down while backgrounded).
const nativeAppResume: AppResumeSubscribe = (cb) => {
  const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
    if (s === 'active') cb();
  });
  return () => sub.remove();
};

export type ConnectionState = SoftphoneConnectionState;

export interface SoftphoneProviderProps {
  /** WebRTC user session token. */
  token: string;
  /**
   * Persistence for the selected E911 address id, so it survives app restarts.
   * REQUIRED on React Native: the SDK takes no persistence dependency of its own
   * (react-native-mmkv and AsyncStorage vary by version/architecture and can't be
   * defaulted safely), so the host supplies a small `PlatformStorage` adapter —
   * typically MMKV- or AsyncStorage-backed. See the example apps for reference
   * adapters; a synchronous in-memory adapter is also valid if you don't need
   * persistence. It only stores the E911 id, nothing sensitive.
   */
  storage: PlatformStorage;
  /** API base URL (defaults to the SDK's production endpoint). */
  apiBaseUrl?: string;
  /**
   * Called shortly before the session token expires (about 60 seconds ahead).
   * Return a fresh token minted by your backend; the SDK delivers it in-band over
   * the existing connection — no reconnect and no call disruption. If it rejects,
   * the SDK keeps the (still-valid) connection open and surfaces an `error`.
   */
  onTokenExpiring?: () => Promise<string>;
  /** Emergency (E911) address id to present on connect; when supplied the host
   *  manages E911 and the built-in prompt is disabled. */
  emergencyAddressId?: string;
  /**
   * Optional device-location source for the E911 form. When provided, the
   * built-in emergency-address form shows a "Use my current location" action
   * that calls this to prefill the address fields; the host owns the location
   * permission prompt, geolocation, and reverse-geocoding. Omit for manual entry.
   */
  locationProvider?: () => Promise<EmergencyAddressInput>;
  /** Connect automatically once mounted (default: true). */
  autoConnect?: boolean;
  /** Theming — the shared appearance surface (same as the web softphone). */
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

/**
 * The native softphone context: the shared base plus the native-only
 * `locationProvider`. (`palette` is on the base — computed identically to web.)
 */
export interface SoftphoneContextValue extends SoftphoneContextBase {
  /** Host-supplied device-location source for the E911 form, or undefined. */
  locationProvider: (() => Promise<EmergencyAddressInput>) | undefined;
}

export function SoftphoneProvider({
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
  children,
}: SoftphoneProviderProps): React.JSX.Element {
  // `use*`-named so rules-of-hooks accepts the hooks inside; the base calls it
  // unconditionally each render, keeping hook order stable.
  const useNativePlatformEffects = ({ callEntries, incomingRinging }: PlatformEffectState) => {
    // Hold the audio session while ANY call is connected (not just the foreground
    // one) so switching/promoting calls doesn't drop the route.
    const hasConnectedCall = callEntries.some((e) => e.call.isConnected);
    useEffect(() => {
      if (!hasConnectedCall) return;
      InCallManager.start({ media: 'audio' });
      return () => InCallManager.stop();
    }, [hasConnectedCall]);

    useEffect(() => {
      if (incomingRinging) InCallManager.startRingtone('_DEFAULT_', [0], '', -1);
      else InCallManager.stopRingtone();
      return () => InCallManager.stopRingtone();
    }, [incomingRinging]);
  };

  // Stable `extra` identity so the base's context-value memo isn't busted every
  // render by a fresh object literal.
  const extra = useMemo(() => ({ locationProvider }), [locationProvider]);

  return (
    <SoftphoneProviderBase
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
      platformEffects={useNativePlatformEffects}
      extra={extra}
    >
      {children}
    </SoftphoneProviderBase>
  );
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
