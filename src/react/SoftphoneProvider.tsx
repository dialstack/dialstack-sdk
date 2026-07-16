/**
 * SoftphoneProvider — the headless owner of the softphone connection.
 *
 * This is the piece that makes the SDK's softphone composable. It owns the
 * `DialStackPhone` (via the shared `useCalls` brain), the E911 binding flow, the
 * remote-audio `<audio>` element, and the single scoped stylesheet — and exposes
 * all of it through context. The presentational components (`<DialPad>`,
 * `<IncomingCall>`, `<OngoingCall>`) and the batteries-included `<Softphone>`
 * read from that context and own no connection themselves.
 *
 * Why this matters: because the connection lives here (not in a visual
 * component), a consumer can keep the phone connected app-wide while mounting the
 * call UI only when there's a call — e.g. rendering `<IncomingCall>` inside a
 * drawer that unmounts when closed — without ever dropping the WebRTC session.
 * The provider renders nothing visible except the persistent `<audio>` element
 * and the injected `<style>`; its children are wrapped in the scoped container so
 * the shared `.ds-*` styles apply.
 *
 * This mirrors the existing `DialstackComponentsProvider` idiom: a context, a
 * `<SoftphoneProvider>`, and accessor hooks that throw when used outside it.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useCalls,
  useCallActions,
  useCallDuration,
  useEmergencyBinding,
  useLastError,
  isIncomingRinging,
  shouldRingIncoming,
  formatDisplayNumber,
  type UseCallActions,
  type UseEmergencyBinding,
  type SoftphoneConnectionState,
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

/** The full softphone context, consumed by the presentational components. */
export interface SoftphoneContextValue {
  /** Connection lifecycle state. */
  connection: SoftphoneConnectionState;
  /**
   * Every live call leg — the active call, any held calls, and any ringing
   * inbound calls. Feed this to `selectLayout` for the composite multi-call view;
   * `activeCall`/`incomingCalls`/`heldCalls` are conveniences derived from it.
   */
  calls: Call[];
  /** The single foreground (active) call the UI represents, or null when idle. */
  activeCall: Call | null;
  /**
   * Ringing inbound calls not yet answered — a call-waiting interrupt during an
   * active call, or one or more concurrent inbound calls while idle. The UI shows
   * these as (compact when >1) answer/decline cards; answering holds the active
   * call and makes the answered one active.
   */
  incomingCalls: Call[];
  /**
   * Held (backgrounded) answered calls the user can switch back to — excludes
   * ringing inbound calls. Rendered as a switchable list during an active call.
   */
  heldCalls: Call[];
  /**
   * Answer a specific ringing inbound call: holds the current active call (if any)
   * and makes the answered call active. Route incoming-card answers through this,
   * not `actions.answer`, so the auto-hold happens.
   */
  answerCall: (call: Call) => void;
  /**
   * Switch the active call to an already-answered held call: holds the current
   * active call and resumes the target. No-op if it's already active.
   */
  switchToCall: (call: Call) => void;
  /** Per-call actions (answer/hangup/hold/mute/dtmf/transfer + overlay flags). */
  actions: UseCallActions;
  /** Live call duration string (ticks while the call is active). */
  duration: string;
  /**
   * The consult leg of an in-progress attended transfer, or null. While set,
   * `activeCall` is the live consult leg and `transferOriginal` is the held
   * original party.
   */
  consultCall: Call | null;
  /** The held original party during an attended transfer (opposite consultCall), or null. */
  transferOriginal: Call | null;
  /** Attended transfer: hold the active call and dial `destination` as a consult. */
  startAttendedTransfer: (destination: string) => Promise<void>;
  /** Attended transfer: bridge the held original to the consult party. */
  completeAttendedTransfer: () => void;
  /** Attended transfer: hang up the consult and resume the held original. */
  cancelAttendedTransfer: () => void;
  /** Place an outbound call (used by the dial pad). */
  placeCall: (destination: string) => Promise<void>;
  /**
   * Place an outbound call from elsewhere in the host app (click-to-call).
   * Same as `placeCall` but named for the imperative host use case.
   */
  dial: (destination: string) => void;
  /** The E911 binding state + actions (unbound → prompt, confirm, create). */
  emergency: UseEmergencyBinding;
  /** True when the host supplies an emergencyAddressId (built-in prompt off). */
  emergencyManagedByHost: boolean;
  /**
   * The last call/connection error surfaced to the user, or null. The built-in
   * UI shows this so a failed dial isn't silent; `clearError()` dismisses it.
   */
  lastError: { code: string; message: string } | null;
  /** Dismiss the current `lastError`. */
  clearError: () => void;
  /** Locale string accessor for the `softphone` namespace. */
  t: (key: keyof Locale['softphone']) => string;
  /** Format a raw number for display using the configured default country. */
  displayNumber: (value: string) => string;
  /** The scoped class name that wraps the softphone UI (for `.ds-*` styles). */
  scope: string;
}

