/**
 * `useCall` — the shared "brain" of the dialer, web and React Native.
 *
 * It owns a `DialStackPhone`: constructs it from credentials, subscribes to the
 * connection + incoming-call events, applies the foreground-call policy (the UI
 * presents one call at a time — the most recent), wires per-call state events to
 * React re-renders, and tears everything down on unmount / credential change.
 *
 * It is platform-agnostic: it imports only the headless core (`../../webrtc`),
 * never the DOM or React Native. Platform-specific side-effects a call's
 * lifecycle should trigger — e.g. React Native owning the audio session via
 * `InCallManager` on answer, releasing it on end — are injected via
 * `onCallActivated` / `onCallEnded` rather than baked in here.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { DialStackPhone } from '../../webrtc';
import type {
  Call,
  CallEndReason,
  EmergencyAddress,
  EmergencyAddressInput,
  PhoneError,
  PhoneOptions,
} from '../../webrtc';

/** Connection lifecycle surfaced to the dialer UI. */
export type DialerConnectionState =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface UseCallOptions extends PhoneOptions {
  /**
   * Connect automatically once the phone is constructed (default: true). Set
   * false to render the UI without connecting yet (e.g. token still loading).
   */
  autoConnect?: boolean;

  /** Fired when an inbound call arrives and becomes the foreground call. */
  onIncomingCall?: (e: { from: string; fromName: string | null }) => void;

  /** Fired when a call (in or out) becomes the foreground call. */
  onCallStarted?: (e: { direction: 'inbound' | 'outbound'; peer: string }) => void;

  /**
   * Fired when a call is answered (becomes active). The web dialer ignores this
   * (remote audio auto-plays through its `<audio>` element); React Native uses
   * it to take the audio session (`InCallManager.start`).
   */
  onCallActivated?: (call: Call) => void;

  /**
   * Fired when the foreground call ends. React Native uses it to release the
   * audio session (`InCallManager.stop`).
   */
  onCallEnded?: (e: { reason: CallEndReason }) => void;

  /** Fired on a non-fatal or fatal phone error. */
  onError?: (e: { code: string; message: string }) => void;
}

export interface UseCallResult {
  /** Connection lifecycle state. */
  connection: DialerConnectionState;
  /** The single foreground call the UI represents, or null when idle. */
  activeCall: Call | null;
  /**
   * Place an outbound call to `destination`. No-ops unless connected and the
   * destination is non-empty. Errors surface via `onError`.
   */
  placeCall: (destination: string) => Promise<void>;

  /**
   * List the user's saved emergency addresses. Uses the SAME phone as the call
   * session (no second connection), so it never disturbs the registration.
   * Returns [] before the phone exists.
   */
  listEmergencyAddresses: () => Promise<EmergencyAddress[]>;

  /**
   * Create/validate a per-user emergency address for outbound PSTN. Updates the
   * live phone in place (and its localStorage selection) — it does NOT reconnect
   * or re-register, so an in-progress registration is unaffected. Rejects with a
   * `PhoneError` on carrier rejection.
   */
  setEmergencyAddress: (input: EmergencyAddressInput) => Promise<EmergencyAddress>;
}

/**
 * Construct and own a `DialStackPhone`, presenting a single foreground call as
 * React state. Reconstructs (and reconnects) whenever the credentials change.
 */
