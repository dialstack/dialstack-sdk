import { FakeOsCallAdapter } from '../../os/FakeOsCallAdapter';
import { NativeCallBridge, toOsEndReason } from '../NativeCallBridge';
import { RuntimeHold } from '../RuntimeHold';
import { FakeCall, FakeLifecycle, FakePhone } from '../fakes';

const flush = async (): Promise<void> => {
  // Enough microtask turns for the bridge's awaited getActiveSession/connect chains.
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

const PUSHED = 'call_pushed';
const DELIVERED = 'call_delivered';
const S1 = '11111111-1111-4111-8111-111111111111';

function rig(overrides: Partial<ConstructorParameters<typeof NativeCallBridge>[0]> = {}) {
  const phone = new FakePhone();
  const os = new FakeOsCallAdapter();
  const lifecycle = new FakeLifecycle();
  const hold = new RuntimeHold(45_000);
  const bridge = new NativeCallBridge({ phone, os, lifecycle, hold, ...overrides });
  return { phone, os, lifecycle, hold, bridge };
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('cold wake', () => {
  it('connects on the queued report, adopts the delivered call, and answers from the OS', async () => {
    const { phone, os, hold, bridge } = rig();
    // Native reported the call before any JS existed.
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });

    bridge.start();
    await flush();
    expect(phone.connectCalls).toBe(1);
    expect(hold.pending()).not.toBeNull();

    // The resumed INVITE arrives as a different DialStack call.
    const call = new FakeCall(DELIVERED);
    phone.emitIncoming(call);
    await flush();
    expect(os.log.filter((l) => l.startsWith('reportIncoming'))).toHaveLength(0); // not reported twice

    await os.answer(S1);
    await flush();
    expect(call.actions).toEqual(['answer']);
    expect(os.isConnected(S1)).toBe(true);
  });

  it('reconnects on a wake even when isConnected is a stale-true corpse socket', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    // App was foreground and connected.
    phone.isConnected = true;
    // The OS froze the backgrounded app and killed the socket with no close
    // frame: isConnected still reads true, no 'disconnected' fired.
    phone.killSocketSilently();
    const before = phone.connectCalls;

    // A wake arrives. Trusting isConnected would skip the reconnect and the AOR
    // would never re-REGISTER, so the parked call is never re-forked.
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    await flush();

    // The bridge shed the corpse and connected for real.
    expect(phone.disconnectCalls).toBeGreaterThan(0);
    expect(phone.connectCalls).toBe(before + 1);

    // And the parked call is then delivered and answerable.
    const call = new FakeCall(DELIVERED);
    phone.emitIncoming(call);
    await flush();
    await os.answer(S1);
    await flush();
    expect(call.actions).toEqual(['answer']);
  });

  it('does not tear down a live socket on a wake that arrives during a call', async () => {
    // Call-waiting: a wake with a live call must NOT force a reconnect — the live
    // call proves the socket, and a teardown would drop it.
    const { phone, os, bridge } = rig();
    bridge.start();
    phone.isConnected = true;
    const live = new FakeCall('call_live');
    phone.emitIncoming(live); // a call is up
    await flush();
    const disconnectsBefore = phone.disconnectCalls;

    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    await flush();
    expect(phone.disconnectCalls).toBe(disconnectsBefore); // socket left alone
  });

  it('applies an answer that landed before the call arrived, once', async () => {
    const { phone, os, bridge } = rig();
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();

    await os.answer(S1);
    await os.answer(S1); // second tap while the first is held
    await flush();

    const call = new FakeCall(DELIVERED);
    phone.emitIncoming(call);
    await flush();
    expect(call.actions).toEqual(['answer']);
    expect(os.log.filter((l) => l.startsWith('reportConnected'))).toEqual([
      `reportConnected ${S1}`,
    ]);
  });

  it('discards a held answer older than the TTL', async () => {
    let now = 1_000_000;
    const { phone, os, bridge } = rig({ now: () => now, answerTtlMs: 30_000 });
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    await os.answer(S1);
    now += 31_000;

    const call = new FakeCall(DELIVERED);
    phone.emitIncoming(call);
    await flush();
    expect(call.actions).toEqual([]);
  });

  it('applies a decline that landed before the call arrived', async () => {
    const { phone, os, bridge } = rig();
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    await os.end(S1);
    await flush();

    const call = new FakeCall(DELIVERED);
    phone.emitIncoming(call);
    await flush();
    expect(call.actions).toEqual(['reject:decline']);
  });

  it('tears down when registration succeeds but nothing is delivered', async () => {
    const { phone, os, hold, bridge } = rig({ deliveryDeadlineMs: 5_000 });
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    expect(phone.isConnected).toBe(true);

    jest.advanceTimersByTime(4_999);
    await flush();
    expect(os.sessionCount()).toBe(1);

    jest.advanceTimersByTime(1);
    await flush();
    expect(os.log).toContain(`reportEnded ${S1} failed`);
    expect(phone.disconnectCalls).toBe(1);
    expect(hold.pending()).toBeNull();
  });

  it('tears down when the socket never comes up', async () => {
    const { phone, os, hold, bridge } = rig({ registrationDeadlineMs: 20_000 });
    phone.manualConnect = true;
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();

    jest.advanceTimersByTime(20_000);
    await flush();
    expect(os.log).toContain(`reportEnded ${S1} failed`);
    expect(hold.pending()).toBeNull();
  });

  it('tears down immediately when connect() rejects', async () => {
    const { phone, os, bridge } = rig();
    phone.failConnectWith = new Error('bad token');
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    jest.advanceTimersByTime(0);
    await flush();
    expect(os.log).toContain(`reportEnded ${S1} failed`);
  });

  it('does not map when the OS describes a different session', async () => {
    const { phone, os, bridge } = rig();
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    // Simulate a mismatching pull by racing a second native report.
    os.nativeReportIncoming({ sessionId: 'other', callId: 'call_other' });
    await flush();
    const call = new FakeCall(DELIVERED);
    phone.emitIncoming(call);
    await flush();
    // The bridge could not trust the pull for S1, so it reported the call itself.
    expect(bridge.getTrace().some((l) => l.includes('not mapped'))).toBe(true);
  });
});

