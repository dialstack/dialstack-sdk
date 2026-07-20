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

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { DialStackPhone } from '../../webrtc';
import {
  sanitizeDestination,
  DIAL_COUNTRY,
  isIncomingRinging,
} from '../../components/softphone-view-model';
import type {
  Call,
  CallEndReason,
  EmergencyAddress,
  EmergencyAddressInput,
  PhoneError,
  PhoneOptions,
} from '../../webrtc';

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
   * Whether this is the call the user is currently on-screen with. Whenever any
   * ANSWERED call is in the list, exactly one entry is active; the others are
   * backgrounded (held). A list of only ringing inbound calls has none active
   * (they show as incoming cards until answered). This is a UI-focus fact the
   * hook owns — distinct from `call.state` (a held call is still a live call),
   * so it isn't derived from state. The `withActiveCall` invariant enforces it
   * on every transition.
   */
  active: boolean;
  /**
   * The other leg of an attended transfer this call is part of, or null. Set on
   * BOTH participants so the relationship is navigable either way: the consult's
   * `transferPeer` is the held original, and the original's is the consult. Null
   * for a plain standalone call.
   */
  transferPeer: Call | null;
  /**
   * This leg's STABLE role in an attended transfer, or null when not part of one.
   * A transfer is just two ordinary calls with this metadata layered on top, so
   * either leg can be the active/on-screen call (freely switchable like any other
   * call) — the role, NOT which call is active, is what tells the UI which leg to
   * Complete-bridge (the 'original') and which is the consult target. Set once at
   * `consultStarted` and preserved across `switchActive`; cleared when the
   * transfer ends (cancel, complete, or either leg dropping).
   */
  transferRole: 'original' | 'consult' | null;
}

