/**
 * `usePhone` — sole owner of the softphone's `DialStackPhone` instance and its
 * connection lifecycle, web and React Native.
 *
 * It constructs the phone from credentials, subscribes to the connection events
 * (connected / reconnecting / disconnected / fatal error / network.changed),
 * maps them to a single `connection` state, and tears the phone down on unmount /
 * credential change. It does NOT know about call legs — call state lives in
 * `useCalls(phone, ...)`, and E911 provisioning in `useEmergencyBinding(phone, ...)`.
 * Both are handed the live `phone` this hook owns.
 *
 * It is platform-agnostic: it imports only the headless core (`../../webrtc`),
 * never the DOM or React Native.
 */

import { useEffect, useState } from 'react';
import { DialStackPhone, type PhoneError, type PhoneOptions } from '@dialstack/sdk-webrtc';
import { useLatestRef } from './useLatestRef';

// Phone construction goes through this factory so tests and Storybook can inject
// an in-memory phone without a live WebSocket. It defaults to the real phone and
// is NOT re-exported from the public `react.ts` barrel — `__setPhoneFactory` is
// an internal test/story seam, never part of the SDK's public API.
type PhoneFactory = (opts: PhoneOptions) => DialStackPhone;
let phoneFactory: PhoneFactory = (opts) => new DialStackPhone(opts);

/** @internal test/story seam — pass a factory to inject a mock phone, or null to restore the default. */
export function __setPhoneFactory(factory: PhoneFactory | null): void {
  phoneFactory = factory ?? ((opts) => new DialStackPhone(opts));
}

/** Connection lifecycle surfaced to the softphone UI. */
export type SoftphoneConnectionState =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface UsePhoneOptions extends PhoneOptions {
  /**
   * Adopt an EXISTING phone instead of constructing one from credentials — for
   * hosts where the phone outlives the UI (a push wake may already have answered
   * a call before the app opens). Without this the provider constructs a SECOND
   * phone, re-registers the same SIP AOR, and the in-progress call is invisible.
   *
   * An adopted phone is neither connected nor disconnected here, so navigating
   * away cannot drop a live call. Credential options are ignored while set.
   */
  existingPhone?: DialStackPhone | null;

  /**
   * Connect automatically once the phone is constructed (default: true). Set
   * false to render the UI without connecting yet (e.g. token still loading).
   */
  autoConnect?: boolean;

  /** Fired on a non-fatal or fatal phone error. */
  onError?: (e: { code: string; message: string }) => void;
}

export interface UsePhoneResult {
  /**
   * The live phone instance, or null before the first construct / while
   * disconnected with no credentials. Its IDENTITY changes on every reconnect
   * (credential change), which is the signal `useCalls` keys its per-call
   * listener wiring on.
   */
  phone: DialStackPhone | null;
  /** Connection lifecycle state. */
  connection: SoftphoneConnectionState;
}

/**
 * Construct and own a `DialStackPhone` and its connection lifecycle.
 * Reconstructs (and reconnects) whenever the credentials change.
 */