describe('foreground', () => {
  it('reports an SDK incoming to the OS and answers from the in-app button through the OS', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    const call = new FakeCall('call_fg', '5551234');
    phone.emitIncoming(call);
    await flush();
    expect(os.log[0]).toBe(`reportIncoming ${sessionOf(os)} 5551234`);

    bridge.answer('call_fg');
    await flush();
    expect(call.actions).toEqual(['answer']);
    expect(os.isConnected(sessionOf(os))).toBe(true);
  });

  it('an OS end before answer declines, after answer hangs up', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    const ringing = new FakeCall('c1');
    phone.emitIncoming(ringing);
    await flush();
    await os.end(sessionOf(os));
    expect(ringing.actions).toEqual(['reject:decline']);
    ringing.emitEnded('rejected');
    await flush();

    const active = new FakeCall('c2');
    phone.emitIncoming(active);
    await flush();
    await os.answer(sessionOf(os, 1));
    await os.end(sessionOf(os, 1));
    expect(active.actions).toEqual(['answer', 'hangup']);
  });

  it('reports an SDK-side end with the mapped reason and releases the hold', async () => {
    const { phone, os, hold, bridge } = rig();
    bridge.start();
    hold.acquire();
    const call = new FakeCall('c1');
    phone.emitIncoming(call);
    await flush();
    const sid = sessionOf(os);
    call.emitEnded('no-answer');
    await flush();
    expect(os.log).toContain(`reportEnded ${sid} unanswered`);
    expect(hold.pending()).toBeNull();
  });
});

