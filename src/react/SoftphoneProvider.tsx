/**
 * SoftphoneProvider (web). Shared wiring lives in SoftphoneProviderBase; this
 * file adds only the web bits: iceServers/formatting props, live appearance, the
 * scoped `<style>`, the persistent `<audio>` sink, and the WebAudio ringtone.
 */

import React, { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  SoftphoneProviderBase,
  SoftphoneContext as SharedSoftphoneContext,
  useSoftphoneBase,
  selectIncomingCall,
  type SoftphoneContextBase,
  type PlatformEffectState,
} from './softphone-provider';
import {
  formatDisplayNumber,
  type SoftphoneConnectionState,
  type UseCallActions,
} from './softphone-hooks';
import { resolveSoftphonePalette } from '../components/softphone-theme';
import { buildSoftphoneStyles } from '../components/softphone-styles';
import { IncomingRingtone } from './softphone/ringtone';
import { DialstackComponentsContext } from './DialstackComponentsProvider';
import { useAppearance } from './useAppearance';
import { defaultLocale, type Locale } from '../locales';
import type { AppearanceOptions, DialStackInstance, FormattingOptions } from '../types';
import type { Call, CallEndReason } from '../webrtc';

export type { SoftphoneConnectionState };

export interface SoftphoneProviderProps {
  /**
   * WebRTC user session token. The provider constructs a `DialStackPhone` with it
   * and connects. Changing the token reconnects with the new credentials.
   */
  token: string;

  /** API base URL (defaults to the SDK's production endpoint). */
  apiBaseUrl?: string;

  /**
   * Called shortly before the session token expires (about 60 seconds ahead).
   * Return a fresh token minted by your backend; the SDK delivers it in-band over
   * the existing connection — no reconnect and no call disruption. If it rejects,
   * the SDK keeps the (still-valid) connection open and surfaces an `error`.
   */
  onTokenExpiring?: () => Promise<string>;

  /** Override the ICE servers instead of fetching them from the API. */
  iceServers?: RTCIceServer[];

  /**
   * Emergency (E911) address id to present on connect for outbound PSTN. When
   * supplied, the host is managing E911 itself and the built-in "Are you here?"
   * location prompt is disabled. When omitted, the softphone owns the E911 flow.
   */
  emergencyAddressId?: string;

  /** Connect automatically once mounted (default: true). */
  autoConnect?: boolean;

  /** Theming — the same appearance surface used across the SDK. */
  appearance?: AppearanceOptions;

  /** Locale for UI strings. */
  locale?: Locale;

  /** Formatting options (e.g. `defaultCountry` for number display). */
  formatting?: FormattingOptions;

  /** Fired when the connection lifecycle changes. */
  onConnectionStateChange?: (event: { state: SoftphoneConnectionState }) => void;

  /** Fired when an inbound call arrives. */
  onIncomingCall?: (event: { from: string; fromName: string | null }) => void;

  /** Fired when a call (in or out) becomes the foreground call. */
  onCallStarted?: (event: { direction: 'inbound' | 'outbound'; peer: string }) => void;

  /** Fired when the foreground call ends. */
  onCallEnded?: (event: { reason: CallEndReason }) => void;

  /** Fired on a non-fatal or fatal phone error. */
  onError?: (event: { code: string; message: string }) => void;

  /** The softphone UI (or anything that consumes the context). */
  children: React.ReactNode;
}

/**
 * The web softphone context: the shared base plus the web-only `scope` (the CSS
 * class the `.ds-*` styles are nested under). Native adds `locationProvider`
 * instead; components read only the fields their platform provides.
 */
export interface SoftphoneContextValue extends SoftphoneContextBase {
  /** The scoped class name that wraps the softphone UI (for `.ds-*` styles). */
  scope: string;
}

/**
 * The softphone context. Exported so `<Softphone>` can detect whether it is
 * already inside a provider. Consumers should use `useSoftphone()`. This is the
 * SAME context object the shared base populates.
 */
export const SoftphoneContext = SharedSoftphoneContext;

/**
 * Provides the softphone connection + state to its children. Owns the phone, the
 * remote-audio element, the scoped stylesheet, and the E911 flow.
 *
 * @example
 * ```tsx
 * <SoftphoneProvider token={webrtcToken}>
 *   <Softphone />
 * </SoftphoneProvider>
 * ```
 */
