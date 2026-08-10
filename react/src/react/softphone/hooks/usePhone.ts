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
  const { autoConnect = true, onError } = options;

  // Expose the phone as state so dependents (useCalls, useEmergencyBinding) get a
  // fresh reference — and re-run their phone-keyed effects — when a reconnect
  // swaps the instance. Written from the connect effect, never during render.
  const [phone, setPhone] = useState<DialStackPhone | null>(null);
  // Seed 'connecting' when autoConnect so the first render already shows it (the
  // connect effect then only transitions from here, avoiding a synchronous
  // setState in the effect body). Set to an equal primitive is a React no-op, so
  // a repeated event doesn't re-render.
  const [connection, setConnection] = useState<SoftphoneConnectionState>(
    autoConnect && options.token ? 'connecting' : 'idle'
  );

  // Non-credential options are read through latest-value refs so their identity
  // stays out of the connect-effect deps (see useLatestRef). The phone reads them
  // at construct time; a new inline value must not tear down + reconnect the
  // socket mid-registration. onError is latched so the phone's error listener
  // always calls the freshest callback.
  const handlers = useLatestRef({ onError });
  const emergencyAddressIdRef = useLatestRef(options.emergencyAddressId);
  const iceServersRef = useLatestRef(options.iceServers);
  const storageRef = useLatestRef(options.storage);
  const ringbackRef = useLatestRef(options.ringback);
  const createSignalingSocketRef = useLatestRef(options.createSignalingSocket);
  const onAppResumeRef = useLatestRef(options.onAppResume);
  const onTokenExpiringRef = useLatestRef(options.onTokenExpiring);

  // Construct + connect the phone for the current credentials. Reconnects when a
  // credential changes; tears down on unmount. Only credentials are deps — the
  // non-credential options above are read through refs so their identity can't
  // retrigger this and drop the socket.
  const { token, apiBaseUrl, signalingBaseUrl, autoReconnect } = options;
  useEffect(() => {
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
    // The *Ref values are stable useLatestRef containers (identity never changes),
    // so listing them satisfies exhaustive-deps without ever retriggering: only the
    // credentials actually reconnect.
  }, [
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

  return { phone, connection };
}