describe('echo tolerance', () => {
  it('a remote hold is reported once and its echo is not taken for an OS request', async () => {
    const { phone, os, bridge } = rig(); // fake echoes set* like the real library
    bridge.start();
    const call = new FakeCall('c1');
    phone.emitIncoming(call);
    await flush();
    const sid = sessionOf(os);
    call.emitHeld('remote');
    await flush();
    expect(os.log.filter((l) => l.startsWith('setHeld'))).toEqual([`setHeld ${sid} true`]);
    expect(call.actions).toEqual([]);

    call.emitResumed();
    await flush();
    expect(os.log.filter((l) => l.startsWith('setHeld'))).toEqual([
      `setHeld ${sid} true`,
      `setHeld ${sid} false`,
    ]);
    expect(call.actions).toEqual([]);
  });

  it('a local hold is not reported back to the OS', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    const call = new FakeCall('c1');
    phone.emitIncoming(call);
    await flush();
    os.hold(sessionOf(os), true);
    expect(call.actions).toEqual(['hold']);
    call.emitHeld('local');
    await flush();
    expect(os.log.filter((l) => l.startsWith('setHeld'))).toEqual([]);
  });

  it('a non-echoing adapter does not strand the hold-echo token and drop a later Resume', async () => {
    // The shipped callkeep skeleton does NOT echo setHeld. With a bare-Set token
    // the un-consumed suppression leaked and swallowed the user's next genuine OS
    // Resume, leaving the call held (a dead Resume button). Value-matching the
    // token means only the exact echo is suppressed.
    const os = new FakeOsCallAdapter({ echoSetActions: false });
    const { phone, bridge } = rig({ os });
    bridge.start();
    const call = new FakeCall('c1');
    phone.emitIncoming(call);
    await flush();
    const sid = sessionOf(os);

    // Far end holds us → reported once, no echo comes back, token left pending.
    call.emitHeld('remote');
    await flush();
    expect(os.log.filter((l) => l.startsWith('setHeld'))).toEqual([`setHeld ${sid} true`]);
    expect(call.actions).toEqual([]);

    // User taps Resume on the OS UI (held=false). It must NOT be swallowed by the
    // stranded held=true token — the call must actually resume.
    os.hold(sid, false);
    expect(call.actions).toEqual(['resume']);
  });

  it('mute mirrors the desired state and ignores duplicates', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    const call = new FakeCall('c1');
    phone.emitIncoming(call);
    await flush();
    const sid = sessionOf(os);
    os.mute(sid, true);
    os.mute(sid, true);
    os.mute(sid, false);
    expect(call.actions).toEqual(['mute', 'unmute']);
  });

  it('DTMF is forwarded as one string', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    const call = new FakeCall('c1');
    phone.emitIncoming(call);
    await flush();
    os.dtmf(sessionOf(os), '123#');
    expect(call.actions).toEqual(['dtmf:123#']);
  });
});

describe('lifecycle', () => {
  it('drops the registration when backgrounded with nothing live, reconnects on active', async () => {
    const { phone, lifecycle, bridge } = rig();
    bridge.start();
    await bridge.ensureConnected();
    lifecycle.set('background');
    expect(phone.disconnectCalls).toBe(1);
    lifecycle.set('active');
    await flush();
    expect(phone.connectCalls).toBe(2);
  });

  it('keeps the registration when backgrounded during a wake', async () => {
    const { phone, os, lifecycle, bridge } = rig();
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    lifecycle.set('background');
    expect(phone.disconnectCalls).toBe(0);
  });

  it('a reused session id clears the stale call id from reportedToOs', async () => {
    // Wake #1 reports S1/PUSHED and maps it (PUSHED enters reportedToOs). The OS
    // then RECYCLES S1 for a fresh wake with a DIFFERENT call id. The reused-session
    // branch must clear the STALE PUSHED — reading the id map BEFORE forgetting the
    // session. Reading it after (the bug) always yields undefined, so PUSHED leaks
    // forever, wakeInFlight() stays true, and the backgrounded registration drop is
    // wedged. Asserted directly on the private set so the deadline handler (which
    // also cleans reportedToOs) can't mask the reused-branch behavior under test.
    type Internals = { reportedToOs: Set<string> };
    const { os, bridge } = rig();
    const internals = bridge as unknown as Internals;
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    expect(internals.reportedToOs.has(PUSHED)).toBe(true);

    // The OS reuses S1 for a fresh wake carrying a different call id. Drive the
    // reused-session branch in isolation and assert the stale id is gone before any
    // deadline could clean it.
    os.nativeReportIncoming({ sessionId: S1, callId: 'call_pushed_2' });
    expect(internals.reportedToOs.has(PUSHED)).toBe(false);
  });

  it('keeps the registration when backgrounded during a call', async () => {
    const { phone, lifecycle, bridge } = rig();
    bridge.start();
    await bridge.ensureConnected();
    phone.emitIncoming(new FakeCall('c1'));
    await flush();
    lifecycle.set('background');
    expect(phone.disconnectCalls).toBe(0);
  });

  it('ensureConnected does not connect when a connect is already in flight on the phone', async () => {
    const { phone, bridge } = rig();
    bridge.start();
    // Something else (the UI provider adopting the same phone) started a connect.
    phone.manualConnect = true;
    void phone.connect();
    expect(phone.connectCalls).toBe(1);
    // The bridge must not add a second — connect() would throw "already connecting".
    await bridge.ensureConnected();
    expect(phone.connectCalls).toBe(1);
  });

  it('ensureConnected is single-flight and re-arms after a disconnect', async () => {
    const { phone, bridge } = rig();
    bridge.start();
    phone.manualConnect = true;
    const a = bridge.ensureConnected();
    const b = bridge.ensureConnected();
    expect(a).toBe(b);
    expect(phone.connectCalls).toBe(1);
    phone.resolveConnect();
    await a;
    await bridge.ensureConnected();
    expect(phone.connectCalls).toBe(1);
    phone.disconnect();
    phone.manualConnect = false;
    await bridge.ensureConnected();
    expect(phone.connectCalls).toBe(2);
  });
});

