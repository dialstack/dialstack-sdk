/**
 * `useCalls` — the shared call-state "brain" of the softphone, web and React
 * Native.
 *
 * Given a `DialStackPhone` (owned by `usePhone`) and its connection state, it
 * subscribes to the incoming-call event, tracks the live call legs (today: one
 * active call plus, during attended transfer, its consult leg), wires per-call
 * state events to React re-renders, and unwires everything when the phone
 * instance changes (reconnect) or on unmount. It does NOT own the phone or its
 * connection lifecycle — that's `usePhone` — and it no longer exposes E911
 * provisioning; `useEmergencyBinding` talks to the phone directly.
 *
 * It is platform-agnostic: it imports only the headless core (`../../webrtc`),
 * never the DOM or React Native. Platform-specific side-effects a call's
 * lifecycle should trigger — e.g. React Native owning the audio session via
 * `InCallManager` on answer, releasing it on end — are injected via
 * `onCallActivated` / `onCallEnded` rather than baked in here.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  sanitizeDestination,
  sanitizeOrEmitInvalid,
  DIAL_COUNTRY,
  isIncomingRinging,
} from '../core/view-model';
import type { Call, CallEndReason, DialStackPhone, PhoneError } from '@dialstack/sdk-webrtc';
import type { SoftphoneConnectionState } from './usePhone';
import { useLatestRef } from './useLatestRef';

export interface UseCallsOptions {
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

  /** Fired on a call-placement error (invalid destination, not connected, dial failure). */
  onError?: (e: { code: string; message: string }) => void;
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
}

/**
 * The live call legs. Today at most two entries exist: the active call the user
 * is talking to and, during an attended transfer, the held original it's linked
 * to (via `transferPeer`). The single-call+consult shape is a special case of
 * this list; the list is what lets call-waiting/multi-call be added later without
 * another slot rework.
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
  // The single source of truth for the live legs. Roles ARE the pointers — the
  // active call is the `'active'` entry, the consult is the `'consult'` entry —
  // so there's no separate active-call field to keep in sync. Entries hold the
  // `Call` object (not its id, which is mutable across the outbound→server-id
  // swap), so identity survives that swap.
  calls: CallEntry[];
}

type CallsAction =
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
  // Teardown / phone change: no calls.
  | { type: 'reset' };

const IDLE: CallsState = { calls: [] };

// Max concurrent live calls (active + held + ringing). Beyond this a new inbound
// is rejected busy — an explicit rejection, not silence, so the caller's phone
// stops ringing at once and any downstream routing (voicemail, failover) fires
// immediately instead of waiting on a dead branch. A soft cap, not a protocol
// constraint. Exported so the UI's add-call control disables against the same
// number the hook enforces.
export const MAX_CALLS = 4;

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
      return state.calls.length === 0 ? state : IDLE;
  }
}

/**
 * Present the live calls of a phone as React state. Given the `phone` (owned by
 * `usePhone`) and its `connection`, it wires per-call listeners and exposes the
 * foreground call + call actions. Re-wires when the phone instance changes
 * (reconnect); clears its call list when the phone goes away.
 */