/**
 * The softphone context. Exported so `<Softphone>` can detect whether it is
 * already inside a provider (and avoid mounting a second one). Consumers should
 * use `useSoftphone()` rather than reading this directly.
 */
export const SoftphoneContext = createContext<SoftphoneContextValue | null>(null);

/**
 * Provides the softphone connection + state to its children. Owns the phone, the
 * remote-audio element, the scoped stylesheet, and the E911 flow.
 *
 * @example
 * ```tsx
 * <SoftphoneProvider token={webrtcToken}>
 *   <Softphone />
 * </SoftphoneProvider>
 *
 * // build-your-own: render pieces conditionally; the phone stays connected
 * <SoftphoneProvider token={webrtcToken}>
 *   {incoming ? <IncomingCall /> : <DialPad />}
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

  // Last error surfaced to the user (shared hook so web + RN can't drift): wraps
  // the host onError — it still fires for the host, and the error is also stored
  // locally so the built-in banner can show it. Cleared on a successful reconnect.
  const { lastError, handleError, clearError } = useLastError(onError);
  const scope = `ds-softphone-${useId().replace(/[:]/g, '')}`;

  // Theming, following the rest of the SDK: when the softphone is rendered inside
  // a <DialstackComponentsProvider>, subscribe to live appearance updates
  // (`dialstack.update({ appearance })`) like DialPlan/CallLogs/etc. via
  // useAppearance. The softphone can ALSO run standalone (token only, no
  // provider) — so the context is read optionally and the `appearance` prop is
  // the fallback. An explicit prop overrides the instance appearance (matching
  // DialPlan's `props.theme ?? instanceTheme`).
  const componentsCtx = useContext(DialstackComponentsContext);
  const [instanceAppearance, setInstanceAppearance] = useState<AppearanceOptions | undefined>(() =>
    componentsCtx?.dialstack.getAppearance()
  );
  const effectiveAppearance = appearance ?? instanceAppearance;
  // Content key so a host passing an inline `appearance={{ theme: 'dark' }}`
  // literal (a new object each render) doesn't bust the styles memo below and
  // re-serialize the whole stylesheet on every render (incl. every duration tick).
  const appearanceKey = `${effectiveAppearance?.theme ?? ''}|${JSON.stringify(
    effectiveAppearance?.variables ?? {}
  )}`;
  const t = (k: keyof Locale['softphone']) => locale.softphone[k];
  const defaultCountry = (formatting?.defaultCountry ?? 'US') as Parameters<
    typeof formatDisplayNumber
  >[1];
  const displayNumber = (v: string) => formatDisplayNumber(v, defaultCountry);

  // The phone's `network.changed` (server denied the emergency address for this
  // network) must reach useEmergencyBinding, which is created AFTER useCalls. A
  // ref breaks the cycle: useCalls calls a stable wrapper that forwards to the
  // hook's handler once it exists.
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
    onTokenExpiring,
    iceServers,
    emergencyAddressId,
    autoConnect,
    onIncomingCall,
    onCallStarted,
    onCallEnded,
    onError: handleError,
    onNetworkChanged: () => onNetworkChangedRef.current(),
  });

  // Per-user E911 binding, driven through the SAME phone the call session owns
  // (no second connection). Disabled when the host manages E911 itself.
  const emergency = useEmergencyBinding({
    disabled: !!emergencyAddressId,
    connection,
    // The token identifies the session's user; on a shared client a token change
    // is a user switch and the binding state must reset (no stale E911 unlock).
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

  // Surface connection-state changes to the host, and clear a stale error banner
  // once we're connected again (guarded so setState only fires on the actual
  // error→connected edge, not on every connected render).
  const prevConnectionRef = useRef(connection);
  useEffect(() => {
    onConnectionStateChange?.({ state: connection });
    if (connection === 'connected' && prevConnectionRef.current !== 'connected') {
      clearError();
    }
    prevConnectionRef.current = connection;
  }, [connection, onConnectionStateChange, clearError]);

  // Bind remote audio to the persistent <audio> element. This lives in the
  // provider (not a swappable UI component) so audio survives the call UI
  // mounting/unmounting — the whole point of the composable split.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!activeCall) {
      el.srcObject = null;
      return;
    }
    el.srcObject = activeCall.remoteMediaStream;

    // Attempt playback, and surface a persistent failure — a silently muted
    // answered call is worse than a visible error. Autoplay policy only lets us
    // report AFTER a user gesture, so we report only once the call is active
    // (answered), never while it's still ringing pre-gesture:
    //   - If the call is already active when this effect runs (it became
    //     `activeCall` on answer — the multi-call model, where a ringing inbound
    //     lives outside `activeCall`), the first attempt is post-gesture → report
    //     on failure.
    //   - If the call is still ringing (it's `activeCall` while alerting — the
    //     single-call model), the first attempt is pre-gesture → don't report;
    //     retry on the `answered` event (the user's Answer tap) and report then.
    // Answering mutates the SAME Call (identity unchanged), so the effect won't
    // re-run on its own — hence the explicit `answered` listener.
    const call = activeCall;
    let done = false;
    const tryPlay = (reportOnFail: boolean) => {
      void el.play().then(
        () => {
          done = true;
        },
        () => {
          if (reportOnFail && !done) {
            onError?.({
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
  }, [activeCall, onError]);

  // Play the incoming-call ringtone while an inbound call is ringing (the SDK
  // core only synthesizes outbound *ringback*; the inbound ring is the UI
  // layer's job). Keyed on the derived ringing flag so it re-evaluates when the
  // call transitions ringing→active (a same-identity mutation). Stops on answer,
  // end, or unmount.
  const ringtoneRef = useRef<IncomingRingtone | null>(null);
  if (ringtoneRef.current === null) ringtoneRef.current = new IncomingRingtone();
  // Ring while ANY inbound call is alerting — a call-waiting interrupt during an
  // active call rings too, not just an idle inbound one. `incomingCalls` is
  // exactly the ringing subset (see useCalls).
  const incomingRinging = shouldRingIncoming(incomingCalls);
  useEffect(() => {
    const ringtone = ringtoneRef.current;
    if (!ringtone) return;
    if (incomingRinging) ringtone.start();
    else ringtone.stop();
    return () => ringtone.stop();
  }, [incomingRinging]);

  // Flatten the hook's CallEntry[] to the plain Call[] the context exposes (the
  // layout input). Memoized on the entry list so its identity is stable across
  // renders that don't change the call set.
  const calls = useMemo(() => callEntries.map((e) => e.call), [callEntries]);

  const styles = useMemo(
    () => buildSoftphoneStyles(resolveSoftphonePalette(effectiveAppearance), scope),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on appearance CONTENT (appearanceKey), not object identity, so an inline literal doesn't re-serialize the stylesheet every render
    [appearanceKey, scope]
  );

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
      lastError,
      clearError,
      t,
      displayNumber,
      scope,
    }),
    // `t`/`displayNumber` are recomputed from locale/formatting each render; the
    // meaningful identity drivers are the state + stable callbacks below.
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
      startAttendedTransfer,
      completeAttendedTransfer,
      cancelAttendedTransfer,
      placeCall,
      emergency,
      emergencyAddressId,
      lastError,
      clearError,
      scope,
      locale,
      formatting,
    ]
  );

  return (
    <SoftphoneContext.Provider value={value}>
      {/* Subscribe to live instance appearance only when a components provider is
          present. Rendered as a child (not an inline hook) so useAppearance is
          called unconditionally there — never when standalone. */}
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
    </SoftphoneContext.Provider>
  );
};