describe('answer-before-arrival exclusion', () => {
  it('fails a second answer tap while the first is held, keeps the first', async () => {
    const { phone, os, bridge } = rig();
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    await os.answer(S1);
    await os.answer(S1); // second tap, same session, still no SDK call
    await flush();
    // Exactly one answer is honored when the call finally lands.
    const call = new FakeCall(DELIVERED);
    phone.emitIncoming(call);
    await flush();
    expect(call.actions).toEqual(['answer']);
  });

  it('a held decline beats a held answer queued for the same session', async () => {
    const { phone, os, bridge } = rig();
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    await os.answer(S1);
    await os.end(S1); // decline lands after the answer, before the call
    await flush();
    const call = new FakeCall(DELIVERED);
    phone.emitIncoming(call);
    await flush();
    expect(call.actions).toEqual(['reject:decline']);
  });

  it('tears down SDK and OS when answering the delivered call throws', async () => {
    const { phone, os, bridge } = rig();
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    await os.answer(S1);
    const call = new FakeCall(DELIVERED);
    call.failAnswer = true;
    phone.emitIncoming(call);
    await flush();
    // A call we cannot answer is hung up and torn down, not merely reported to
    // the OS: the SDK call is dropped and the OS session is gone, so no ghost is
    // left in either place with dead controls.
    expect(call.actions).toEqual(['answer', 'hangup']);
    expect(call.state).toBe('ended');
    expect(os.log).toContain(`reportEnded ${S1} failed`);
    expect(os.sessionCount()).toBe(0);
  });

  it('an OS end on a delivered, unanswered call tears down and leaves no ghost', async () => {
    // Models the adapter's 30s answer deadline: when the notification times out
    // the adapter reports the call ended and emits 'end'. The delivered SDK call
    // must go down and the session must be forgotten, or a later call reusing the
    // recycled session id would inherit a dead mapping.
    const { phone, os, bridge } = rig();
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    const call = new FakeCall(DELIVERED);
    phone.emitIncoming(call);
    await flush();
    await os.end(S1); // the deadline fired: reported ended, 'end' emitted
    call.emitEnded('rejected'); // the reject settles through the SDK
    await flush();
    expect(call.actions).toEqual(['reject:decline']);
    expect(os.sessionCount()).toBe(0);

    // The recycled session id now belongs to a fresh, unrelated call: it must
    // ring, not inherit the prior teardown.
    os.nativeReportIncoming({ sessionId: S1, callId: 'call_next' });
    await flush();
    const next = new FakeCall('call_next_delivered');
    phone.emitIncoming(next);
    await flush();
    expect(next.actions).toEqual([]);
  });
});