export function useCalls(
  phone: DialStackPhone | null,
  connection: SoftphoneConnectionState,
  options: UseCallsOptions = {}
): UseCallsResult {
  const { onIncomingCall, onCallStarted, onCallActivated, onCallEnded, onError } = options;

  const [state, dispatch] = useReducer(callsReducer, IDLE);
  // Clear the call list the instant the phone instance changes (a reconnect /
  // credential swap hands us a fresh phone from usePhone), synchronously DURING
  // render — NOT only in the wiring effect's cleanup, which runs a commit later.
  // The effect-cleanup reset alone lagged the connection reset (owned by usePhone)
  // by one frame, so a mid-call token/account switch could paint the previous
  // session's call cards for ~16ms before they cleared. This is React's canonical
  // "reset state when a prop changes during render" pattern: tracking the last
  // phone in STATE (a ref write during render is disallowed by react-hooks/refs,
  // but a set-state during render is supported) makes React re-run and discard
  // this render before it paints, so `calls` reads empty on the very first render
  // that sees the new phone. The effect still owns listener teardown (a real
  // side-effect); its own reset is then a harmless no-op.
  const [renderedPhone, setRenderedPhone] = useState(phone);
  if (renderedPhone !== phone) {
    setRenderedPhone(phone);
    if (state.calls.length > 0) dispatch({ type: 'reset' });
  }
  const { calls } = state;
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
  // The phone + connection read by the otherwise-stable dispatchers, through refs
  // so they don't get a new identity on every reconnect / connection-lifecycle
  // transition.
  const phoneRef = useLatestRef(phone);
  const connectionRef = useLatestRef(connection);
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
  const consultCallRef = useLatestRef(consultCall);
  // The held original of an in-flight transfer — completeAttendedTransfer /
  // cancelAttendedTransfer act on THIS, not on `activeCall` (which during a
  // transfer is the consult leg).
  const transferOriginalRef = useLatestRef(transferOriginal);

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
  // down and re-wire the phone (the wiring effect depends only on the phone).
  const handlers = useLatestRef({
    onIncomingCall,
    onCallStarted,
    onCallActivated,
    onCallEnded,
    onError,
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
    [rerender, unwireCall, handlers]
  );

  const placeCall = useCallback(
    async (destination: string) => {
      const phone = phoneRef.current;
      // Clean the dial string (strip formatting, E.164 a valid PSTN number) so
      // a pasted/formatted "(581) 319-5082" dials as "+15813195082" and we never
      // send characters the server rejects. Extensions/star codes pass through.
      // On junk input, emit the shared invalid-destination error rather than a
      // silent no-op — a host calling placeCall() directly with bad input gets
      // feedback (the built-in DialPad can't reach this; its Call button is gated).
      const target = sanitizeOrEmitInvalid(destination, handlers.current.onError);
      if (!target) return;
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
    [wireCall, connectionRef, handlers, phoneRef]
  );

  // Hold the current active call, then bring `target` to the foreground via
  // `activate` (resume for a held call, answer for a ringing one) and `dispatch`
  // the reducer action. Shared by switchToCall + answerCall — the only difference
  // between them is the activate call and the action. Optimistic: the reducer
  // flips `active` immediately and the server `held`/`resumed`/`answered` echoes
  // settle each call's state on the rerender tick. On failure it rolls the held
  // call back (best-effort resume, unless it already ended) so a failed
  // activate() never strands the live conversation on hold.
  const holdThenActivate = useCallback(
    (activate: () => void, action: CallsAction) => {
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
    },
    [handlers]
  );

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
    [wireCall, consultCallRef, handlers, phoneRef]
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
  }, [consultCallRef, handlers, transferOriginalRef]);

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
  }, [unwireCall, consultCallRef, transferOriginalRef]);

  // Wire the phone's incoming-call event + per-call listeners for the CURRENT
  // phone instance. Keyed on the phone identity: a reconnect swaps in a new phone
  // (fresh instance from usePhone), so this re-runs — unwiring the old phone's
  // calls and clearing the call list — and attaches to the new one. On unmount it
  // does the same teardown. Errors from the phone's own event (fatal etc.) are
  // owned by usePhone; here we only care about incoming calls.
  useEffect(() => {
    if (!phone) return;
    let disposed = false;
    // Snapshot the stable Map container (not its contents) so the cleanup reads
    // the live set of wired calls at teardown time — calls are added to it after
    // this effect runs, so it must iterate `.current` then, not an early copy.
    const wired = unwireByCall.current;
    const onIncoming = (call: Call) => {
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
    };
    phone.on('incoming', onIncoming);

    return () => {
      disposed = true;
      phone.off('incoming', onIncoming);
      // Unwire every wired call (foreground + any consult leg).
      for (const off of wired.values()) off();
      wired.clear();
      // No calls (atomic) — the old phone's legs are gone with it.
      dispatch({ type: 'reset' });
    };
  }, [phone, wireCall, handlers]);

  return {
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
  };
}
