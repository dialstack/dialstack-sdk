/**
 * `useCalls` — the shared "brain" of the softphone, web and React Native.
 *
 * It owns a `DialStackPhone`: constructs it from credentials, subscribes to the
 * connection + incoming-call events, tracks the live call legs (today: one active
 * call plus, during attended transfer, its consult leg), wires per-call state
 * events to React re-renders, and tears everything down on unmount / credential
 * change.
 *
 * It is platform-agnostic: it imports only the headless core (`../../webrtc`),
 * never the DOM or React Native. Platform-specific side-effects a call's
 * lifecycle should trigger — e.g. React Native owning the audio session via
 * `InCallManager` on answer, releasing it on end — are injected via
 * `onCallActivated` / `onCallEnded` rather than baked in here.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { DialStackPhone } from '../../webrtc';
import { sanitizeDestination, DIAL_COUNTRY } from '../../components/softphone-view-model';
import type {
  Call,
  CallEndReason,
  EmergencyAddress,
  EmergencyAddressInput,
  PhoneError,
  PhoneOptions,
} from '../../webrtc';

/** Connection lifecycle surfaced to the softphone UI. */
export type SoftphoneConnectionState =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface UseCallsOptions extends PhoneOptions {
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
   * Fired when a call is answered (becomes active). The web softphone ignores this
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

  /**
   * Fired when the server rejects the session's emergency address for the
   * current network (the `network.changed` signal). Outbound PSTN is gated
   * until an address valid here is confirmed; 911/933 still flow.
   */
  onNetworkChanged?: () => void;
}

/**
 * A live call leg. The entry adds ONLY what the `Call` itself can't carry — the
 * attended-transfer relationship. Everything else (active vs held, muted,
 * ringing, duration) is read from `call.state` / `call.isMuted`, which stay the
 * single source of truth; we don't mirror call state into the entry.
 */
export interface CallEntry {
  call: Call;
  /**
   * Whether this is the call the user is currently on-screen with. Exactly one
   * entry is active at a time; the others are backgrounded (held). This is a
   * UI-focus fact the hook owns — distinct from `call.state` (a held call is
   * still a live call), so it isn't derived from state.
   */
  active: boolean;
  /**
   * The other leg of an attended transfer this call is part of, or null. Set on
   * BOTH participants so the relationship is navigable either way: the consult's
   * `transferPeer` is the held original, and the original's is the consult. Null
   * for a plain standalone call.
   */
  transferPeer: Call | null;
}

export interface UseCallsResult {
  /** Connection lifecycle state. */
  connection: SoftphoneConnectionState;
  /**
   * Every live call leg. Today this holds at most the active call plus, during
   * an attended transfer, the held original + the consult leg.
   * `activeCall`/`consultCall`/`heldCalls` below are conveniences derived from this.
   */
  calls: CallEntry[];
  /** The single call the user is talking to (rendered by the UI), or null. */
  activeCall: Call | null;
  /**
   * Place an outbound call to `destination`. No-ops unless connected and the
   * destination is non-empty. Errors surface via `onError`.
   */
  placeCall: (destination: string) => Promise<void>;

  /**
   * The consult leg of an in-progress attended transfer, or null. While set, the
   * `activeCall` is the live consult leg (the party the user is now talking to)
   * and `transferOriginal` is the original, held party. Cleared on
   * complete/cancel or when either leg ends.
   */
  consultCall: Call | null;

  /**
   * All currently-held (backgrounded) calls. Today at most one — the original
   * party during an attended transfer — but plural so multi-call/parking can add
   * more without another reshape.
   */
  heldCalls: Call[];

  /**
   * The specific held original being transferred to `consultCall`, or null. This
   * is the consult's linked partner (`transferPeer`), NOT merely "a held call" —
   * so it stays correct if other held calls exist. The consulting UI shows this
   * as the on-hold party opposite the live consult.
   */
  transferOriginal: Call | null;

  /**
   * Attended transfer, step 1: hold `activeCall` and dial `destination` as a
   * consult leg (stored in `consultCall`). No-ops unless there's an active call
   * and no consult already in progress. Errors surface via `onError`.
   */
  startAttendedTransfer: (destination: string) => Promise<void>;