export function usePhone(options: UsePhoneOptions): UsePhoneResult {
  const { autoConnect = true, onError, existingPhone } = options;

  // Phone as state so dependents re-run their phone-keyed effects when a reconnect
  // swaps the instance. Written from the connect effect, never during render.
  const [phone, setPhone] = useState<DialStackPhone | null>(existingPhone ?? null);
  // Seed 'connecting' when autoConnect so the first render shows it without a
  // synchronous setState in the effect body. An adopted phone is already connected
  // by its owner, so seeding 'connecting' would render a spinner over a live call.
  const [connection, setConnection] = useState<SoftphoneConnectionState>(
    existingPhone
      ? existingPhone.isConnected
        ? 'connected'
        : existingPhone.isConnecting
          ? 'connecting'
          : autoConnect
            ? 'connecting'
            : 'idle'
      : autoConnect && options.token
        ? 'connecting'
        : 'idle'
  );

  // Non-credential options read through refs so a new inline value stays out of the
  // connect-effect deps and can't tear down + reconnect the socket mid-registration.
  const handlers = useLatestRef({ onError });
  const emergencyAddressIdRef = useLatestRef(options.emergencyAddressId);
  const iceServersRef = useLatestRef(options.iceServers);
  const storageRef = useLatestRef(options.storage);
  const ringbackRef = useLatestRef(options.ringback);
  const createSignalingSocketRef = useLatestRef(options.createSignalingSocket);
  const onAppResumeRef = useLatestRef(options.onAppResume);
  const onTokenExpiringRef = useLatestRef(options.onTokenExpiring);

  // Construct + connect the phone for the current credentials; reconnect on
  // credential change, tear down on unmount. Only credentials are deps.
  const { token, apiBaseUrl, signalingBaseUrl, autoReconnect } = options;
  useEffect(() => {
    // Adopted phone: subscribe to its lifecycle, but never construct, connect or
    // disconnect it. Disconnecting on unmount would drop a live call the host owns.
    if (existingPhone) {
      let adoptedDisposed = false;

      const guardAdopted = (fn: () => void) => () => {
        if (!adoptedDisposed) fn();
      };
      // Capture each handler so cleanup can off() it: the adopted phone outlives
      // this component, so leaving listeners attached leaks a fresh set of closures
      // on every remount (unlike the constructed-phone branch, whose listeners die
      // with the phone it disconnects).
      const onConnected = guardAdopted(() => setConnection('connected'));
      const onReconnecting = guardAdopted(() => setConnection('reconnecting'));
      const onDisconnected = guardAdopted(() => setConnection('disconnected'));
      const onErr = (err: PhoneError) => {
        if (adoptedDisposed) return;
        handlers.current.onError?.({ code: err.code, message: err.message });
        if (err.fatal) setConnection('error');
      };
      existingPhone.on('connected', onConnected);
      existingPhone.on('reconnected', onConnected);
      existingPhone.on('reconnecting', onReconnecting);
      existingPhone.on('disconnected', onDisconnected);
      existingPhone.on('error', onErr);

      // Connect if the host has not: a plain foreground launch hands over a
      // constructed-but-idle phone, and skipping this left the UI showing
      // 'connected' over a socket that was never opened, so the first outbound
      // call failed. Skip when a connect is already IN FLIGHT, or connect() throws
      // 'Phone is already connecting'. Still never DISCONNECT on unmount.
      if (autoConnect && !existingPhone.isConnected && !existingPhone.isConnecting) {
        existingPhone.connect().catch((err: unknown) => {
          if (adoptedDisposed) return;
          const e = err as PhoneError;
          handlers.current.onError?.({
            code: e?.code ?? 'internal_error',
            message: e?.message ?? String(err),
          });
          setConnection('error');
        });
      }

      // No setPhone(null): the phone outlives this UI, and nulling it would strand
      // dependents on a remount.
      return () => {
        adoptedDisposed = true;
        existingPhone.off('connected', onConnected);
        existingPhone.off('reconnected', onConnected);
        existingPhone.off('reconnecting', onReconnecting);
        existingPhone.off('disconnected', onDisconnected);
        existingPhone.off('error', onErr);
      };
    }

    if (!token) return;
    let disposed = false;
    const p = phoneFactory({
      token,
      apiBaseUrl,
      signalingBaseUrl,
      emergencyAddressId: emergencyAddressIdRef.current,
      iceServers: iceServersRef.current,
      storage: storageRef.current,
      ringback: ringbackRef.current,
      createSignalingSocket: createSignalingSocketRef.current,
      onAppResume: onAppResumeRef.current,
      autoReconnect,
      onTokenExpiring: onTokenExpiringRef.current
        ? () => {
            const cb = onTokenExpiringRef.current;
            if (!cb) return Promise.reject(new Error('onTokenExpiring not set'));
            return cb();
          }
        : undefined,
    });
    setPhone(p);

    const guard = (fn: () => void) => () => {
      if (!disposed) fn();
    };
    p.on(
      'connected',
      guard(() => setConnection('connected'))
    );
    p.on(
      'reconnected',
      guard(() => setConnection('connected'))
    );
    p.on(
      'reconnecting',
      guard(() => setConnection('reconnecting'))
    );
    p.on(
      'disconnected',
      guard(() => setConnection('disconnected'))
    );
    p.on('error', (err: PhoneError) => {
      if (disposed) return;
      handlers.current.onError?.({ code: err.code, message: err.message });
      if (err.fatal) setConnection('error');
    });

    if (autoConnect) {
      // Reset to 'connecting' for this (re)connect. The initial mount already
      // seeds 'connecting'; this matters on a credential change, when the effect
      // re-runs against a fresh phone and the prior state must reset.
      setConnection('connecting');
      p.connect().catch((err: PhoneError) => {
        // transport_closed is the phone aborting its own connect (our disconnect
        // during teardown / reconnect); expected, swallow it. Other codes are real
        // failures and must surface even at teardown.
        if (err?.code === 'transport_closed') return;
        handlers.current.onError?.({
          code: err?.code ?? 'internal_error',
          message: err?.message ?? String(err),
        });
        if (!disposed) setConnection('error');
      });
    }

    return () => {
      disposed = true;
      p.disconnect();
      setPhone(null);
      setConnection('idle');
    };
    // The *Ref deps are stable useLatestRef containers, so listing them satisfies
    // exhaustive-deps without ever retriggering; only credentials reconnect.
  }, [
    existingPhone,
    token,
    apiBaseUrl,
    signalingBaseUrl,
    autoReconnect,
    autoConnect,
    handlers,
    emergencyAddressIdRef,
    iceServersRef,
    storageRef,
    ringbackRef,
    createSignalingSocketRef,
    onAppResumeRef,
    onTokenExpiringRef,
  ]);

  // Connection is DERIVED, not stored, for an adopted phone: a host can hand over
  // an already-connected phone AFTER the first render, when the useState seed
  // ('connecting'/'idle') already ran against a null phone and no 'connected'
  // event will fire to correct it — so stored `connection` would stick and
  // placeCall's !== 'connected' gate would block dialing forever. Once listeners
  // observe a real transition, `connection` holds the truth and wins.
  const derivedConnection: SoftphoneConnectionState =
    existingPhone && (connection === 'idle' || connection === 'connecting')
      ? existingPhone.isConnected
        ? 'connected'
        : existingPhone.isConnecting
          ? 'connecting'
          : connection
      : connection;
  return { phone: existingPhone ?? phone, connection: derivedConnection };
}
