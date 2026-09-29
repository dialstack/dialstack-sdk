import { FakeOsCallAdapter } from '../../os/FakeOsCallAdapter';
import { NativeCallBridge, toOsEndReason } from '../NativeCallBridge';
import { RuntimeHold } from '../RuntimeHold';
import { FakeCall, FakeLifecycle, FakePhone } from '../fakes';

const flush = async (): Promise<void> => {
  // Enough microtask turns for the bridge's awaited getActiveSession/connect chains.
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

const PUSHED = 'call_pushed';
const DELIVERED = PUSHED;
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

  it('a decline before arrival rejects that call, not another one arriving first', async () => {
    const { phone, os, bridge } = rig();
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    await os.end(S1); // declined from the lock screen before the socket delivered
    await flush();

    const other = new FakeCall('call_other');
    phone.emitIncoming(other);
    await flush();
    expect(other.actions).not.toContain('reject:decline');

    const declined = new FakeCall(PUSHED);
    phone.emitIncoming(declined);
    await flush();
    expect(declined.actions).toEqual(['reject:decline']);
  });

  it('forgets a declined wake whose call never arrives, so the next call parks', async () => {
    // Answered or cancelled elsewhere before this device re-registered: no call.
    const { phone, os, hold, lifecycle, bridge } = rig({ deliveryDeadlineMs: 5_000 });
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    await os.end(S1);
    await flush();

    jest.advanceTimersByTime(5_000);
    await flush();
    expect(os.log.filter((l) => l.startsWith(`reportEnded ${S1}`))).toEqual([]);
    expect(hold.pending()).toBeNull();
    expect(phone.disconnectCalls).toBe(1);

    await bridge.ensureConnected();
    lifecycle.set('background');
    await flush();
    expect(bridge.getTrace().some((l) => l.includes('keeping the registration'))).toBe(false);
    expect(phone.disconnectCalls).toBe(2);
  });

  it('ignores a second incoming for a call id that is still live', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    await bridge.ensureConnected();
    const first = new FakeCall('call_x');
    phone.emitIncoming(first);
    await flush();
    const reports = () => os.log.filter((l) => l.startsWith('reportIncoming')).length;
    const before = reports();

    phone.emitIncoming(new FakeCall('call_x'));
    await flush();

    expect(reports()).toBe(before);
    await os.answer(sessionOf(os));
    await flush();
    expect(first.actions).toEqual(['answer']);
  });

  it('reports the same call id afresh when it rings again after ending', async () => {
    // The next step of a follow-me, or a queue re-ring: same call_id, new ring.
    const { phone, os, bridge } = rig();
    bridge.start();
    await bridge.ensureConnected();
    const first = new FakeCall('call_x');
    phone.emitIncoming(first);
    await flush();
    first.emitEnded('no-answer');
    await flush();
    const reports = () => os.log.filter((l) => l.startsWith('reportIncoming')).length;
    const before = reports();

    phone.emitIncoming(new FakeCall('call_x'));
    await flush();

    expect(reports()).toBe(before + 1);
  });

  it('ends a wake session whose push carried no call id', async () => {
    // Nothing can pair with it: every call is matched by call_id, and the push
    // is where the session's call_id comes from.
    const { os, bridge } = rig();
    os.nativeReportIncoming({ sessionId: S1, callId: null });
    bridge.start();
    await flush();

    expect(os.log).toContain(`reportEnded ${S1} failed`);
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

  it('runs its deadlines on the timers it is given, not the JS ones', async () => {
    // A backgrounded Android app pauses JS timers; native ones still fire.
    const pending: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
    const timers = {
      setTimeout: (fn: () => void, ms: number) => {
        const t = { fn, ms, cleared: false };
        pending.push(t);
        return t;
      },
      clearTimeout: (t: unknown) => {
        if (t) (t as { cleared: boolean }).cleared = true;
      },
    };
    const { phone, os, hold, bridge } = rig({ deliveryDeadlineMs: 5_000, timers });
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    expect(phone.isConnected).toBe(true);

    jest.advanceTimersByTime(60_000);
    await flush();
    expect(os.sessionCount()).toBe(1);

    const delivery = pending.find((t) => t.ms === 5_000 && !t.cleared)!;
    delivery.fn();
    await flush();
    expect(os.log).toContain(`reportEnded ${S1} failed`);
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

  it('ends a native report for a second call while the OS is at its call cap', async () => {
    // A push for a different call while one is already on the OS screen. At the
    // default cap of 1 it gets no OS session: Android's Telecom refuses one
    // outright, CallKit does not, so the bridge enforces the cap on both.
    const phone = new FakePhone();
    const os = new FakeOsCallAdapter({ multiCall: true });
    const bridge = new NativeCallBridge({ phone, os });
    bridge.start();
    await bridge.ensureConnected();

    phone.emitIncoming(new FakeCall('call_socket'));
    await flush();
    const ours = sessionOf(os);

    os.nativeReportIncoming({ sessionId: 'push-session', callId: 'call_parked' });
    await flush();

    expect(os.log).toContain('reportEnded push-session failed');
    // Ours is untouched and still live.
    expect(os.log).not.toContain(`reportEnded ${ours} failed`);
  });

  it('still maps its own session when a second one is reported alongside', async () => {
    // The wake race: a push reports one session while another is already live.
    // The bridge must ask about the session it was told of, not about whichever
    // the OS calls active — otherwise its own session reads as missing and the
    // one nobody can name alerts until the OS times it out.
    const phone = new FakePhone();
    const os = new FakeOsCallAdapter({ multiCall: true });
    const bridge = new NativeCallBridge({ phone, os });
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    os.nativeReportIncoming({ sessionId: 'other', callId: 'call_other' });
    await flush();

    expect(bridge.getTrace().some((l) => l.includes('not mapped'))).toBe(false);
    expect(bridge.getTrace().some((l) => l.includes(`linked ${PUSHED} ⇄ ${S1}`))).toBe(true);

    // And the delivered call pairs with it.
    const call = new FakeCall(DELIVERED);
    phone.emitIncoming(call);
    await flush();
    await os.answer(S1);
    await flush();
    expect(call.actions).toEqual(['answer']);
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

  it('an OS hold the call cannot take leaves no token to swallow the next tap', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    const call = new FakeCall('c1');
    phone.emitIncoming(call);
    await flush();
    const sid = sessionOf(os);

    // Still ringing: the SDK can't hold it, so nothing is sent and no echo comes.
    os.hold(sid, true);
    await flush();
    expect(call.actions).toEqual([]);

    call.state = 'active';
    os.hold(sid, true);
    await flush();
    expect(call.actions).toEqual(['hold']);
  });

  it('a local hold is not reported back to the OS', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    const call = new FakeCall('c1');
    phone.emitIncoming(call);
    await flush();
    call.state = 'active';
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

  it('keeps the registration when backgrounded while an outbound call is being placed', async () => {
    // Reporting the call to the OS can itself background the app (some Android
    // skins flash their own call screen), before phone.call() has resolved.
    const { phone, lifecycle, bridge } = rig();
    bridge.start();
    await bridge.ensureConnected();
    phone.manualCall = true;
    const placing = bridge.call('15551234567');
    await flush();
    lifecycle.set('background');
    expect(phone.disconnectCalls).toBe(0);
    phone.resolveCall();
    await placing;
  });

  it('drops the registration when the last call ends while the app is in the background', async () => {
    const { phone, lifecycle, bridge } = rig();
    bridge.start();
    await bridge.ensureConnected();
    const call = new FakeCall('c1');
    phone.emitIncoming(call);
    await flush();
    lifecycle.set('background');
    expect(phone.disconnectCalls).toBe(0);

    call.emitEnded('no-answer');
    await flush();

    expect(phone.disconnectCalls).toBe(1);
  });

  it('keeps the registration when the last call ends in the foreground', async () => {
    const { phone, lifecycle, bridge } = rig();
    bridge.start();
    await bridge.ensureConnected();
    lifecycle.set('active');
    const call = new FakeCall('c1');
    phone.emitIncoming(call);
    await flush();

    call.emitEnded('hangup');
    await flush();

    expect(phone.disconnectCalls).toBe(0);
  });

  it('ensureConnected waits on a connect already in flight on the phone', async () => {
    const { phone, bridge } = rig();
    bridge.start();
    // Something else (the UI provider adopting the same phone) started a connect.
    phone.manualConnect = true;
    void phone.connect();
    let settled = false;
    void bridge.ensureConnected().then(() => {
      settled = true;
    });
    await flush();
    // Resolving early would start the wake's delivery deadline before the socket
    // is registered.
    expect(settled).toBe(false);
    phone.resolveConnect();
    await flush();
    expect(settled).toBe(true);
  });

  it('a wake while the UI is connecting the phone registers and delivers the call', async () => {
    const { phone, os, bridge } = rig({ deliveryDeadlineMs: 5_000 });
    bridge.start();
    phone.manualConnect = true;
    // The UI mounted first and began connecting.
    void phone.connect();
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    await flush();
    phone.resolveConnect();
    await flush();

    const call = new FakeCall(DELIVERED);
    phone.emitIncoming(call);
    await flush();
    await os.answer(S1);
    await flush();
    expect(call.actions).toEqual(['answer']);
    expect(os.log).not.toContain(`reportEnded ${S1} failed`);
    // A connect in flight is not a dead socket: the wake joins it instead of
    // throwing it away and paying for a second mint and handshake.
    expect(phone.disconnectCalls).toBe(0);
  });

  it('a wake during an automatic reconnect connects for real instead of trusting the old latch', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    await bridge.ensureConnected();
    expect(phone.connectCalls).toBe(1);

    // Days later the frozen app wakes; its socket is between reconnect attempts.
    phone.startReconnecting();
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    await flush();
    expect(phone.connectCalls).toBe(2);

    const call = new FakeCall(DELIVERED);
    phone.emitIncoming(call);
    await flush();
    await os.answer(S1);
    await flush();
    expect(call.actions).toEqual(['answer']);
  });

  it('ensureConnected joins a connect in flight and re-arms after a disconnect', async () => {
    const { phone, bridge } = rig();
    bridge.start();
    phone.manualConnect = true;
    const a = bridge.ensureConnected();
    const b = bridge.ensureConnected();
    // The phone joins the second call to the first: one connect, one outcome.
    expect(a).toBe(b);
    phone.resolveConnect();
    await a;
    const calls = phone.connectCalls;
    await bridge.ensureConnected();
    expect(phone.connectCalls).toBe(calls);
    phone.disconnect();
    phone.manualConnect = false;
    await bridge.ensureConnected();
    expect(phone.connectCalls).toBe(calls + 1);
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

  it('a stale answer deadline does not kill a later call that reused the session id', async () => {
    // Session ids are recycled. A timer left armed past its own session fires
    // against the NEXT tap on the same id — so it must be cancelled when the
    // session is forgotten, and pinned to the tap that armed it.
    //
    // Generous wake deadlines so the only timer under test is the answer one.
    const { phone, os, bridge } = rig({
      answerTtlMs: 30_000,
      registrationDeadlineMs: 600_000,
      deliveryDeadlineMs: 600_000,
    });
    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();

    // Tap with no call: timer 1 armed for T+30s.
    await os.answer(S1);
    await flush();

    // The user gives up; the session goes away before any call arrives.
    await os.end(S1);
    await flush();

    // T+20s: the OS recycles the same id for a NEW call, again answered early.
    jest.advanceTimersByTime(20_000);
    os.nativeReportIncoming({ sessionId: S1, callId: 'call_pushed_2' });
    await flush();
    await os.answer(S1);
    await flush();

    // T+31s: timer 1's original deadline. It must not touch this session.
    jest.advanceTimersByTime(11_000);
    await flush();
    expect(os.log).not.toContain(`reportEnded ${S1} failed`);

    // The second call is still answerable through its own held tap.
    const call = new FakeCall('call_pushed_2');
    phone.emitIncoming(call);
    await flush();
    expect(call.actions).toEqual(['answer']);
    expect(os.isConnected(S1)).toBe(true);
  });

  it('fails a held answer whose session has no wake deadline to fall back on', async () => {
    // Why armAnswerDeadline exists at all. An answer can arrive for a session the
    // bridge never saw reported, so no wake deadline is armed for it; this timer
    // is the only thing that resolves it. Without it the OS keeps showing its
    // incoming UI (CallKit holds the answer request open) until the adapter's own
    // far longer deadline.
    const { os, bridge } = rig({ answerTtlMs: 30_000 });
    bridge.start();
    await flush();
    // A session the OS holds but never reported to the bridge.
    (os as unknown as { sessions: Map<string, object> }).sessions.set('ghost-session', {
      sessionId: 'ghost-session',
      callId: null,
      connected: false,
      answerRequested: false,
    });

    await os.answer('ghost-session');
    await flush();
    expect(os.log).not.toContain('reportEnded ghost-session failed');

    // No call ever arrives, and no wake deadline covers this session.
    jest.advanceTimersByTime(29_000);
    await flush();
    expect(os.log).not.toContain('reportEnded ghost-session failed');
    jest.advanceTimersByTime(2_000);
    await flush();
    expect(os.log).toContain('reportEnded ghost-session failed');
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
    const next = new FakeCall('call_next');
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
    const call = new FakeCall('call_new');
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
    const call = new FakeCall('call_other_push');
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

  it('leaves no session alerting after an answer, however it was answered', async () => {
    // Both platforms treat an answer as a REQUEST: the OS keeps showing its
    // incoming UI until the call is reported connected. A test that only checks
    // the SDK call answered passes while the phone rings forever.
    const { phone, os, bridge } = rig();
    bridge.start();
    await bridge.ensureConnected();
    const call = new FakeCall('call_fg');
    phone.emitIncoming(call);
    await flush();

    bridge.answer('call_fg');
    await flush();
    call.emitAnswered();
    await flush();

    expect(call.actions).toEqual(['answer']);
    expect(os.stillAlerting()).toEqual([]);
  });

  it('reports an in-app hold to the OS', async () => {
    // The OS's own hold button and call log track held state, so a hold the user
    // takes in-app has to reach it. `held` carries by='local' for an in-app hold
    // and by='remote' when the far end holds us — both are news to the OS, which
    // did not initiate either.
    const { phone, os, bridge } = rig();
    bridge.start();
    await bridge.ensureConnected();
    const call = new FakeCall('call_fg');
    phone.emitIncoming(call);
    await flush();
    const sid = sessionOf(os);

    call.emitHeld('local');
    await flush();
    expect(os.log).toContain(`setHeld ${sid} true`);
  });

  it('an in-app End on a second, OS-capped call leaves the established call alone', async () => {
    // The second call is left "handled in-app only" by the maxOsCalls cap, so it
    // has no OS session of its own. Ending it must not reach the first call's.
    let clock = 1_000_000;
    const phone = new FakePhone();
    const os = new FakeOsCallAdapter();
    const bridge = new NativeCallBridge({ phone, os, now: () => clock });

    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    await os.answer(S1);

    const first = new FakeCall(PUSHED);
    phone.emitIncoming(first);
    await flush();
    expect(first.actions).toEqual(['answer']);

    // A second caller while the first is up, left in-app.
    clock += 30_000;
    const second = new FakeCall('call_b');
    phone.emitIncoming(second);
    await flush();

    bridge.end('call_b');
    await flush();

    // The second call went down directly (no session to route through); the
    // established one is untouched and still up.
    expect(second.actions).toEqual(['hangup']);
    expect(first.actions).toEqual(['answer']);
    expect(os.sessionCount()).toBe(1);
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

describe('a second concurrent call', () => {
  it('a second call is left in-app when the OS is at its 1-call cap', async () => {
    // A second caller while a woken call is up. With the default single-call cap it
    // is NOT reported to the OS and NOT hung up: it stays a live call for the in-app
    // softphone to ring and answer.
    let clock = 1_000_000;
    const phone = new FakePhone();
    const os = new FakeOsCallAdapter();
    const bridge = new NativeCallBridge({ phone, os, now: () => clock });

    os.nativeReportIncoming({ sessionId: S1, callId: PUSHED });
    bridge.start();
    await flush();
    await os.answer(S1);

    const first = new FakeCall(PUSHED);
    phone.emitIncoming(first);
    await flush();
    expect(first.actions).toEqual(['answer']); // paired by id + held answer

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

    const first = new FakeCall(PUSHED);
    phone.emitIncoming(first);
    await flush();

    clock += 30_000;
    const second = new FakeCall('call_b');
    const reportsBefore = os.log.filter((l) => l.startsWith('reportIncoming')).length;
    phone.emitIncoming(second);
    await flush();

    expect(second.actions).not.toContain('hangup');
    expect(os.log.filter((l) => l.startsWith('reportIncoming')).length).toBe(reportsBefore + 1);
    // Its own session, never the first call's: ending it leaves the first up.
    bridge.end('call_b');
    await flush();
    expect(os.log.some((l) => l.startsWith(`reportEnded ${S1}`))).toBe(false);
    expect(first.actions).toEqual(['answer']);
  });
});

describe('reconcile', () => {
  const RECONCILE_MS = 1_500;

  it('reports connected again when the OS kept an answered call connecting', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    const call = new FakeCall('c1');
    phone.emitIncoming(call);
    await flush();
    const sid = sessionOf(os);
    os.ignoreNext('reportConnected');

    await os.answer(sid);
    await flush();
    expect(call.actions).toEqual(['answer']);
    expect(os.stillAlerting()).toEqual([sid]);

    await jest.advanceTimersByTimeAsync(RECONCILE_MS);
    expect(os.isConnected(sid)).toBe(true);
    expect(os.stillAlerting()).toEqual([]);
  });

  it('asks the OS to answer when it still rings over a call answered in-app', async () => {
    // iOS takes a connected report for an incoming call and keeps ringing.
    const { phone, os, bridge } = rig();
    bridge.start();
    const call = new FakeCall('c1');
    phone.emitIncoming(call);
    await flush();
    const sid = sessionOf(os);
    os.failNext('answer');
    os.ignoreNext('reportConnected');

    call.emitAnswered();
    await flush();
    expect(os.isConnected(sid)).toBe(false);

    await jest.advanceTimersByTimeAsync(RECONCILE_MS);
    expect(os.isConnected(sid)).toBe(true);
    // The call was already up: nothing answered it a second time.
    expect(call.actions).toEqual([]);
  });

  it('puts the OS on hold when it missed a remote hold', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    const call = new FakeCall('c1');
    phone.emitIncoming(call);
    await flush();
    const sid = sessionOf(os);
    call.emitAnswered();
    await os.answer(sid);
    await flush();
    os.ignoreNext('setHeld');

    call.emitHeld('remote');
    await flush();
    expect((await os.getActiveSession())?.held).toBe(false);

    await jest.advanceTimersByTimeAsync(RECONCILE_MS);
    expect((await os.getActiveSession())?.held).toBe(true);
    expect(call.actions).toEqual([]);
  });

  it('leaves an OS hold alone while the call is still confirming it', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    const call = new FakeCall('c1');
    phone.emitIncoming(call);
    await flush();
    const sid = sessionOf(os);
    await os.answer(sid);
    await flush();
    call.autoConfirm = false;

    os.hold(sid, true);
    await flush();
    expect(call.actions).toEqual(['answer', 'hold']);
    // The OS shows held and the call is still active until the server confirms.
    await jest.advanceTimersByTimeAsync(RECONCILE_MS);
    expect(os.log.filter((l) => l.startsWith('setHeld'))).toEqual([]);
  });

  it('checks again when the app returns to the foreground', async () => {
    const { phone, os, lifecycle, bridge } = rig();
    bridge.start();
    const call = new FakeCall('c1');
    phone.emitIncoming(call);
    await flush();
    const sid = sessionOf(os);
    await os.answer(sid);
    await flush();
    await jest.advanceTimersByTimeAsync(RECONCILE_MS);
    // The OS lost the hold while the app was away, with no event about it.
    os.ignoreNext('setHeld');
    call.emitHeld('remote');
    await jest.advanceTimersByTimeAsync(0);
    os.ignoreNext('setHeld');
    await jest.advanceTimersByTimeAsync(RECONCILE_MS);
    expect((await os.getActiveSession())?.held).toBe(false);

    lifecycle.set('active');
    await jest.advanceTimersByTimeAsync(RECONCILE_MS);
    expect((await os.getActiveSession())?.held).toBe(true);
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

describe('OS report failures', () => {
  it('rejects the call when the OS will not show it, so the caller is released', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    await bridge.ensureConnected();
    os.failNext('reportIncoming');
    const call = new FakeCall('c1');

    phone.emitIncoming(call);
    await flush();

    expect(call.actions).toContain('reject:busy');
  });

  it('pairs with the push session instead of rejecting when the OS already shows the call', async () => {
    // The push and the socket landed together: the OS refused our report because
    // the push's session for this call_id was already up, and its own report
    // arrived while ours was in flight.
    const { phone, os, bridge } = rig();
    bridge.start();
    await bridge.ensureConnected();
    os.failNext('reportIncoming');
    const call = new FakeCall('c1');

    phone.emitIncoming(call);
    os.nativeReportIncoming({ sessionId: 'push-session', callId: 'c1' });
    await flush();

    expect(call.actions).not.toContain('reject:busy');
    await os.answer('push-session');
    await flush();
    expect(call.actions).toEqual(['answer']);
  });

  // An OS that accepts both reports of one call (CallKit does): the push and
  // our own report land together, and the OS shows two sessions for one call_id.
  it('ends the second OS session for a call reported by both the push and the socket', async () => {
    const phone = new FakePhone();
    const os = new FakeOsCallAdapter({ multiCall: true });
    const bridge = new NativeCallBridge({ phone, os, maxOsCalls: 2 });
    bridge.start();
    await bridge.ensureConnected();
    const call = new FakeCall('c1');

    phone.emitIncoming(call);
    os.nativeReportIncoming({ sessionId: 'push-session', callId: 'c1' });
    await flush();

    expect(os.log).toContain('reportEnded push-session remoteEnded');
    const ours = os.log.find((l) => l.startsWith('reportIncoming'))!.split(' ')[1]!;
    await os.answer(ours);
    await flush();
    expect(call.actions).toEqual(['answer']);
  });

  it('ends a push session arriving after its call is already on the OS', async () => {
    const phone = new FakePhone();
    const os = new FakeOsCallAdapter({ multiCall: true });
    const bridge = new NativeCallBridge({ phone, os, maxOsCalls: 2 });
    bridge.start();
    await bridge.ensureConnected();
    phone.emitIncoming(new FakeCall('c1'));
    await flush();

    os.nativeReportIncoming({ sessionId: 'push-session', callId: 'c1' });
    await flush();

    expect(os.log).toContain('reportEnded push-session remoteEnded');
  });

  it('retries the connected report, so the OS stops ringing', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    await bridge.ensureConnected();
    const call = new FakeCall('c1');
    phone.emitIncoming(call);
    await flush();
    const sessionId = os.log.find((l) => l.startsWith('reportIncoming'))!.split(' ')[1]!;

    os.failNext('reportConnected', 2);
    await os.answer(sessionId);
    await jest.advanceTimersByTimeAsync(5_000);

    expect(os.stillAlerting()).toEqual([]);
    expect(call.actions).not.toContain('hangup');
  });

  it('ends the call on both sides when the OS never takes the connected report', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    await bridge.ensureConnected();
    const call = new FakeCall('c1');
    phone.emitIncoming(call);
    await flush();
    const sessionId = os.log.find((l) => l.startsWith('reportIncoming'))!.split(' ')[1]!;

    os.failNext('reportConnected', 10);
    await os.answer(sessionId);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(call.actions).toContain('hangup');
    expect(os.sessionCount()).toBe(0);
  });

  it('retries reportEnded until the OS accepts it', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    await bridge.ensureConnected();
    const call = new FakeCall('c1');
    phone.emitIncoming(call);
    await flush();
    expect(os.sessionCount()).toBe(1);

    os.failNext('reportEnded', 2);
    call.emitEnded('hangup');
    await jest.advanceTimersByTimeAsync(5_000);

    expect(os.sessionCount()).toBe(0);
    expect(os.log.filter((l) => l.startsWith('reportEnded'))).toHaveLength(1);
  });
});

describe('OS actions whose SDK side fails', () => {
  async function liveCall() {
    const r = rig();
    r.bridge.start();
    await r.bridge.ensureConnected();
    const call = new FakeCall('c1');
    r.phone.emitIncoming(call);
    await flush();
    const sessionId = r.os.log.find((l) => l.startsWith('reportIncoming'))!.split(' ')[1]!;
    return { ...r, call, sessionId };
  }

  it('hangs up when the OS decline cannot be sent as a reject', async () => {
    const { os, call, sessionId } = await liveCall();
    call.failNext.reject = new Error('WebSocket is not open');

    await os.end(sessionId);

    expect(call.actions).toEqual(['reject:decline', 'hangup']);
  });

  it('puts the OS mute back when the SDK mute fails', async () => {
    const { os, call, sessionId } = await liveCall();
    call.emitAnswered();
    call.failNext.mute = new Error('WebSocket is not open');

    os.mute(sessionId, true);
    await flush();

    expect(call.isMuted).toBe(false);
    expect(os.log).toContain(`setMuted ${sessionId} false`);
  });

  it('puts the OS hold back when the SDK hold is refused', async () => {
    const { os, call, sessionId } = await liveCall();
    call.emitAnswered();
    call.failNext.hold = new Error('call is not active');

    os.hold(sessionId, true);
    await flush();

    expect(os.log).toContain(`setHeld ${sessionId} false`);
  });

  it('retries a hold the server fails, then ends the call once none lands', async () => {
    const { os, phone, call, sessionId } = await liveCall();
    call.emitAnswered();
    call.autoConfirm = false;

    os.hold(sessionId, true);
    for (let i = 0; i < 3; i += 1) {
      await flush();
      phone.emitError({ code: 'internal_error', message: 'far end unreachable', callId: 'c1' });
      await jest.advanceTimersByTimeAsync(2_000);
    }
    await flush();

    expect(call.actions.filter((a) => a === 'hold')).toHaveLength(3);
    expect(call.actions).toContain('hangup');
  });

  it('stops retrying once a hold lands', async () => {
    const { os, phone, call, sessionId } = await liveCall();
    call.emitAnswered();
    call.autoConfirm = false;

    os.hold(sessionId, true);
    await flush();
    phone.emitError({ code: 'internal_error', message: 'glitch', callId: 'c1' });
    await jest.advanceTimersByTimeAsync(2_000);
    call.emitHeld('local');
    await jest.advanceTimersByTimeAsync(30_000);

    expect(call.actions.filter((a) => a === 'hold')).toHaveLength(2);
    expect(call.actions).not.toContain('hangup');
  });

  it('puts the OS hold back without retrying when the server refuses on state', async () => {
    const { os, phone, call, sessionId } = await liveCall();
    call.emitAnswered();
    call.autoConfirm = false;

    os.hold(sessionId, true);
    await flush();
    phone.emitError({ code: 'invalid_message', message: 'call is not active', callId: 'c1' });
    await flush();

    expect(call.actions.filter((a) => a === 'hold')).toHaveLength(1);
    expect(os.log).toContain(`setHeld ${sessionId} false`);
    expect(call.actions).not.toContain('hangup');
  });

  it('ignores an error naming another call', async () => {
    const { os, phone, call, sessionId } = await liveCall();
    call.emitAnswered();
    call.autoConfirm = false;

    os.hold(sessionId, true);
    await flush();
    phone.emitError({ code: 'invalid_message', message: 'no', callId: 'someone_else' });
    call.emitHeld('local');
    await flush();

    expect(os.log).not.toContain(`setHeld ${sessionId} false`);
  });

  it('ends a call here when the server never confirms its hangup', async () => {
    const { os, bridge, call, sessionId } = await liveCall();
    call.emitAnswered();
    call.autoConfirm = false;
    os.failNext('end');

    bridge.end('c1');
    await jest.advanceTimersByTimeAsync(60_000);

    expect(call.actions.filter((a) => a === 'hangup')).toHaveLength(5);
    expect(os.log).toContain(`reportEnded ${sessionId} failed`);
  });

  it('does not retry a hangup the server confirms', async () => {
    const { os, call, sessionId } = await liveCall();
    call.emitAnswered();
    call.autoConfirm = false;

    await os.end(sessionId);
    call.emitEnded('hangup');
    await jest.advanceTimersByTimeAsync(60_000);

    expect(call.actions.filter((a) => a === 'hangup')).toHaveLength(1);
  });

  it('survives a DTMF the SDK cannot send', async () => {
    const { os, call, sessionId } = await liveCall();
    call.emitAnswered();
    call.failNext.dtmf = new Error('DTMF sender not available');

    expect(() => os.dtmf(sessionId, '5')).not.toThrow();
  });

  it('ends in-app when the OS refuses an in-app end', async () => {
    const { os, bridge, call } = await liveCall();
    call.emitAnswered();
    os.failNext('end');

    bridge.end('c1');
    await flush();

    expect(call.actions).toContain('hangup');
  });
});

describe('answering in-app', () => {
  it('asks the OS to answer an incoming call answered in-app, then fulfils it', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    await bridge.ensureConnected();
    const call = new FakeCall('c1');
    phone.emitIncoming(call);
    await flush();
    const sessionId = os.log.find((l) => l.startsWith('reportIncoming'))!.split(' ')[1]!;

    // The softphone UI answers the SDK call directly, not through the bridge.
    call.emitAnswered();
    await flush();

    expect(os.isConnected(sessionId)).toBe(true);
    expect(os.stillAlerting()).toEqual([]);
    // The SDK call was already answered; the OS answer must not answer it again.
    expect(call.actions).not.toContain('answer');
  });

  it('still reports an outbound call connected when the far end answers', async () => {
    const { phone, os, bridge } = rig();
    bridge.start();
    phone.isConnected = true;
    const placed = new FakeCall('call_out', '15551234567');
    phone.callResult = placed;
    await bridge.call('15551234567');
    const sessionId = os.log.find((l) => l.startsWith('reportOutgoing'))!.split(' ')[1]!;

    placed.emitAnswered();
    await flush();

    expect(os.log).toContain(`reportConnected ${sessionId}`);
    expect(os.log.some((l) => l.startsWith('answer'))).toBe(false);
  });
});