  /**
   * Attended transfer, step 2: bridge the held original to the consult party.
   * Both legs end with reason 'transferred'. No-op unless a consult is answered.
   */
  completeAttendedTransfer: () => void;

  /**
   * Abandon an in-progress attended transfer: hang up the consult leg and resume
   * the held original. No-op unless a consult is in progress.
   */
  cancelAttendedTransfer: () => void;

  /**
   * List the user's saved emergency addresses. Truth for "is this session's
   * emergency address bound to the current network" is `registered_ip !== null`
   * on the presented address (server binds it at the authenticate handshake).
   */
  listEmergencyAddresses: () => Promise<EmergencyAddress[]>;

  /** Create + validate a new emergency address (does not bind until reconnect). */
  setEmergencyAddress: (input: EmergencyAddressInput) => Promise<EmergencyAddress>;

  /** Select an already-saved address to present on the next (re)connect. */
  selectEmergencyAddress: (id: string) => void;

  /** Clear an address's network binding (registered_ip) so a reconnect re-binds. */
  clearEmergencyAddressRegisteredIp: (id: string) => Promise<void>;

  /**
   * Tear down and reconnect, re-running authenticate so the current emergency
   * address binds to this network. How a just-selected/created address takes
   * effect, and how a moved session re-binds.
   */
  reconnect: () => Promise<void>;
}

/**
 * The full call lifecycle state machine — connection state plus every live call
 * leg. Today at most two entries exist: the active call the user is talking to
 * and, during an attended transfer, the held original it's linked to (via
 * `transferPeer`). The single-call+consult shape is a special case of this list;
 * the list is what lets call-waiting/multi-call be added later without another
 * slot rework.
 *
 * Kept in a reducer so every transition is one atomic, centrally-defined change
 * rather than several `setState`s that must agree.
 *
 * The reducer is PURE and owns only call *identity/role*. It does NOT:
 * - perform side-effects (listener wiring, phone.call()/hangup/resume, audio) —
 *   the dispatchers do those around the dispatch;
 * - track a `Call`'s in-place mutations (hold→active, duration) — identity is
 *   unchanged there, so that's a separate render `tick`, not a transition.
 */
interface CallsState {
  connection: SoftphoneConnectionState;
  // The single source of truth for the live legs. Roles ARE the pointers — the
  // active call is the `'active'` entry, the consult is the `'consult'` entry —
  // so there's no separate active-call field to keep in sync. Entries hold the
  // `Call` object (not its id, which is mutable across the outbound→server-id
  // swap), so identity survives that swap.
  calls: CallEntry[];
}

type CallsAction =
  | { type: 'connecting' }
  | { type: 'connected' }
  | { type: 'reconnecting' }
  | { type: 'disconnected' }
  | { type: 'error' }
  // A new inbound/outbound call becomes the active call (replacing any prior one).
  | { type: 'active'; call: Call }
  // A consult leg was dialed (attended transfer step 1): the active original
  // becomes `held`, the consult is added and becomes active.
  | { type: 'consultStarted'; call: Call }
  // Cancel an attended transfer: drop the consult, restore the held original.
  | { type: 'cancelConsult' }
  // A call ended: remove its entry.
  | { type: 'callEnded'; call: Call }
  // Teardown / credential change: back to idle, no calls.
  | { type: 'reset' };

const IDLE: CallsState = { connection: 'idle', calls: [] };