describe('session hygiene', () => {
  it('a wake session ended before arrival does not leak into the next call on a reused id', async () => {
    const { phone, os, bridge } = rig();
    // First wake: reported, answered before arrival, then the OS drops it.
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    await os.answer(S1);
    await os.end(S1); // OS tears the session down; nothing was delivered
    await flush();
    // The SAME session id is reused for a fresh, unrelated call.
    os.nativeReportIncoming({ sessionId: S1, callId: 'call_new' });
    await flush();
    const call = new FakeCall('call_delivered_2');
    phone.emitIncoming(call);
    await flush();
    // Must NOT auto-answer from the stale tap/decline of the first wake.
    expect(call.actions).toEqual([]);
  });

  it('a decline from a prior DEAD session does not reject a later unrelated call', async () => {
    // Reproduces "every call goes to voicemail": a wake session is declined and
    // torn down; a later, unrelated call must ring, not inherit that decline.
    const { phone, os, bridge } = rig();
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    await os.end(S1); // declined during the wake window; nothing delivered
    await flush();
    // A completely separate wake (different session id) arrives later.
    const OTHER = '22222222-2222-4222-8222-222222222222';
    os.nativeReportIncoming({ sessionId: OTHER, callId: 'call_other_push' });
    await flush();
    const call = new FakeCall('call_other_delivered');
    phone.emitIncoming(call);
    await flush();
    // Must NOT be auto-declined by S1's stale decline.
    expect(call.actions).toEqual([]);
    expect(bridge.getTrace().some((l) => l.includes('held decline applied'))).toBe(false);
  });

  it('ignores an incomingReported for a call the bridge itself reported', async () => {
    const { phone, os, hold, bridge } = rig();
    bridge.start();
    await bridge.ensureConnected();
    const call = new FakeCall('call_fg');
    // The adapter emits incomingReported from INSIDE reportIncoming — before the
    // session id exists to link. That echo must not be taken for a native wake:
    // no RuntimeHold, no wake deadlines, no wakeSessions entry.
    phone.emitIncoming(call);
    await flush();
    expect(hold.pending()).toBeNull();
    const sid = sessionOf(os);
    const connectsBefore = phone.connectCalls;
    // A late re-emit (after the link exists) is a no-op too.
    os.nativeReportIncoming({ sessionId: sid, callId: 'call_fg' });
    await flush();
    expect(phone.connectCalls).toBe(connectsBefore);
    expect(call.actions).toEqual([]);
    expect(hold.pending()).toBeNull();
  });
});

describe('in-app buttons', () => {
  it('answer/end fall back to the call directly when no OS session is mapped', () => {
    const { bridge } = rig();
    bridge.start();
    // No mapping exists; the bridge should still act on a known call.
    // (unmapped id → no-op is acceptable; a mapped-less known call hangs up)
    expect(() => bridge.answer('unknown')).not.toThrow();
    expect(() => bridge.end('unknown')).not.toThrow();
  });
});

describe('outbound calls', () => {
  it('reports an outbound call to the OS, links it, and reports connected on answer', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    phone.isConnected = true;
    const placed = new FakeCall('call_out', '15551234567');
    phone.callResult = placed;

    const call = await bridge.call('15551234567');
    expect(call).toBe(placed);
    // The OS session was opened (the FGS that survives backgrounding) and linked.
    const line = os.log.find((l) => l.startsWith('reportOutgoing'));
    expect(line).toBeDefined();
    const sessionId = line!.split(' ')[1]!;
    expect(os.sessionCount()).toBe(1);

    // Far end picks up → SDK 'answered' → bridge reports the OS session connected.
    placed.emitAnswered();
    await flush();
    expect(os.log).toContain(`reportConnected ${sessionId}`);

    // Hang up → SDK 'ended' → the OS session is torn down, nothing lingers.
    placed.emitEnded('hangup');
    await flush();
    expect(os.sessionCount()).toBe(0);
  });

  it('ends the OS session it opened when placing the call fails', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    phone.isConnected = true;
    phone.failCallWith = new Error('no route');

    await expect(bridge.call('15551234567')).rejects.toThrow('no route');
    // The session opened before placing must not be left as a ghost.
    expect(os.sessionCount()).toBe(0);
    expect(os.log.some((l) => l.startsWith('reportOutgoing'))).toBe(true);
  });

  it('places a call the OS initiated (Recents / Siri / dialer) through the phone', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    phone.isConnected = true;
    const placed = new FakeCall('call_os_dial', '15559998888');
    phone.callResult = placed;

    // The OS says "the user dialled this from the platform UI".
    os.nativeCallIntent('15559998888');
    await flush();

    // The bridge placed it through the phone and opened+linked the OS session.
    expect(phone.outboundCalls).toEqual(['15559998888']);
    expect(os.log.some((l) => l.startsWith('reportOutgoing'))).toBe(true);
    expect(os.sessionCount()).toBe(1);
  });
});

