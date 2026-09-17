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
import {
  LocalConference,
  supportsConference,
  type Call,
  type CallEndReason,
  type DialStackPhone,
  type PhoneError,
} from '@dialstack/sdk-webrtc';
import type { SoftphoneConnectionState } from './usePhone';
import { useLatestRef } from './useLatestRef';

export interface UseCallsOptions {
  /** Fired when an inbound call arrives and becomes the foreground call. */
  onIncomingCall?: (e: { callId: string; from: string; fromName: string | null }) => void;

  /** Fired when a call (in or out) becomes the foreground call. */
  onCallStarted?: (e: { direction: 'inbound' | 'outbound'; peer: string }) => void;

  /** Fired when a call is answered (becomes active). */
  onCallActivated?: (call: Call) => void;

  /** Fired when the foreground call ends. */
  onCallEnded?: (e: { reason: CallEndReason }) => void;

  /** Fired on a call-placement error (invalid destination, not connected, dial failure). */
  onError?: (e: { code: string; message: string }) => void;

  /**
   * Places an outbound call and returns the `Call`. Defaults to `phone.call`.
   * `destination` is already sanitized to E.164 / an extension.
   */
  placeOutbound?: (destination: string) => Promise<Call>;
}

/**
 * A live call leg. The entry adds only what the `Call` can't carry (transfer
 * relationship, UI focus); active/held/muted/ringing/duration are read from
 * `call.state` / `call.isMuted`, the single source of truth.
 */
export interface CallEntry {
  call: Call;
  /**
   * The call the user is on-screen with. Whenever any ANSWERED call is in the
   * list, exactly one entry is active; a list of only-ringing inbound has none.
   * Enforced on every transition by `withActiveCall`.
   */
  active: boolean;
  /**
   * The other leg of an attended transfer, or null. Set on BOTH participants so
   * the relationship is navigable either way.
   */
  transferPeer: Call | null;
  /**
   * This leg's STABLE role in an attended transfer, or null. Role — not which
   * call is active — tells the UI which leg to Complete-bridge ('original') and
   * which is the consult target; preserved across `switchActive`.
   */
  transferRole: 'original' | 'consult' | null;
  /** Whether this leg is part of the local conference. Every merged leg is live and un-held. */
  merged: boolean;
}

export interface UseCallsResult {
  /** Every live call leg — active, held, and ringing inbound. The views below derive from this. */
  calls: CallEntry[];
  /** The single call the user is talking to, or null. */
  activeCall: Call | null;
  /** Ringing inbound calls not yet answered. Answering one holds the active call. */
  incomingCalls: Call[];
  /** Switch the active call to an already-answered held `call`. No-op if already active or not held. */
  switchToCall: (call: Call) => void;
  /** Answer a ringing inbound call; holds the current active call. */
  answerCall: (call: Call) => void;
  /** Place an outbound call; holds any active call. No-ops unless connected. Errors via `onError`. */
  placeCall: (destination: string) => Promise<void>;

  /** The consult leg of an in-progress attended transfer, or null. */
  consultCall: Call | null;

  /** All held (backgrounded) answered calls. Excludes ringing inbound (see `incomingCalls`). */
  heldCalls: Call[];

  /**
   * The held original being transferred to `consultCall`, or null — the consult's
   * `transferPeer`, NOT merely "a held call", so it stays correct with other held calls present.
   */
  transferOriginal: Call | null;

  /** Attended transfer step 1: hold `activeCall` and dial `destination` as a consult leg. */
  startAttendedTransfer: (destination: string) => Promise<void>;

  /** Attended transfer step 2: bridge the held original to the consult. No-op unless consult is answered. */
  completeAttendedTransfer: () => void;

  /** Abandon an attended transfer: hang up the consult, resume the held original. */
  cancelAttendedTransfer: () => void;

  /** Calls bridged into a local three-way conference, or empty when not merged. */
  mergedCalls: Call[];

  /** Whether a local conference is in progress. */
  isMerged: boolean;

  /**
   * While merged, every remote party mixed together. The audio sink binds to this
   * instead of one call's `remoteMediaStream`, which would play only the focused leg.
   */
  conferenceAudio: MediaStream | null;