function callsReducer(state: CallsState, action: CallsAction): CallsState {
  switch (action.type) {
    case 'connecting':
      return state.connection === 'connecting' ? state : { ...state, connection: 'connecting' };
    case 'connected':
      return state.connection === 'connected' ? state : { ...state, connection: 'connected' };
    case 'reconnecting':
      return state.connection === 'reconnecting' ? state : { ...state, connection: 'reconnecting' };
    case 'disconnected':
      return state.connection === 'disconnected' ? state : { ...state, connection: 'disconnected' };
    case 'error':
      return state.connection === 'error' ? state : { ...state, connection: 'error' };
    case 'active': {
      // A new call becomes THE active call. Single-active scope: the dispatcher
      // rejects a 2nd inbound before we get here, so outside a transfer there's
      // exactly one entry. Any prior entries are dropped (there are none today).
      if (state.calls.length === 1 && state.calls[0]?.call === action.call) return state;
      return { ...state, calls: [{ call: action.call, active: true, transferPeer: null }] };
    }
    case 'consultStarted': {
      // The prior active call becomes the (held) original; the consult leg is
      // added and becomes active. The two legs point at each other via
      // `transferPeer` so either can find the other.
      const original = state.calls.find((e) => e.active)?.call ?? null;
      const others = state.calls
        .filter((e) => e.call !== original)
        .map((e) => ({ ...e, active: false }));
      const originalEntry: CallEntry[] = original
        ? [{ call: original, active: false, transferPeer: action.call }]
        : [];
      return {
        ...state,
        calls: [
          ...others,
          ...originalEntry,
          { call: action.call, active: true, transferPeer: original },
        ],
      };
    }
    case 'cancelConsult': {
      // Drop the consult leg; the held original of the pair becomes active again.
      const consult = state.calls.find((e) => e.active && e.transferPeer);
      const original = consult?.transferPeer ?? null;
      if (!consult || !original) return state;
      const rest = state.calls.filter((e) => e.call !== consult.call && e.call !== original);
      return {
        ...state,
        calls: [...rest, { call: original, active: true, transferPeer: null }],
      };
    }
    case 'callEnded': {
      const ended = state.calls.find((e) => e.call === action.call);
      if (!ended) return state;
      let calls = state.calls.filter((e) => e.call !== action.call);
      // If a transfer leg ended, its partner comes back as the active call:
      // - consult ended (cancel, remote hangup, failure) → resume the held
      //   original the user was transferring.
      // - the held original dropped mid-consult → the consult is no longer a
      //   transfer; it stays the active call.
      // One rule covers cancel, remote-consult-end, and original-drop.
      if (ended.transferPeer) {
        calls = calls.map((e) =>
          e.call === ended.transferPeer ? { call: e.call, active: true, transferPeer: null } : e
        );
      }
      return { ...state, calls };
    }
    case 'reset':
      return state.connection === 'idle' && state.calls.length === 0 ? state : IDLE;
  }
}

/**
 * Construct and own a `DialStackPhone`, presenting a single foreground call as
 * React state. Reconstructs (and reconnects) whenever the credentials change.
 */