export function useCall(options: UseCallOptions): UseCallResult {
  const {
    autoConnect = true,
    onIncomingCall,
    onCallStarted,
    onCallActivated,
    onCallEnded,
    onError,
  } = options;

  const phoneRef = useRef<DialStackPhone | null>(null);
  // Start in 'connecting' when autoConnect so the initial render already shows
  // the connecting state (the connect effect then only transitions from here),
  // avoiding a synchronous setState in the effect body.
  const [connection, setConnection] = useState<DialerConnectionState>(
    autoConnect && options.token ? 'connecting' : 'idle'
  );
  // Mirror of `connection` read by the otherwise-stable `placeCall` callback, so
  // it doesn't get a new identity on every connection-lifecycle transition (the
  // same ref pattern the handlers/emergencyAddressId/iceServers use — synced in
  // an effect, never written during render).
  const connectionRef = useRef(connection);
  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  // Bumped to force a re-render when a (mutable) Call's state changes in place.
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  // Callbacks are read through a ref so changing a handler identity doesn't tear
  // down and reconnect the phone (the connect effect depends only on credentials).
  const handlers = useRef({
    onIncomingCall,
    onCallStarted,
    onCallActivated,
    onCallEnded,
    onError,
  });
  useEffect(() => {
    handlers.current = { onIncomingCall, onCallStarted, onCallActivated, onCallEnded, onError };
  });

  // Cleanup for the currently-wired foreground call's listeners. The foreground
  // call can be replaced (a new inbound arrives, or a new outbound is placed)
  // while the prior call is still alive in the core; without removing its
  // listeners it would keep firing onCallEnded/rerender into this hook — and
  // hold closures over a stale render. We unwire the old one before wiring the new.
  const unwireRef = useRef<(() => void) | null>(null);

  const wireCall = useCallback(
    (call: Call) => {
      unwireRef.current?.();

      const refresh = () => {
        // Re-render only while this call is the foreground one.
        setActiveCall((current) => current);
        rerender();
      };
      const onAnswered = () => {
        if (call.direction === 'inbound') {
          handlers.current.onCallStarted?.({ direction: 'inbound', peer: call.from });
        }
        handlers.current.onCallActivated?.(call);
        rerender();
      };
      const onEnded = (reason: CallEndReason) => {
        handlers.current.onCallEnded?.({ reason });
        setActiveCall((current) => (current === call ? null : current));
        rerender();
      };
      call.on('trying', refresh);
      call.on('ringing', refresh);
      call.on('answered', onAnswered);
      call.on('held', refresh);
      call.on('resumed', refresh);
      call.on('ended', onEnded);

      unwireRef.current = () => {
        call.off('trying', refresh);
        call.off('ringing', refresh);
        call.off('answered', onAnswered);
        call.off('held', refresh);
        call.off('resumed', refresh);
        call.off('ended', onEnded);
      };
    },
    [rerender]
  );

  const placeCall = useCallback(
    async (destination: string) => {
      const phone = phoneRef.current;
      const target = destination.trim();
      if (!phone || connectionRef.current !== 'connected' || !target) return;
      try {
        const call = await phone.call(target);
        setActiveCall(call);
        handlers.current.onCallStarted?.({ direction: 'outbound', peer: call.to });
        wireCall(call);
      } catch (err) {
        const e = err as PhoneError;
        handlers.current.onError?.({ code: e.code ?? 'call_failed', message: e.message });
      }
    },
    [wireCall]
  );

  const listEmergencyAddresses = useCallback(async (): Promise<EmergencyAddress[]> => {
    const phone = phoneRef.current;
    if (!phone) return [];
    const page = await phone.listEmergencyAddresses();
    return page.data;
  }, []);

  const setEmergencyAddress = useCallback(
    async (input: EmergencyAddressInput): Promise<EmergencyAddress> => {
      const phone = phoneRef.current;
      if (!phone) {
        throw new Error('Phone not connected');
      }
      // Updates the live phone in place + persists to localStorage. No reconnect.
      return phone.setEmergencyAddress(input);
    },
    []
  );

  // Construct + connect the phone for the current credentials. Reconnects when
  // any credential changes; tears down on unmount.
  const { token, apiBaseUrl, signalingBaseUrl, emergencyAddressId, iceServers, autoReconnect } =
    options;
  // The emergency-address id is a per-outbound-PSTN-call concern, NOT a
  // connection credential — the phone loads it from localStorage on construct
  // and `setEmergencyAddress` updates the live instance in place. It must NEVER
  // be a connect-effect dependency, or resolving/changing it would tear down and
  // reconnect the socket mid-registration (dropping incoming calls). We read the
  // latest value through a ref at construct time and keep it out of the deps.
  const emergencyAddressIdRef = useRef(emergencyAddressId);
  useEffect(() => {
    emergencyAddressIdRef.current = emergencyAddressId;
  }, [emergencyAddressId]);
  // `iceServers` is an optional array a consumer often passes inline. Like
  // `emergencyAddressId` it must NOT be a connect-effect dep — a new array
  // identity each render would tear down and reconnect the socket
  // mid-registration (dropping incoming calls). Read it through a ref at
  // construct time and keep it out of the deps.
  const iceServersRef = useRef(iceServers);
  useEffect(() => {
    iceServersRef.current = iceServers;
  }, [iceServers]);
  useEffect(() => {
    if (!token) return;
    let disposed = false;
    const p = new DialStackPhone({
      token,
      apiBaseUrl,
      signalingBaseUrl,
      emergencyAddressId: emergencyAddressIdRef.current,
      iceServers: iceServersRef.current,
      autoReconnect,
    });
    phoneRef.current = p;

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
    p.on('incoming', (call) => {
      if (disposed) return;
      // Foreground-call policy: the latest inbound call becomes the one the UI
      // presents. A prior call keeps ringing in the core but is no longer shown.
      setActiveCall(call);
      handlers.current.onIncomingCall?.({ from: call.from, fromName: call.fromName });
      wireCall(call);
    });
    p.on('error', (err: PhoneError) => {
      // Guarded like the other handlers: a late error emitted during/after
      // teardown must not fire the consumer callback into an unmounted tree.
      if (disposed) return;
      handlers.current.onError?.({ code: err.code, message: err.message });
      if (err.fatal) setConnection('error');
    });

    if (autoConnect) {
      // Reset to 'connecting' for this (re)connect. On first mount the initial
      // state is already 'connecting'; this matters on a credential change, when
      // the effect re-runs against a fresh phone and the prior state must reset.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resync connection state to the new phone subscription
      setConnection('connecting');
      p.connect().catch((err: PhoneError) => {
        handlers.current.onError?.({
          code: err?.code ?? 'internal_error',
          message: err?.message ?? String(err),
        });
        if (!disposed) setConnection('error');
      });
    }

    return () => {
      disposed = true;
      unwireRef.current?.();
      unwireRef.current = null;
      p.disconnect();
      phoneRef.current = null;
      setActiveCall(null);
      setConnection('idle');
    };
    // wireCall is stable (depends only on the stable rerender); credentials are
    // the real reconnect triggers.
    // emergencyAddressId is intentionally excluded — see emergencyAddressIdRef above.
    // iceServers is likewise excluded — read through iceServersRef so an inline
    // array literal doesn't tear down and reconnect the socket mid-registration.
  }, [token, apiBaseUrl, signalingBaseUrl, autoReconnect, autoConnect, wireCall]);

  return { connection, activeCall, placeCall, listEmergencyAddresses, setEmergencyAddress };
}