export const SoftphoneProvider: React.FC<SoftphoneProviderProps> = ({
  token,
  apiBaseUrl,
  onTokenExpiring,
  iceServers,
  emergencyAddressId,
  autoConnect = true,
  appearance,
  locale = defaultLocale,
  formatting,
  onConnectionStateChange,
  onIncomingCall,
  onCallStarted,
  onCallEnded,
  onError,
  children,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scope = `ds-softphone-${useId().replace(/[:]/g, '')}`;
  // Stable `extra` identity so the base's context-value memo isn't busted every
  // render by a fresh object literal (`scope` is stable — useId never changes).
  const extra = useMemo(() => ({ scope }), [scope]);

  // Theming: when rendered inside a <DialstackComponentsProvider>, subscribe to
  // live appearance updates (`dialstack.update({ appearance })`) like the rest of
  // the SDK; standalone (token only) falls back to the `appearance` prop. An
  // explicit prop overrides the instance appearance.
  const componentsCtx = useContext(DialstackComponentsContext);
  const [instanceAppearance, setInstanceAppearance] = useState<AppearanceOptions | undefined>(() =>
    componentsCtx?.dialstack.getAppearance()
  );
  const effectiveAppearance = appearance ?? instanceAppearance;
  // Content key so an inline `appearance={{ theme }}` literal (new object each
  // render) doesn't re-serialize the stylesheet every render.
  const appearanceKey = `${effectiveAppearance?.theme ?? ''}|${JSON.stringify(
    effectiveAppearance?.variables ?? {}
  )}`;
  const defaultCountry = (formatting?.defaultCountry ?? 'US') as Parameters<
    typeof formatDisplayNumber
  >[1];

  const styles = useMemo(
    () => buildSoftphoneStyles(resolveSoftphonePalette(effectiveAppearance), scope),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on appearance CONTENT, not object identity
    [appearanceKey, scope]
  );

  const ringtoneRef = useRef<IncomingRingtone | null>(null);
  if (ringtoneRef.current === null) ringtoneRef.current = new IncomingRingtone();
  // `use*`-named so rules-of-hooks accepts the hooks inside; the base calls it
  // unconditionally each render, keeping hook order stable.
  const useWebPlatformEffects = ({
    activeCall,
    incomingRinging,
    onError: reportError,
  }: PlatformEffectState) => {
    useEffect(() => {
      const ringtone = ringtoneRef.current;
      if (!ringtone) return;
      if (incomingRinging) ringtone.start();
      else ringtone.stop();
      return () => ringtone.stop();
    }, [incomingRinging]);

    // Report autoplay failure only after a user gesture (answered), never while
    // ringing pre-gesture — a silently muted answered call is worse than an error.
    useEffect(() => {
      const el = audioRef.current;
      if (!el) return;
      if (!activeCall) {
        el.srcObject = null;
        return;
      }
      el.srcObject = activeCall.remoteMediaStream;
      const call = activeCall;
      let done = false;
      const tryPlay = (reportOnFail: boolean) => {
        void el.play().then(
          () => {
            done = true;
          },
          (err: unknown) => {
            // Surface any real playback failure, EXCEPT AbortError — that's the
            // benign teardown (srcObject cleared on hangup / new call), and reporting
            // it would flash a spurious "tap to enable sound" after every call. We
            // report all other names (not just NotAllowedError) so a decode/
            // unsupported-source failure on a non-standard WebView isn't swallowed.
            const name = (err as { name?: string })?.name;
            if (reportOnFail && !done && name !== 'AbortError') {
              reportError?.({
                code: 'audio_playback_blocked',
                message: 'Could not play call audio — tap the call to enable sound.',
              });
            }
          }
        );
      };
      tryPlay(call.state === 'active');
      const onAnswered = () => tryPlay(true);
      call.on('answered', onAnswered);
      return () => {
        call.off('answered', onAnswered);
      };
    }, [activeCall, reportError]);
  };

  return (
    <SoftphoneProviderBase
      token={token}
      apiBaseUrl={apiBaseUrl}
      onTokenExpiring={onTokenExpiring}
      iceServers={iceServers}
      emergencyAddressId={emergencyAddressId}
      autoConnect={autoConnect}
      appearance={effectiveAppearance}
      locale={locale}
      defaultCountry={defaultCountry}
      onConnectionStateChange={onConnectionStateChange}
      onIncomingCall={onIncomingCall}
      onCallStarted={onCallStarted}
      onCallEnded={onCallEnded}
      onError={onError}
      platformEffects={useWebPlatformEffects}
      extra={extra}
    >
      {/* Subscribe to live instance appearance only when a components provider is
          present, so useAppearance (which requires an instance) is used exactly
          as every other SDK component uses it. */}
      {componentsCtx && (
        <LiveAppearanceBridge
          dialstack={componentsCtx.dialstack}
          onChange={setInstanceAppearance}
        />
      )}
      <style>{styles}</style>
      {children}
      {/* Persistent remote-audio sink, owned here so it outlives the call UI. */}
      <audio ref={audioRef} autoPlay />
    </SoftphoneProviderBase>
  );
};

// Bridges live appearance updates from the DialStack instance into the provider.
// Mounted only when a <DialstackComponentsProvider> is present. Renders nothing.
function LiveAppearanceBridge({
  dialstack,
  onChange,
}: {
  dialstack: DialStackInstance;
  onChange: (a: AppearanceOptions | undefined) => void;
}): null {
  const appearance = useAppearance(dialstack);
  useEffect(() => {
    onChange(appearance);
  }, [appearance, onChange]);
  return null;
}

/**
 * Access the full softphone context.
 *
 * @throws {Error} If used outside of `<SoftphoneProvider>`.
 */
export const useSoftphone = (): SoftphoneContextValue => useSoftphoneBase<SoftphoneContextValue>();

/**
 * The active foreground call and its actions, or `activeCall: null` when idle.
 *
 * @throws {Error} If used outside of `<SoftphoneProvider>`.
 */
export const useActiveCall = (): { activeCall: Call | null; actions: UseCallActions } => {
  const { activeCall, actions } = useSoftphone();
  return { activeCall, actions };
};

/**
 * The currently-ringing inbound call, or `null`.
 *
 * @throws {Error} If used outside of `<SoftphoneProvider>`.
 */
export const useIncomingCall = (): Call | null => {
  const { incomingCalls } = useSoftphone();
  return selectIncomingCall(incomingCalls);
};