  /** Whether `mergeCalls()` would do anything: two connected calls, no transfer, local mixing available. */
  canMerge: boolean;

  /**
   * Bridge the active + held calls into one locally-mixed conversation (no server
   * conference). Every leg is resumed — a merged leg must not stay held or its media stops.
   */
  mergeCalls: () => void;

  /** End the conference; legs survive as ordinary concurrent calls (first active, rest held). */
  splitMerge: () => void;

  /**
   * Hang up EVERY leg of the conference. The merged UI shows one Hang up, so ending
   * only the focused leg would leave the user connected to the other party. No-op when not merged.
   */
  hangupConference: () => void;
  /** Hold or resume every leg of the conference together. */
  holdConference: (held: boolean) => void;
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
  /**
   * While merged, the conference's mixed monitor stream — every remote party,
   * which is what the local user should hear. Carried through the reducer with
   * the merge transition (rather than read off the conference during render) so
   * the audio the sink plays and the legs the UI shows always change together.
   */
  conferenceAudio: MediaStream | null;
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
  | { type: 'merged'; calls: Call[]; audio: MediaStream | null }
  | { type: 'unmerged' }
  // Teardown / phone change: no calls.
  | { type: 'reset' };

const IDLE: CallsState = { calls: [], conferenceAudio: null };

// Max concurrent live calls (active + held + ringing). Beyond this a new inbound
// is rejected busy — an explicit rejection, not silence, so the caller's phone
// stops ringing at once and any downstream routing (voicemail, failover) fires
// immediately instead of waiting on a dead branch. A soft cap, not a protocol
// constraint. Exported so the UI's add-call control disables against the same
// number the hook enforces.
export const MAX_CALLS = 4;

// Remote parties in a conference, so two is a three-way. Separate from MAX_CALLS:
// the phone can hold more calls than it can usefully mix, and each merged leg
// costs another outbound stream.
export const MAX_CONFERENCE_LEGS = 2;

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
        : {
            call: action.call,
            active: true,
            transferPeer: null,
            transferRole: null,
            merged: false,
          };
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
          {
            call: action.call,
            active: false,
            transferPeer: null,
            transferRole: null,
            merged: false,
          },
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
        ? [
            {
              call: original,
              active: false,
              transferPeer: action.call,
              transferRole: 'original',
              merged: false,
            },
          ]
        : [];
      return {
        ...state,
        calls: [
          ...others,
          ...originalEntry,
          {
            call: action.call,
            active: true,
            transferPeer: original,
            transferRole: 'consult',
            merged: false,
          },
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
          {
            call: original.call,
            active: true,
            transferPeer: null,
            transferRole: null,
            merged: false,
          },
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
            ? { call: e.call, active: true, transferPeer: null, transferRole: null, merged: false }
            : e
        );
      }
      // Any other case where the active call left the list (a plain active call
      // ended with held calls remaining) is repaired by the active-call invariant
      // applied to every transition below.
      return { ...state, calls };
    }
    case 'merged': {
      // Focus moves to a leg that is actually in the conference; the
      // previously-focused call may not be.
      const [anchor] = action.calls;
      if (!anchor) return state;
      const inMerge = new Set(action.calls);
      return {
        ...state,
        conferenceAudio: action.audio,
        calls: state.calls.map((e) =>
          inMerge.has(e.call)
            ? { ...e, merged: true, active: e.call === anchor }
            : { ...e, active: false }
        ),
      };
    }
    case 'unmerged': {
      if (!state.calls.some((e) => e.merged)) return state;
      return {
        ...state,
        conferenceAudio: null,
        calls: state.calls.map((e) => (e.merged ? { ...e, merged: false } : e)),
      };
    }
    case 'reset':
      return state.calls.length === 0 ? state : IDLE;
  }
}

/**
 * Present a phone's live calls as React state: wires per-call listeners and
 * exposes the foreground call + call actions. Re-wires when the phone instance
 * changes (reconnect); clears its call list when the phone goes away.
 */
