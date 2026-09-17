import { FakeOsCallAdapter } from '../FakeOsCallAdapter';
import { runOsCallAdapterContract } from '../contract';

runOsCallAdapterContract('FakeOsCallAdapter', { describe, it, expect }, () => {
  const fake = new FakeOsCallAdapter();
  return { adapter: fake, os: fake };
});

describe('FakeOsCallAdapter', () => {
  it('drops non-replayed events that fire before a listener exists', () => {
    const fake = new FakeOsCallAdapter();
    fake.nativeReportIncoming({ sessionId: 's1', callId: null });
    fake.hold('s1', true);
    fake.end('s1');
    const held: boolean[] = [];
    const ends: string[] = [];
    fake.on('setHeld', (e) => held.push(e.held));
    fake.on('end', (e) => ends.push(e.sessionId));
    expect(held).toEqual([]);
    expect(ends).toEqual([]);
  });

  it('replays a queued event to the first listener only once', () => {
    const fake = new FakeOsCallAdapter();
    fake.nativeReportIncoming({ sessionId: 's1', callId: 'c' });
    const a: string[] = [];
    const b: string[] = [];
    fake.on('incomingReported', (e) => a.push(e.sessionId));
    fake.on('incomingReported', (e) => b.push(e.sessionId));
    expect(a).toEqual(['s1']);
    expect(b).toEqual([]);
  });

  it('can be built without echoes for tests that need a quiet OS', async () => {
    const fake = new FakeOsCallAdapter({ echoSetActions: false });
    fake.nativeReportIncoming({ sessionId: 's1', callId: null });
    const echoes: boolean[] = [];
    fake.on('setMuted', (e) => echoes.push(e.muted));
    await fake.setMuted('s1', true);
    expect(echoes).toEqual([]);
  });

  it('refuses operations on a session the OS does not know', async () => {
    const fake = new FakeOsCallAdapter();
    await expect(fake.reportConnected('ghost')).rejects.toThrow('unknown session');
  });

  it('records connected state', async () => {
    const fake = new FakeOsCallAdapter();
    fake.nativeReportIncoming({ sessionId: 's1', callId: null });
    expect(fake.isConnected('s1')).toBe(false);
    await fake.reportConnected('s1');
    expect(fake.isConnected('s1')).toBe(true);
  });
});