describe('trace', () => {
  it('caps the ring buffer and notifies its subscriber', () => {
    const { bridge } = rig();
    let notifications = 0;
    const off = bridge.subscribeTrace(() => {
      notifications += 1;
    });
    bridge.start(); // emits at least one trace line
    expect(notifications).toBeGreaterThan(0);
    expect(bridge.getTrace().length).toBeGreaterThan(0);
    expect(bridge.getTrace().length).toBeLessThanOrEqual(200);
    off();
  });

  it('getTrace() returns a new identity per change and a stable one between (useSyncExternalStore-safe)', () => {
    const { bridge } = rig();
    const before = bridge.getTrace();
    // Same reference on a repeated read with no change (Object.is bail-out).
    expect(bridge.getTrace()).toBe(before);
    bridge.start(); // emits ≥1 trace line
    const after = bridge.getTrace();
    // New identity after a change, or a useSyncExternalStore consumer never re-renders.
    expect(after).not.toBe(before);
    expect(bridge.getTrace()).toBe(after); // stable again until the next change
  });

  it('supports multiple trace subscribers, and one unsubscribing keeps the other', async () => {
    const { phone, bridge } = rig();
    let a = 0;
    let b = 0;
    const offA = bridge.subscribeTrace(() => {
      a += 1;
    });
    bridge.subscribeTrace(() => {
      b += 1;
    });
    bridge.start();
    // Both notified — a single-field listener would have let the second subscriber
    // replace the first, so `a` would never increment.
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);

    // Unsubscribe A; B must stay attached. With a single field, A's unsubscribe
    // would have nulled out B's listener.
    offA();
    const aAfter = a;
    const bBefore = b;
    phone.emitIncoming(new FakeCall('c1')); // drives more trace lines
    await flush();
    expect(a).toBe(aAfter); // A no longer notified
    expect(b).toBeGreaterThan(bBefore); // B still notified
  });
});