// Bridges live appearance updates from the DialStack instance into the provider.
// Mounted only when a <DialstackComponentsProvider> is present, so the shared
// useAppearance hook (which requires an instance) is used exactly as every other
// SDK component uses it. Renders nothing.
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
export const useSoftphone = (): SoftphoneContextValue => {
  const ctx = useContext(SoftphoneContext);
  if (!ctx) {
    throw new Error(
      'Could not find softphone context; wrap your softphone UI in a <SoftphoneProvider>. ' +
        'See https://docs.dialstack.ai/sdk/react for setup instructions.'
    );
  }
  return ctx;
};

/**
 * The active foreground call and its actions, or `activeCall: null` when idle.
 * A convenience accessor for the build-your-own path.
 *
 * @throws {Error} If used outside of `<SoftphoneProvider>`.
 */
export const useActiveCall = (): { activeCall: Call | null; actions: UseCallActions } => {
  const { activeCall, actions } = useSoftphone();
  return { activeCall, actions };
};

/**
 * The currently-ringing inbound call, or `null`. Lets a host open a drawer / ring
 * a UI on an incoming call without keeping the call UI mounted.
 *
 * @throws {Error} If used outside of `<SoftphoneProvider>`.
 */
export const useIncomingCall = (): Call | null => {
  const { incomingCalls } = useSoftphone();
  // A ringing inbound never lives in `activeCall` (the multi-call model keeps
  // alerting calls in `incomingCalls` until answered), so read the list.
  return incomingCalls.find(isIncomingRinging) ?? null;
};