export function useCalls(options: UseCallsOptions): UseCallsResult {
  const {
    autoConnect = true,
    onIncomingCall,
    onCallStarted,
    onCallActivated,
    onCallEnded,
    onError,
  } = options;

  const phoneRef = useRef<DialStackPhone | null>(null);
  // The whole call lifecycle (connection + the live call legs) as one state
  // machine. Start in 'connecting' when autoConnect so the initial render already
  // shows the connecting state (the connect effect then only transitions from
  // here), avoiding a synchronous setState in the effect body.
  const [state, dispatch] = useReducer(callsReducer, {
    ...IDLE,
    connection: autoConnect && options.token ? 'connecting' : 'idle',
  });
  const { connection, calls } = state;
  // Derived call views — the UI reads these; the `calls` entries are the source
  // of truth (the `active` flag names the on-screen call; `call.state`/`isMuted`
  // stay on the Call). During an attended transfer the active call is the consult
  // (it carries a `transferPeer` back to the held original).
  const activeEntry = calls.find((e) => e.active) ?? null;
  const activeCall = activeEntry?.call ?? null;
  const heldCalls = calls.filter((e) => !e.active).map((e) => e.call);
  const consultCall = activeEntry?.transferPeer ? activeEntry.call : null;
  const transferOriginal = consultCall ? (activeEntry?.transferPeer ?? null) : null;
  // Mirror of `connection` read by the otherwise-stable `placeCall` callback, so
  // it doesn't get a new identity on every connection-lifecycle transition (the
  // same ref pattern the handlers/emergencyAddressId/iceServers use — synced in
  // an effect, never written during render).
  const connectionRef = useRef(connection);
  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);
  // Bumped to force a re-render when a (mutable) Call's state changes in place
  // (hold→active, duration) — that's not a reducer transition (identity is
  // unchanged), so it stays a separate tick.
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  // Read `activeCall`/`consultCall` through refs inside stable callbacks + the
  // phone event handlers (so they don't get re-created — or capture a stale
  // value — on every call-state tick).
  const activeCallRef = useRef<Call | null>(null);
  const consultCallRef = useRef<Call | null>(null);
  // The held original of an in-flight transfer — completeAttendedTransfer /
  // cancelAttendedTransfer act on THIS, not on `activeCall` (which during a
  // transfer is the consult leg).
  const transferOriginalRef = useRef<Call | null>(null);
  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);
  useEffect(() => {
    consultCallRef.current = consultCall;
  }, [consultCall]);
  useEffect(() => {
    transferOriginalRef.current = transferOriginal;
  }, [transferOriginal]);

  // True for the hook's lifetime; flips false on unmount. Async actions that
  // await the transport (attendedTransfer) check it after the await so a resolve
  // arriving post-unmount doesn't wire listeners / dispatch into a dead hook.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Callbacks are read through a ref so changing a handler identity doesn't tear
  // down and reconnect the phone (the connect effect depends only on credentials).
  const handlers = useRef({
    onIncomingCall,
    onCallStarted,
    onCallActivated,
    onCallEnded,
    onError,
    onNetworkChanged: options.onNetworkChanged,
  });
  useEffect(() => {
    handlers.current = {
      onIncomingCall,
      onCallStarted,
      onCallActivated,
      onCallEnded,
      onError,
      onNetworkChanged: options.onNetworkChanged,
    };
  });

  // Per-call listener cleanup. A call's listeners must be removed when it ends or
  // is dropped, or it would keep firing into this hook (and hold a stale-render
  // closure). Attended transfer means TWO calls can be wired at once — the held
  // original (`activeCall`) and the live consult (`consultCall`) — so we key the
  // unwire fns by call rather than keeping a single slot.
  const unwireByCall = useRef(new Map<Call, () => void>());

  // Calls the host was told about (via onIncomingCall / onCallStarted). onCallEnded
  // fires only for these, so a consult leg — which the user talks to during a
  // transfer but the host never saw *start* — doesn't emit a spurious end, and a
  // completed transfer (both legs end 'transferred') fires onCallEnded once, for
  // the original, not twice.
  const notifiedCalls = useRef(new WeakSet<Call>());

  const unwireCall = useCallback((call: Call) => {
    const off = unwireByCall.current.get(call);
    if (off) {
      off();
      unwireByCall.current.delete(call);
    }
  }, []);

  const wireCall = useCallback(
    (call: Call) => {
      // Idempotent: re-wiring the same call replaces its listeners.
      unwireCall(call);

      const refresh = () => {
        // Nudge React; the call mutated in place (state/duration).
        rerender();
      };
      const onAnswered = () => {
        if (call.direction === 'inbound') {
          notifiedCalls.current.add(call);
          handlers.current.onCallStarted?.({ direction: 'inbound', peer: call.from });
        }
        handlers.current.onCallActivated?.(call);
        rerender();
      };
      const onEnded = (reason: CallEndReason) => {
        // Fire onCallEnded only for a call the host was told about — not the
        // consult leg (never announced as a start), so the host sees one end per
        // user-visible call even across an attended transfer.
        if (notifiedCalls.current.has(call)) {
          notifiedCalls.current.delete(call);
          handlers.current.onCallEnded?.({ reason });
        }
        // Clear whichever slot this call occupied (atomic in the reducer).
        dispatch({ type: 'callEnded', call });
        unwireCall(call);
      };
      call.on('trying', refresh);
      call.on('ringing', refresh);
      call.on('answered', onAnswered);
      call.on('held', refresh);
      call.on('resumed', refresh);
      call.on('ended', onEnded);

      unwireByCall.current.set(call, () => {
        call.off('trying', refresh);
        call.off('ringing', refresh);
        call.off('answered', onAnswered);
        call.off('held', refresh);
        call.off('resumed', refresh);
        call.off('ended', onEnded);
      });
    },
    [rerender, unwireCall]
  );

  const placeCall = useCallback(
    async (destination: string) => {
      const phone = phoneRef.current;
      // Clean the dial string (strip formatting, E.164 a valid PSTN number) so
      // a pasted/formatted "(581) 319-5082" dials as "+15813195082" and we never
      // send characters the server rejects. Extensions/star codes pass through.
      const target = sanitizeDestination(destination, DIAL_COUNTRY);
      // Surface (rather than silently no-op) so a host calling the public dial()
      // API with bad input, before connecting, or over a live call gets feedback
      // — the built-in DialPad can't reach these (its Call button is gated), but
      // dial() has no such gate.
      if (!target) {
        handlers.current.onError?.({
          code: 'invalid_message',
          message: 'Enter a valid phone number, extension, or feature code',
        });
        return;
      }
      if (!phone || connectionRef.current !== 'connected') {
        handlers.current.onError?.({
          code: 'transport_closed',
          message: 'The softphone is not connected',
        });
        return;
      }
      // Single-active scope: don't place a call over an existing one. Refusing
      // here (rather than dropping the current call) keeps dial() from orphaning
      // a live leg — during a transfer the reducer's `active` action would
      // discard BOTH transfer legs while we only unwire one.
      if (activeCallRef.current) {
        handlers.current.onError?.({
          code: 'rate_limited',
          message: 'Already on a call',
        });
        return;
      }
      try {
        const call = await phone.call(target);
        dispatch({ type: 'active', call });
        notifiedCalls.current.add(call);
        handlers.current.onCallStarted?.({ direction: 'outbound', peer: call.to });
        wireCall(call);
      } catch (err) {
        const e = err as PhoneError;
        handlers.current.onError?.({ code: e.code ?? 'call_failed', message: e.message });
      }
    },
    [wireCall]
  );

  const startAttendedTransfer = useCallback(
    async (destination: string) => {
      const call = activeCallRef.current;
      const phone = phoneRef.current;
      // Same clean-up as placeCall so the consult leg dials a valid destination.
      const target = sanitizeDestination(destination, DIAL_COUNTRY);
      // No-op unless there's an active call and no consult already in progress.
      if (!call || consultCallRef.current || !target) return;
      try {
        const consult = await call.attendedTransfer(target);
        // The hook may have unmounted (or the phone reconnected) while the
        // consult was dialing — don't wire/dispatch into a disposed hook.
        if (!mountedRef.current) return;
        // The original we started transferring must still be live. If it dropped
        // mid-dial (remote hangup — `ended` mutates the Call synchronously) or a
        // reconnect tore the phone down (phoneRef swapped), the consult has no
        // original to hold against — hang it up rather than surface an orphaned
        // leg with dead transfer controls.
        if (call.state === 'ended' || phoneRef.current !== phone) {
          consult.hangup();
          return;
        }
        dispatch({ type: 'consultStarted', call: consult });
        wireCall(consult);
      } catch (err) {
        const e = err as PhoneError;
        handlers.current.onError?.({ code: e.code ?? 'call_failed', message: e.message });
      }
    },
    [wireCall]
  );

  const completeAttendedTransfer = useCallback(() => {
    // completeTransfer() is called on the HELD ORIGINAL (it bridges its held leg
    // to the consult), not on the active call — which during a transfer is the
    // consult leg the user is talking to. No-op until the consult has actually
    // been ANSWERED — bridging to a still-ringing leg drops the held caller into
    // a dead transfer. (The UI also disables the button until then.)
    const original = transferOriginalRef.current;
    const consult = consultCallRef.current;
    if (!original || !consult || consult.state !== 'active') return;
    try {
      original.completeTransfer();
    } catch (err) {
      const e = err as PhoneError;
      handlers.current.onError?.({ code: e.code ?? 'call_failed', message: e.message });
    }
  }, []);

  const cancelAttendedTransfer = useCallback(() => {
    const consult = consultCallRef.current;
    const original = transferOriginalRef.current;
    if (!consult) return;
    // Hang up the consult leg and bring the held original back. (The consult's
    // own `ended` also dispatches callEnded; cancelConsult clears the slot
    // immediately so the UI leaves the consulting screen without waiting.)
    consult.hangup();
    // hangup() only sends the transport request; the consult's listeners are
    // otherwise removed only when its `ended` echoes back from the server, which
    // isn't guaranteed for an unanswered outbound leg. Unwire it now so its
    // listeners (and the hook closure they retain) can't leak.
    unwireCall(consult);
    if (original?.state === 'held') original.resume();
    dispatch({ type: 'cancelConsult' });
  }, [unwireCall]);

  const listEmergencyAddresses = useCallback(async (): Promise<EmergencyAddress[]> => {
    const phone = phoneRef.current;
    if (!phone) return [];
    const page = await phone.listEmergencyAddresses();
    return page.data;
  }, []);

  const setEmergencyAddress = useCallback(
    async (input: EmergencyAddressInput): Promise<EmergencyAddress> => {
      const phone = phoneRef.current;
      if (!phone) throw new Error('Phone not connected');
      // Creates + validates the address and selects it locally. Binding to the
      // network happens on the next reconnect (authenticate handshake).
      return phone.setEmergencyAddress(input);
    },
    []
  );

  const selectEmergencyAddress = useCallback((id: string) => {
    phoneRef.current?.selectEmergencyAddress(id);
  }, []);

  const clearEmergencyAddressRegisteredIp = useCallback(async (id: string): Promise<void> => {
    const phone = phoneRef.current;
    if (!phone) return;
    await phone.clearEmergencyAddressRegisteredIp(id);
  }, []);

  const reconnect = useCallback(async (): Promise<void> => {
    await phoneRef.current?.reconnect();
  }, []);

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
      guard(() => dispatch({ type: 'connected' }))
    );
    p.on(
      'reconnected',
      guard(() => dispatch({ type: 'connected' }))
    );
    p.on(
      'reconnecting',
      guard(() => dispatch({ type: 'reconnecting' }))
    );
    p.on(
      'disconnected',
      guard(() => dispatch({ type: 'disconnected' }))
    );
    p.on(
      'network.changed',
      guard(() => handlers.current.onNetworkChanged?.())
    );
    p.on('incoming', (call) => {
      if (disposed) return;
      // Single-active scope: the user handles one call at a time. If any call is
      // already live (active, held, or an in-flight consult), reject the new
      // inbound as busy — call-waiting is a future capability. We gate on the
      // wired-call map rather than `activeCallRef`: the ref is synced in a
      // post-commit effect (one render behind), so two inbound INVITEs arriving
      // within a single commit cycle would both read a stale-null ref and both
      // be accepted. `unwireByCall` is updated synchronously by wireCall below,
      // so the second INVITE sees the first immediately.
      if (unwireByCall.current.size > 0) {
        call.reject('busy');
        return;
      }
      dispatch({ type: 'active', call });
      notifiedCalls.current.add(call);
      handlers.current.onIncomingCall?.({ from: call.from, fromName: call.fromName });
      wireCall(call);
    });
    p.on('error', (err: PhoneError) => {
      // Guarded like the other handlers: a late error emitted during/after
      // teardown must not fire the consumer callback into an unmounted tree.
      if (disposed) return;
      handlers.current.onError?.({ code: err.code, message: err.message });
      if (err.fatal) dispatch({ type: 'error' });
    });

    if (autoConnect) {
      // Reset to 'connecting' for this (re)connect. On first mount the initial
      // state is already 'connecting'; this matters on a credential change, when
      // the effect re-runs against a fresh phone and the prior state must reset.
      dispatch({ type: 'connecting' });
      p.connect().catch((err: PhoneError) => {
        handlers.current.onError?.({
          code: err?.code ?? 'internal_error',
          message: err?.message ?? String(err),
        });
        if (!disposed) dispatch({ type: 'error' });
      });
    }

    return () => {
      disposed = true;
      // Unwire every wired call (foreground + any consult leg).
      for (const off of unwireByCall.current.values()) off();
      unwireByCall.current.clear();
      p.disconnect();
      phoneRef.current = null;
      // Back to idle, no calls (atomic).
      dispatch({ type: 'reset' });
    };
    // wireCall is stable (depends only on the stable rerender); credentials are
    // the real reconnect triggers.
    // emergencyAddressId is intentionally excluded — see emergencyAddressIdRef above.
    // iceServers is likewise excluded — read through iceServersRef so an inline
    // array literal doesn't tear down and reconnect the socket mid-registration.
  }, [token, apiBaseUrl, signalingBaseUrl, autoReconnect, autoConnect, wireCall]);

  return {
    connection,
    calls,
    activeCall,
    placeCall,
    consultCall,
    heldCalls,
    transferOriginal,
    startAttendedTransfer,
    completeAttendedTransfer,
    cancelAttendedTransfer,
    listEmergencyAddresses,
    setEmergencyAddress,
    selectEmergencyAddress,
    clearEmergencyAddressRegisteredIp,
    reconnect,
  };
}