describe('duplicate wake fork', () => {
  it('the second delivery of the same wake does not steal the session; the first stays answered', async () => {
    const { phone, os, bridge } = rig();
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    await os.answer(S1); // held

    // The parked INVITE is forked to us TWICE (server double-resume).
    const first = new FakeCall('call_fork_1');
    const second = new FakeCall('call_fork_2');
    phone.emitIncoming(first);
    await flush();
    phone.emitIncoming(second);
    await flush();

    // First adopts S1 and gets the held answer; second is a duplicate → hung up.
    expect(first.actions).toEqual(['answer']);
    expect(second.actions).toEqual(['hangup']);
    // The OS session stays bound to the first call.
    expect(os.log.filter((l) => l.startsWith('reportConnected'))).toEqual([
      `reportConnected ${S1}`,
    ]);
  });

  it('a new call after the window is left in-app when the OS is at its 1-call cap', async () => {
    // Same shape as a duplicate fork (unmapped call while a wake call is live), but
    // it arrives long after the wake was adopted — a genuinely NEW concurrent
    // caller, not a re-fork. With the default single-call OS cap it is NOT reported
    // to the OS (the established call owns the session) and NOT hung up: it stays a
    // live call for the in-app softphone to ring/answer.
    let clock = 1_000_000;
    const phone = new FakePhone();
    const os = new FakeOsCallAdapter();
    const bridge = new NativeCallBridge({ phone, os, now: () => clock });

    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    await os.answer(S1);

    const first = new FakeCall('call_a');
    phone.emitIncoming(first);
    await flush();
    expect(first.actions).toEqual(['answer']); // adopted + held answer

    // Advance past the ~5s delivery window: a fork now is a new call.
    clock += 30_000;
    const second = new FakeCall('call_b');
    const reportsBefore = os.log.filter((l) => l.startsWith('reportIncoming')).length;
    phone.emitIncoming(second);
    await flush();

    // Not reported to the OS (cap), not hung up (still live in-app).
    expect(os.log.filter((l) => l.startsWith('reportIncoming')).length).toBe(reportsBefore);
    expect(second.actions).not.toContain('hangup');
    expect(second.actions).not.toContain('reject');
  });

  it('reports a second concurrent call when the OS cap allows it (multi-call adapter)', async () => {
    // Raise maxOsCalls for an adapter whose library supports call-waiting: the
    // bridge then reports the second call to the OS as its own session.
    let clock = 1_000_000;
    const phone = new FakePhone();
    const os = new FakeOsCallAdapter({ multiCall: true });
    const bridge = new NativeCallBridge({ phone, os, maxOsCalls: 2, now: () => clock });

    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    await os.answer(S1);

    const first = new FakeCall('call_a');
    phone.emitIncoming(first);
    await flush();

    clock += 30_000;
    const second = new FakeCall('call_b');
    const reportsBefore = os.log.filter((l) => l.startsWith('reportIncoming')).length;
    phone.emitIncoming(second);
    await flush();

    expect(second.actions).not.toContain('hangup');
    expect(os.log.filter((l) => l.startsWith('reportIncoming')).length).toBe(reportsBefore + 1);
  });

  it('within the delivery window a re-fork is still dropped as a duplicate', async () => {
    // The guard is narrowed to the window, not removed: a fork of the SAME parked
    // INVITE that arrives promptly is still a duplicate and must be hung up (the
    // double-ring this logic exists to prevent).
    let clock = 1_000_000;
    const phone = new FakePhone();
    const os = new FakeOsCallAdapter({ multiCall: true });
    const bridge = new NativeCallBridge({ phone, os, now: () => clock });

    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    await os.answer(S1);

    const first = new FakeCall('call_a');
    phone.emitIncoming(first);
    await flush();

    // A re-fork within the window (clock barely advanced).
    clock += 500;
    const dup = new FakeCall('call_a_refork');
    phone.emitIncoming(dup);
    await flush();
    expect(dup.actions).toEqual(['hangup']);
  });
});

describe('fresh token before register', () => {
  it('awaits ensureFreshToken before connecting (mint-before-register on wake)', async () => {
    const order: string[] = [];
    const { phone } = rig();
    const origConnect = phone.connect.bind(phone);
    phone.connect = () => {
      order.push('connect');
      return origConnect();
    };
    const os = new FakeOsCallAdapter();
    const bridge = new NativeCallBridge({
      phone,
      os,
      ensureFreshToken: async () => {
        order.push('refresh');
        phone.setToken('fresh-token');
      },
    });
    bridge.start();
    await bridge.ensureConnected();
    // Refresh must run, and BEFORE connect.
    expect(order).toEqual(['refresh', 'connect']);
    expect(phone.tokens).toEqual(['fresh-token']);
  });

  it('still connects if ensureFreshToken throws (current token may work)', async () => {
    const { phone } = rig();
    const os = new FakeOsCallAdapter();
    const bridge = new NativeCallBridge({
      phone,
      os,
      ensureFreshToken: async () => {
        throw new Error('mint endpoint down');
      },
    });
    bridge.start();
    await bridge.ensureConnected();
    expect(phone.connectCalls).toBe(1);
  });
});

describe('toOsEndReason', () => {
  it('maps every SDK reason', () => {
    expect(toOsEndReason('no-answer')).toBe('unanswered');
    expect(toOsEndReason('rejected')).toBe('declinedElsewhere');
    expect(toOsEndReason('failed')).toBe('failed');
    expect(toOsEndReason('busy')).toBe('remoteEnded');
    expect(toOsEndReason('hangup')).toBe('remoteEnded');
    expect(toOsEndReason('transferred')).toBe('remoteEnded');
  });
});

/** The session id the bridge minted for the nth call it reported itself. */
function sessionOf(os: FakeOsCallAdapter, nth = 0): string {
  const lines = os.log.filter((l) => l.startsWith('reportIncoming'));
  const line = lines[nth];
  if (!line) throw new Error(`no reportIncoming #${nth}`);
  return line.split(' ')[1]!;
}
