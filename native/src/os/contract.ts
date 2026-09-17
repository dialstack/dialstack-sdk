import type { OsActiveSession, OsCallAdapter } from './OsCallAdapter';

/**
 * The OS side of an adapter under test: what native code or the user does.
 * For the fake this is the fake itself; for a real adapter it is whatever the
 * integrator's test rig uses to drive the platform (a mocked native module, or
 * a device).
 */
export interface OsCallHarness {
  nativeReportIncoming(session: OsActiveSession): void | Promise<void>;
}

export interface OsCallAdapterFixture {
  adapter: OsCallAdapter;
  os: OsCallHarness;
}

/** The subset of jest/vitest the suite needs, injected so the SDK declares no test-runner types. */
export interface TestApi {
  describe: (name: string, fn: () => void) => void;
  it: (name: string, fn: () => Promise<void>) => void;
  expect: (actual: unknown) => {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    toHaveLength(n: number): void;
    toBeLessThanOrEqual(n: number): void;
  };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * What the bridge assumes of every adapter. An adapter that passes this can be
 * dropped in for the shipped one; one that fails it will show up as the
 * intermittent "answer does nothing" class of bug, so run it before a device.
 */
export function runOsCallAdapterContract(
  name: string,
  t: TestApi,
  fixture: () => OsCallAdapterFixture | Promise<OsCallAdapterFixture>
): void {
  t.describe(`${name}: OsCallAdapter contract`, () => {
    t.it('replays an incomingReported that fired before JS subscribed', async () => {
      const { adapter, os } = await fixture();
      await os.nativeReportIncoming({ sessionId: 's1', callId: 'call_1' });
      const seen: OsActiveSession[] = [];
      adapter.on('incomingReported', (e) => seen.push(e));
      await flush();
      t.expect(seen).toEqual([{ sessionId: 's1', callId: 'call_1' }]);
    });

    t.it('replays an answer that fired before JS subscribed', async () => {
      const { adapter, os } = await fixture();
      await os.nativeReportIncoming({ sessionId: 's1', callId: null });
      await adapter.answer('s1');
      const seen: string[] = [];
      adapter.on('answer', (e) => seen.push(e.sessionId));
      await flush();
      t.expect(seen).toEqual(['s1']);
    });

    t.it('getActiveSession after incomingReported returns that session', async () => {
      const { adapter, os } = await fixture();
      await os.nativeReportIncoming({ sessionId: 's1', callId: 'call_1' });
      const active = await adapter.getActiveSession();
      t.expect(active?.sessionId).toBe('s1');
    });

    t.it('getActiveSession reflects a call reported from JS', async () => {
      const { adapter } = await fixture();
      const sessionId = await adapter.reportIncoming({ callId: 'call_1', from: '1002' });
      const active = await adapter.getActiveSession();
      t.expect(active).toEqual({ sessionId, callId: 'call_1' });
    });

    t.it('reportOutgoing opens a live session that reportEnded clears', async () => {
      const { adapter } = await fixture();
      const sessionId = await adapter.reportOutgoing({ to: '15551234567' });
      t.expect(typeof sessionId).toBe('string');
      // The session is live (this is the FGS an outbound call needs); ending it
      // must not re-emit 'end' and must clear it, like the incoming path.
      const ends: string[] = [];
      adapter.on('end', (e) => ends.push(e.sessionId));
      await adapter.reportEnded(sessionId, 'remoteEnded');
      await flush();
      t.expect(ends).toHaveLength(0);
      t.expect(await adapter.getActiveSession()).toBeNull();
    });

    t.it('reportEnded does not re-emit end and clears the active session', async () => {
      const { adapter, os } = await fixture();
      await os.nativeReportIncoming({ sessionId: 's1', callId: null });
      const ends: string[] = [];
      adapter.on('end', (e) => ends.push(e.sessionId));
      await adapter.reportEnded('s1', 'remoteEnded');
      await flush();
      t.expect(ends).toHaveLength(0);
      t.expect(await adapter.getActiveSession()).toBeNull();
    });

    t.it('an OS end emits end exactly once and clears the active session', async () => {
      const { adapter, os } = await fixture();
      await os.nativeReportIncoming({ sessionId: 's1', callId: null });
      const ends: string[] = [];
      adapter.on('end', (e) => ends.push(e.sessionId));
      await adapter.end('s1');
      await flush();
      t.expect(ends).toEqual(['s1']);
      t.expect(await adapter.getActiveSession()).toBeNull();
    });

    t.it('setHeld echoes at most once, with the value that was set', async () => {
      const { adapter, os } = await fixture();
      await os.nativeReportIncoming({ sessionId: 's1', callId: null });
      const echoes: boolean[] = [];
      adapter.on('setHeld', (e) => echoes.push(e.held));
      await adapter.setHeld('s1', true);
      await flush();
      t.expect(echoes.length).toBeLessThanOrEqual(1);
      t.expect(echoes.every((h) => h === true)).toBe(true);
    });

    t.it('answer(sessionId) emits answer exactly once', async () => {
      const { adapter, os } = await fixture();
      await os.nativeReportIncoming({ sessionId: 's1', callId: null });
      const seen: string[] = [];
      adapter.on('answer', (e) => seen.push(e.sessionId));
      await adapter.answer('s1');
      await flush();
      t.expect(seen).toEqual(['s1']);
    });

    t.it('unsubscribing stops delivery', async () => {
      const { adapter, os } = await fixture();
      const seen: string[] = [];
      const off = adapter.on('answer', (e) => seen.push(e.sessionId));
      off();
      await os.nativeReportIncoming({ sessionId: 's1', callId: null });
      await adapter.answer('s1');
      await flush();
      t.expect(seen).toHaveLength(0);
    });
  });
}