export function useCalls(
  phone: DialStackPhone | null,
  connection: SoftphoneConnectionState,
  options: UseCallsOptions = {}
): UseCallsResult {
  const { onIncomingCall, onCallStarted, onCallActivated, onCallEnded, onError, placeOutbound } =
    options;

  const [state, dispatch] = useReducer(callsReducer, IDLE);
  // Clear the call list synchronously DURING render when the phone instance
  // changes — resetting only in the wiring effect's cleanup lagged one frame, so a
  // mid-call token/account switch painted the previous session's call cards for
  // ~16ms. React's "reset state when a prop changes during render" pattern
  // (set-state during render is supported; a ref write here is not).
  const [renderedPhone, setRenderedPhone] = useState(phone);
  if (renderedPhone !== phone) {
    setRenderedPhone(phone);
    if (state.calls.length > 0) dispatch({ type: 'reset' });
  }
  const { calls, conferenceAudio } = state;
  const activeEntry = calls.find((e) => e.active) ?? null;
  const activeCall = activeEntry?.call ?? null;
  // `incomingCalls` excludes the active entry: answering flips `active`
  // immediately but `call.state` stays 'ringing' until the server echo, and
  // without the guard the just-answered call would render BOTH as the in-call
  // panel and as an incoming card during the echo window. Memoized so the
  // per-second duration tick doesn't change array identity.
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
  // Memoized so the per-second duration tick doesn't change array identity.
  const mergedCalls = useMemo(() => calls.filter((e) => e.merged).map((e) => e.call), [calls]);
  const isMerged = mergedCalls.length > 0;
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
  // A ref, not state: an imperative audio-graph handle. `calls[].merged` drives
  // rendering.
  const conferenceRef = useRef<LocalConference | null>(null);
  const callsRef = useLatestRef(calls);
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

  // Read through a ref so a changed handler identity doesn't tear down and re-wire the phone.
  const handlers = useLatestRef({
    onIncomingCall,
    onCallStarted,
    onCallActivated,
    onCallEnded,
    onError,
    placeOutbound,
  });

  // Keyed by call because attended transfer wires TWO at once (original + consult).
  const unwireByCall = useRef(new Map<Call, () => void>());

  // Calls the host was told about. onCallEnded fires only for these, so a consult
  // leg (never announced as a start) emits no spurious end, and a completed
  // transfer fires onCallEnded once, for the original.
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
        // Below two legs there is no conference left to mix.
        const conference = conferenceRef.current;
        if (conference?.has(call)) {
          conference.remove(call);
          if (conference.calls.length < 2) {
            conference.dispose();
            conferenceRef.current = null;
            dispatch({ type: 'unmerged' });
          }
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
      if (unwireByCall.current.size >= MAX_CALLS) {
        handlers.current.onError?.({ code: 'rate_limited', message: 'Too many active calls' });
        return;
      }
      // Hold the current active call before the new outbound becomes active (real
      // hold/resume, not two live audio legs). If the dial fails, resume it in the
      // catch. `hold()` only sends the message — state flips 'held' on the server
      // echo — so resume the same call, don't gate on its (still-'active') state.
      const previouslyActive = activeCallRef.current;
      try {
        previouslyActive?.hold();
        const call = await (handlers.current.placeOutbound?.(target) ?? phone.call(target));
        dispatch({ type: 'active', call });
        notifiedCalls.current.add(call);
        handlers.current.onCallStarted?.({ direction: 'outbound', peer: call.to });
        wireCall(call);
      } catch (err) {
        // Dial failed after we held the previous call — un-hold it. Guarded: a
        // bare resume() re-throws transport_closed when the socket is down, which
        // would escape as an unhandled rejection AND swallow the dial error.
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

  const mergeCalls = useCallback(() => {
    if (conferenceRef.current) return;
    // Public surface, so enforced here too. Counts EVERY live leg: a ringing
    // inbound is not `isConnected`, and its Answer is not disabled while merged.
    const entries = callsRef.current;
    if (entries.length !== MAX_CONFERENCE_LEGS) return;
    if (!entries.every((e) => e.call.isConnected) || !supportsConference()) return;
    const connected = entries.map((e) => e.call);
    // A transfer's two legs already mean something specific.
    if (callsRef.current.some((e) => e.transferRole !== null)) return;
    // Hold is a server-side media stop, so a held leg would sit silent in the
    // conference. Before building the graph, so the tracks are live.
    const resumed: Call[] = [];
    for (const call of connected) {
      if (call.state === 'held') {
        try {
          call.resume();
          resumed.push(call);
        } catch {
          // Best-effort; the server echo settles it.
        }
      }
    }
    try {
      // All legs share one capture — no second getUserMedia.
      const conference = LocalConference.merge(connected, connected[0]!.localMediaStream, (e) =>
        handlers.current.onError?.({ code: e.code ?? 'call_failed', message: e.message })
      );
      conferenceRef.current = conference;
      dispatch({ type: 'merged', calls: connected, audio: conference.localMediaStream });
      rerender();
    } catch (err) {
      // Not `call.hold()`: state is still 'held' this tick, so its guard would
      // swallow the undo and leave both parties live behind a held UI.
      for (const call of resumed) {
        try {
          call.holdAfterResume();
        } catch {
          // Best-effort — the leg may itself have ended.
        }
      }
      const e = err as PhoneError;
      handlers.current.onError?.({ code: e.code ?? 'call_failed', message: e.message });
    }
  }, [callsRef, conferenceRef, handlers, rerender]);

  const splitMerge = useCallback(() => {
    const conference = conferenceRef.current;
    if (!conference) return;
    conference.dispose();
    conferenceRef.current = null;
    // The anchor stays active; the rest become held, which is what the multi-call
    // UI already knows how to render.
    for (const entry of callsRef.current) {
      // Not gated on state === 'active': a merge-time resume() only sends the
      // frame, so a leg split moments later may still read 'held' while the echo
      // is in flight — and would then never be re-held. hold() itself no-ops
      // unless the call is active, which is the correct filter.
      if (entry.merged && !entry.active) {
        try {
          entry.call.hold();
        } catch {
          // Best-effort — the leg may have ended.
        }
      }
    }
    dispatch({ type: 'unmerged' });
    rerender();
  }, [callsRef, conferenceRef, rerender]);

  // Hang up the whole conference. Tearing the mixer down FIRST returns each leg
  // to its own mic uplink, so the hangups go out on ordinary calls rather than
  // racing the graph's teardown; each leg's own `ended` then clears its entry.
  // Hold every leg together. Holding one alone silences that party to the
  // other, which is why Call.hold() refuses while merged; doing all of them is
  // the coherent version, and the conference stays up throughout.
  const holdConference = useCallback(
    (held: boolean) => {
      const conference = conferenceRef.current;
      if (!conference) return;
      for (const call of conference.calls) {
        try {
          call.setConferenceHold(held);
        } catch (err) {
          const e = err as PhoneError;
          handlers.current.onError?.({ code: e.code ?? 'call_failed', message: e.message });
        }
      }
      rerender();
    },
    [conferenceRef, handlers, rerender]
  );

  const hangupConference = useCallback(() => {
    const conference = conferenceRef.current;
    if (!conference) return;
    const legs = conference.calls;
    conference.dispose();
    conferenceRef.current = null;
    dispatch({ type: 'unmerged' });
    for (const call of legs) {
      try {
        call.hangup();
      } catch (err) {
        // Surfaced, not swallowed: a failed hangup (socket down) leaves the party
        // live with the mic on the wire, and every other action reports that.
        const e = err as PhoneError;
        handlers.current.onError?.({ code: e.code ?? 'call_failed', message: e.message });
      }
    }
  }, [conferenceRef, handlers]);

  const startAttendedTransfer = useCallback(
    async (destination: string) => {
      const call = activeCallRef.current;
      const phone = phoneRef.current;
      // Same clean-up as placeCall so the consult leg dials a valid destination.
      const target = sanitizeDestination(destination, DIAL_COUNTRY);
      // No-op unless there's an active call and no consult already in progress.
      // Also refused while merged: the consult frame makes the server hold the
      // parent, which during a conference silences that party to the others.
      if (!call || consultCallRef.current || !target || conferenceRef.current) return;
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
    consult.hangup();
    // hangup() only sends the request; the consult's `ended` echo isn't guaranteed
    // for an unanswered outbound leg, so unwire now or its listeners (and the hook
    // closure they retain) leak.
    unwireCall(consult);
    if (original?.state === 'held') original.resume();
    dispatch({ type: 'cancelConsult' });
  }, [unwireCall, consultCallRef, transferOriginalRef]);

  // Wire the phone's incoming-call event for the CURRENT phone instance. Keyed on
  // phone identity, so a reconnect re-runs this (unwiring the old phone, attaching
  // to the new). Phone-level errors are owned by usePhone.
  useEffect(() => {
    if (!phone) return;
    let disposed = false;
    // Snapshot the stable Map container, not its contents: calls are added after
    // this effect runs, so cleanup must iterate `.current` then, not an early copy.
    const wired = unwireByCall.current;
    const onIncoming = (call: Call, opts?: { notifyHost?: boolean }) => {
      if (disposed) return;
      const notifyHost = opts?.notifyHost ?? true;
      // Gate on the wired-call map (synchronous) not activeCallRef (a render late),
      // so INVITEs arriving in one commit cycle each see the ones before them.
      // A live conference is busy: answering would hold() a conference party,
      // silencing one member. Refuse outright so the caller's routing (voicemail,
      // failover) takes over immediately.
      if (conferenceRef.current || unwireByCall.current.size >= MAX_CALLS) {
        call.reject('busy');
        return;
      }
      dispatch({ type: 'incomingAdded', call });
      // A call adopted already-answered (push-wake) is NOT incoming — firing
      // onIncomingCall would tell a host to report a live call as a new session.
      if (notifyHost) {
        notifiedCalls.current.add(call);
        handlers.current.onIncomingCall?.({
          callId: call.id,
          from: call.from,
          fromName: call.fromName,
        });
      }
      wireCall(call);
    };
    phone.on('incoming', onIncoming);

    // Adopt calls that already exist on the phone. A host-owned phone can connect
    // and answer via push wake before any UI mounts, so those 'incoming'/'answered'
    // events are long gone; without this the softphone renders an idle dial pad
    // over a live call.
    for (const existing of phone.activeCalls ?? []) {
      if (unwireByCall.current.has(existing)) continue;
      // Only inbound adopts through the incoming path: an outbound leg would render
      // as a ringing incoming card and fire onIncomingCall for a call the user dialed.
      if (existing.direction !== 'inbound') continue;
      // An already-answered call is live, not incoming — don't notify the host.
      onIncoming(existing, { notifyHost: !existing.isConnected });
      if (existing.isConnected) {
        // The 'answered' event that would have registered this in notifiedCalls
        // fired before this hook existed, so onCallEnded would never fire —
        // stranding an open CallKit/Telecom session. Register it so its end is
        // announced exactly once. answeredInPlace, not answered: catching up to a
        // reached state, must not hold anything else.
        notifiedCalls.current.add(existing);
        dispatch({ type: 'answeredInPlace', call: existing });
      }
    }

    return () => {
      disposed = true;
      phone.off('incoming', onIncoming);
      // Tear the conference down with the phone: a leaked AudioContext keeps the
      // tab's audio indicator lit for the rest of the session.
      const conference = conferenceRef.current;
      if (conference) {
        conference.dispose();
        conferenceRef.current = null;
      }
      for (const off of wired.values()) off();
      wired.clear();
      dispatch({ type: 'reset' });
    };
  }, [phone, wireCall, handlers]);

  // EXACTLY MAX_CONFERENCE_LEGS, not "at least": a third live call has no place in
  // a three-way, and silently merging only two would leave the user guessing which.
  const canMerge =
    !isMerged &&
    // Count EVERY leg, not just connected: a ringing inbound is not `isConnected`
    // and its Answer isn't disabled while merged, so it must not slip past here.
    calls.length === MAX_CONFERENCE_LEGS &&
    calls.every((e) => e.call.isConnected) &&
    !calls.some((e) => e.transferRole !== null) &&
    supportsConference();

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
    mergedCalls,
    isMerged,
    conferenceAudio,
    canMerge,
    mergeCalls,
    splitMerge,
    hangupConference,
    holdConference,
  };
}