export interface UseCallsResult {
  /** Connection lifecycle state. */
  connection: SoftphoneConnectionState;
  /**
   * Every live call leg — the active call, any held calls, and any ringing
   * inbound calls (call-waiting). `activeCall`/`consultCall`/`heldCalls`/
   * `incomingCalls` below are conveniences derived from this.
   */
  calls: CallEntry[];
  /** The single call the user is talking to (rendered by the UI), or null. */
  activeCall: Call | null;
  /**
   * Ringing inbound calls not yet answered — a call-waiting interrupt during an
   * active call, or (while idle) one or more concurrent inbound calls. The UI
   * shows these as answer/decline cards; answering one holds the active call and
   * makes the answered call active.
   */
  incomingCalls: Call[];
  /**
   * Switch the active call to `call` (must be an already-answered held call):
   * holds the current active call and resumes `call`. No-op if it's already
   * active or not a held call.
   */
  switchToCall: (call: Call) => void;
  /**
   * Answer a specific ringing inbound call. Holds the current active call (if
   * any) and makes the answered call active.
   */
  answerCall: (call: Call) => void;
  /**
   * Place an outbound call to `destination`. When a call is already active it is
   * held and the new outbound becomes active. No-ops unless connected and the
   * destination is non-empty (up to the concurrent-call cap). Errors surface via
   * `onError`.
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
   * All currently-held (backgrounded) answered calls — the calls the user can
   * switch back to. Excludes ringing inbound calls (see `incomingCalls`).
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

  /**
   * The emergency-address id the phone presents on authenticate (null if none).
   * Distinguishes "this session bound the address" from "a saved address has a
   * registered_ip from a past session" — the E911 gate is only satisfied for the
   * former.
   */
  getPresentedEmergencyAddressId: () => string | null;

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
  // A new outbound call (or the sole idle call) becomes active; any prior active
  // call is held (multi-call: entries accumulate, they aren't replaced).
  | { type: 'active'; call: Call }
  // A ringing inbound call arrives — added to the list WITHOUT stealing active
  // (the user answers it explicitly). While idle it's the only entry; during a
  // call it's a call-waiting interrupt shown alongside the active call.
  | { type: 'incomingAdded'; call: Call }
  // An inbound call was answered BY THE USER (explicit accept): it becomes active,
  // the prior active call is held. (hold()/resume() side-effects run in the
  // dispatcher.)
  | { type: 'answered'; call: Call }
  // A call reported 'answered' by the CORE (a remote leg picked up, or answered on
  // another device) — promote it to active ONLY if nothing is currently focused
  // (it's the sole/first live call). If another call is already active, do nothing:
  // a backgrounded leg answering must not steal focus (the far end is alone and
  // will hang up). Never holds anything.
  | { type: 'answeredInPlace'; call: Call }
  // Switch the active call: `call` becomes active, the previously-active call is
  // held. (The hold()/resume() side-effects run in the dispatcher.)
  | { type: 'switchActive'; call: Call }
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

// Max concurrent live calls (active + held + ringing). Beyond this a new inbound
// is rejected busy — keeps the stacked-card UI readable and matches real softphone
// limits. A soft cap, not a protocol constraint.
const MAX_CALLS = 4;

/**
 * Enforce the core invariant: whenever any ANSWERED call is in the list, exactly
 * one entry is `active` — the on-screen call. There must never be an answered
 * call in the list with no active entry (the in-call screen renders the active
 * call, so that would leave it blank while a held call is stranded). A ringing
 * inbound is deliberately NOT active until the user answers it, so a list of
 * only-ringing calls correctly has no active entry (the incoming card shows).
 *
 * If a transition left an answered call but none active, promote the most-recent
 * answered (held) call. If more than one ended up active, keep only the last.
 * Idempotent — a state already satisfying the invariant is returned unchanged.
 */
function withActiveCall(calls: CallEntry[]): CallEntry[] {
  const activeCount = calls.filter((e) => e.active).length;
  if (activeCount === 0) {
    // Promote the most-recent answered call, if any. Never promote a ringing
    // inbound — the user answers those explicitly.
    const target = [...calls].reverse().find((e) => !isIncomingRinging(e.call));
    if (!target) return calls;
    return calls.map((e) => (e.call === target.call ? { ...e, active: true } : e));
  }
  if (activeCount === 1) return calls;
  // >1 active — collapse to the last active entry (walking from the end).
  let kept = false;
  return [...calls]
    .reverse()
    .map((e) => {
      if (!e.active) return e;
      if (!kept) {
        kept = true;
        return e;
      }
      return { ...e, active: false };
    })
    .reverse();
}

function callsReducer(state: CallsState, action: CallsAction): CallsState {
  const next = callsReducerInner(state, action);
  if (next === state) return state;
  const calls = withActiveCall(next.calls);
  return calls === next.calls ? next : { ...next, calls };
}

function callsReducerInner(state: CallsState, action: CallsAction): CallsState {
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
      // A new call joins the list and becomes active; any prior active call is
      // held (multi-call). Already-present same call → just ensure it's the sole
      // active one (idempotent for a re-dispatch).
      const already = state.calls.find((e) => e.call === action.call);
      const others = state.calls
        .filter((e) => e.call !== action.call)
        .map((e) => ({ ...e, active: false }));
      const entry: CallEntry = already
        ? { ...already, active: true }
        : { call: action.call, active: true, transferPeer: null, transferRole: null };
      return { ...state, calls: [...others, entry] };
    }
    case 'incomingAdded': {
      // A ringing inbound joins the list without stealing active — the user
      // answers it explicitly. Idempotent if already present.
      if (state.calls.some((e) => e.call === action.call)) return state;
      return {
        ...state,
        calls: [
          ...state.calls,
          { call: action.call, active: false, transferPeer: null, transferRole: null },
        ],
      };
    }
    case 'answered':
    case 'switchActive': {
      // Make `call` the active entry, hold the rest. No structural change if it's
      // not present. (An answered inbound is already in the list from
      // `incomingAdded`; this just promotes it to active.)
      if (!state.calls.some((e) => e.call === action.call)) return state;
      return {
        ...state,
        calls: state.calls.map((e) => ({ ...e, active: e.call === action.call })),
      };
    }
    case 'answeredInPlace': {
      // Core-reported answer. Promote ONLY when nothing is focused — a lone/first
      // call becoming live. If another leg is already active, no-op: this event
      // must never steal focus from the call the user is on.
      const entry = state.calls.find((e) => e.call === action.call);
      if (!entry) return state;
      if (state.calls.some((e) => e.active)) return state;
      return {
        ...state,
        calls: state.calls.map((e) => ({ ...e, active: e.call === action.call })),
      };
    }
    case 'consultStarted': {
      // The prior active call becomes the (held) original; the consult leg is
      // added and becomes active. The two legs point at each other via
      // `transferPeer`, and each carries a STABLE `transferRole` so the
      // original/consult roles survive the user switching focus between them.
      const original = state.calls.find((e) => e.active)?.call ?? null;
      const others = state.calls
        .filter((e) => e.call !== original)
        .map((e) => ({ ...e, active: false }));
      const originalEntry: CallEntry[] = original
        ? [{ call: original, active: false, transferPeer: action.call, transferRole: 'original' }]
        : [];
      return {
        ...state,
        calls: [
          ...others,
          ...originalEntry,
          { call: action.call, active: true, transferPeer: original, transferRole: 'consult' },
        ],
      };
    }
    case 'cancelConsult': {
      // Drop the consult leg; the original of the pair becomes active again and
      // its transfer metadata is cleared. Found by stable role, not by which call
      // is active — the user may have switched focus away from the consult pair.
      const consult = state.calls.find((e) => e.transferRole === 'consult');
      const original = state.calls.find((e) => e.transferRole === 'original');
      if (!consult || !original) return state;
      const rest = state.calls.filter((e) => e.call !== consult.call && e.call !== original.call);
      return {
        ...state,
        calls: [
          ...rest,
          { call: original.call, active: true, transferPeer: null, transferRole: null },
        ],
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
          e.call === ended.transferPeer
            ? { call: e.call, active: true, transferPeer: null, transferRole: null }
            : e
        );
      }
      // Any other case where the active call left the list (a plain active call
      // ended with held calls remaining) is repaired by the active-call invariant
      // applied to every transition below.
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
  // Ringing inbound legs (call-waiting) vs. answered-but-held legs the user can
  // switch back to — split so the UI shows incoming as answer/decline cards and
  // held as switchable call cards. `incomingCalls` also excludes the active entry:
  // answering flips `active` immediately but `call.state` stays 'ringing' until
  // the server echo, and without the guard that just-answered call would render
  // BOTH as the in-call panel and as an incoming card during the echo window.
  // Memoized so a per-render tick (duration) doesn't hand consumers new array
  // identities every second.
  const incomingCalls = useMemo(
    () => calls.filter((e) => !e.active && isIncomingRinging(e.call)).map((e) => e.call),
    [calls]
  );
  const heldCalls = useMemo(
    () => calls.filter((e) => !e.active && !isIncomingRinging(e.call)).map((e) => e.call),
    [calls]
  );
  // Transfer legs are identified by STABLE role, not by which is active — a
  // transfer is just two ordinary (switchable) calls with role metadata on top.
  // So `consultCall`/`transferOriginal` stay pinned to the right legs no matter
  // which one the user is currently focused on.
  const consultCall = calls.find((e) => e.transferRole === 'consult')?.call ?? null;
  const transferOriginal = calls.find((e) => e.transferRole === 'original')?.call ?? null;
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
  // value — on every call-state tick). `activeCallRef` is written DURING render
  // (not in an effect) so it reflects the latest committed state synchronously —
  // an effect write lags a render, which raced: a rapid answer/switch right after
  // a new call became active would hold the already-replaced leg, leaving two
  // live audio legs. `activeCall` is derived from `calls` above, so this is the
  // standard "ref mirrors the latest rendered value" idiom.
  // Latest-value ref: mirror the just-derived `activeCall` synchronously so a
  // dispatcher reads the TRUE active leg. An effect write lags a render, which
  // raced (the double-hold: a rapid answer/switch held the already-replaced leg).
  // The written value is a pure function of the rendered state; the ref is only
  // read later (in callbacks/handlers), never during this render.
  const activeCallRef = useRef<Call | null>(null);
  // eslint-disable-next-line react-hooks/refs
  activeCallRef.current = activeCall;
  const consultCallRef = useRef<Call | null>(null);
  // The held original of an in-flight transfer — completeAttendedTransfer /
  // cancelAttendedTransfer act on THIS, not on `activeCall` (which during a
  // transfer is the consult leg).
  const transferOriginalRef = useRef<Call | null>(null);
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
        // The core 'answered' event (a remote leg picked up, or answered on
        // another device). Promote this call to the foreground ONLY if nothing is
        // currently focused — i.e. it's the sole/first live call, which should
        // become active (a ringing inbound isn't active until it answers, and the
        // withActiveCall invariant only re-runs on a dispatch, so this is that
        // dispatch). If another call is already active, `answeredInPlace` no-ops:
        // a backgrounded leg answering must not steal focus.
        dispatch({ type: 'answeredInPlace', call });
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
        // Clear whichever slot this call occupied (atomic in the reducer). When
        // the active call ends and a held call remains, the reducer promotes that
        // held call to the active (on-screen) entry so the in-call screen isn't
        // left blank — it stays HELD, though; the user chooses when to resume it.
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
      // Multi-call: a new outbound is allowed over existing calls (up to the cap);
      // the reducer's `active` action holds the others. Refuse only at the cap.
      if (unwireByCall.current.size >= MAX_CALLS) {
        handlers.current.onError?.({ code: 'rate_limited', message: 'Too many active calls' });
        return;
      }
      // Hold the current active call before the new outbound becomes active, so
      // the switch is a real hold/resume (not two live audio legs). If the dial
      // then fails, we put that call on hold for nothing — so resume it in the
      // catch. `hold()` only sends the message (state flips to 'held' on the
      // server echo, not synchronously), so we resume the same call we held
      // rather than gating on its (still-'active') state.
      const previouslyActive = activeCallRef.current;
      try {
        previouslyActive?.hold();
        const call = await phone.call(target);
        dispatch({ type: 'active', call });
        notifiedCalls.current.add(call);
        handlers.current.onCallStarted?.({ direction: 'outbound', peer: call.to });
        wireCall(call);
      } catch (err) {
        // The second call failed after we held the previous one — un-hold it so
        // the user's live conversation isn't silently stuck on hold. Guarded
        // like holdThenActivate's rollback: a bare resume() re-throws
        // transport_closed when the socket is down, which would escape this async
        // callback as an unhandled rejection AND swallow the original dial error.
        if (previouslyActive && previouslyActive.state !== 'ended') {
          try {
            previouslyActive.resume();
          } catch {
            // Best-effort — the held call may itself have ended.
          }
        }
        const e = err as PhoneError;
        handlers.current.onError?.({ code: e.code ?? 'call_failed', message: e.message });
      }
    },
    [wireCall]
  );

  // Hold the current active call, then bring `target` to the foreground via
  // `activate` (resume for a held call, answer for a ringing one) and `dispatch`
  // the reducer action. Shared by switchToCall + answerCall — the only difference
  // between them is the activate call and the action. Optimistic: the reducer
  // flips `active` immediately and the server `held`/`resumed`/`answered` echoes
  // settle each call's state on the rerender tick. On failure it rolls the held
  // call back (best-effort resume, unless it already ended) so a failed
  // activate() never strands the live conversation on hold.
  const holdThenActivate = useCallback((activate: () => void, action: CallsAction) => {
    const current = activeCallRef.current;
    try {
      current?.hold();
      activate();
      dispatch(action);
    } catch (err) {
      if (current && current.state !== 'ended') {
        try {
          current.resume();
        } catch {
          // Best-effort — current may itself have ended.
        }
      }
      const e = err as PhoneError;
      handlers.current.onError?.({ code: e.code ?? 'call_failed', message: e.message });
    }
  }, []);

  // Switch the active call to an already-answered held call: hold the current
  // active call, resume the target. No-op if the target is already active.
  const switchToCall = useCallback(
    (call: Call) => {
      if (activeCallRef.current === call) return;
      holdThenActivate(() => call.resume(), { type: 'switchActive', call });
    },
    [holdThenActivate]
  );

  // Answer a ringing inbound call: hold the current active call (call-waiting →
  // auto-hold), answer the target, and promote it to active. Distinct from the
  // core `answered` server event (which just fires host callbacks + rerender);
  // this is the user's explicit accept, which owns the auto-hold + promotion.
  const answerCall = useCallback(
    (call: Call) => {
      holdThenActivate(() => call.answer(), { type: 'answered', call });
    },
    [holdThenActivate]
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
    // completeTransfer() is called on the ORIGINAL (it bridges it to the consult).
    // No-op until the consult has actually been ANSWERED — bridging to a still-
    // ringing leg drops the held caller into a dead transfer. "Answered" is
    // active OR held: once the user has switched focus away, the consult is held
    // but still connected and perfectly bridgeable, so gate on connected, not on
    // it being the currently-focused call. (The UI also gates the button.)
    const original = transferOriginalRef.current;
    const consult = consultCallRef.current;
    if (!original || !consult || !consult.isConnected) return;
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

  // The emergency-address id the phone presents in its authenticate frame. Used
  // by useEmergencyBinding to distinguish "this session actually bound the
  // address" from "a saved address merely has a registered_ip from a past
  // session" — the two are not the same, and treating them as equal shows the
  // E911 gate as satisfied while the server has bound nothing.
  const getPresentedEmergencyAddressId = useCallback(
    (): string | null => phoneRef.current?.presentedEmergencyAddressId ?? null,
    []
  );

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
  const {
    token,
    apiBaseUrl,
    signalingBaseUrl,
    emergencyAddressId,
    iceServers,
    autoReconnect,
    storage,
    ringback,
    createSignalingSocket,
    onAppResume,
  } = options;
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
  // `storage` is the host-supplied persistence adapter (localStorage on web; on
  // React Native the provider requires an MMKV/AsyncStorage-backed one). Read at
  // construct time through a ref, like the other non-credential options, so a new
  // adapter identity can't retrigger the connect effect and drop the socket.
  const storageRef = useRef(storage);
  useEffect(() => {
    storageRef.current = storage;
  }, [storage]);
  // `ringback` is the platform's outbound-ringback tone (WebAudio default on web;
  // InCallManager-backed on React Native). Non-credential, so read at construct
  // time through a ref like `storage`, keeping it out of the connect deps.
  const ringbackRef = useRef(ringback);
  useEffect(() => {
    ringbackRef.current = ringback;
  }, [ringback]);
  // `createSignalingSocket` is the platform's WebSocket opener (bare on web; a
  // User-Agent-attaching variant on React Native). Non-credential, read through a
  // ref at construct time like `storage`/`ringback`, out of the connect deps.
  const createSignalingSocketRef = useRef(createSignalingSocket);
  useEffect(() => {
    createSignalingSocketRef.current = createSignalingSocket;
  }, [createSignalingSocket]);
  // `onAppResume` is the platform's foreground-resume subscription (DOM
  // lifecycle default on web; AppState-backed on React Native). Non-credential,
  // read through a ref like the others so it stays out of the connect deps.
  const onAppResumeRef = useRef(onAppResume);
  useEffect(() => {
    onAppResumeRef.current = onAppResume;
  }, [onAppResume]);
  // `onTokenExpiring` is a host callback the phone invokes shortly before the
  // token's exp to refresh it in-band (no reconnect). Passed inline its identity
  // changes each render, so like the other non-credential options it must NOT be a
  // connect-effect dep — a new identity would tear down and reconnect the socket.
  // Read the latest through a ref and hand the phone a stable wrapper that always
  // calls the freshest callback.
  const onTokenExpiringRef = useRef(options.onTokenExpiring);
  useEffect(() => {
    onTokenExpiringRef.current = options.onTokenExpiring;
  }, [options.onTokenExpiring]);
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
      // Multi-call: accept a 2nd+ inbound as call-waiting, up to a soft cap on
      // concurrent live calls. Reject busy only past the cap. We gate on the
      // wired-call map (updated synchronously by wireCall) rather than
      // `activeCallRef` (synced a render late), so INVITEs arriving in one commit
      // cycle each see the ones before them.
      if (unwireByCall.current.size >= MAX_CALLS) {
        call.reject('busy');
        return;
      }
      // Added as a ringing entry — NOT active. It becomes active only when the
      // user answers it (which then holds the current call).
      dispatch({ type: 'incomingAdded', call });
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
    incomingCalls,
    switchToCall,
    answerCall,
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
    getPresentedEmergencyAddressId,
    clearEmergencyAddressRegisteredIp,
    reconnect,
  };
}
