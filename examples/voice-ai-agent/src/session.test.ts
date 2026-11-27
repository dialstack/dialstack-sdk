import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

import type { MediaStream } from '@dialstack/sdk-server';

import { rememberCall } from './calls.js';
import type { VoiceProvider } from './providers/provider.js';
import { runSession } from './session.js';

class FakeStream extends EventEmitter {
  sent: unknown[] = [];
  closed = false;
  sendAudioBuffer(buf: Buffer) {
    this.sent.push({ audio: buf.length });
  }
  sendClear() {
    this.sent.push({ clear: true });
  }
  sendMark(name: string) {
    this.sent.push({ mark: name });
  }
  close() {
    this.closed = true;
  }
}

class FakeProvider extends EventEmitter {
  played: [string, number][] = [];
  async connect() {}
  dropped: [string, number][] = [];
  sendAudio() {}
  close() {}
  audioPlayed(itemId: string, endMs: number) {
    this.played.push([itemId, endMs]);
  }
  audioDropped(itemId: string, sentMs: number) {
    this.dropped.push([itemId, sentMs]);
  }
}

let n = 0;
async function start(version: string | undefined) {
  return startRaw(version ? { protocol_version: version } : {});
}

async function startRaw(extra: Record<string, unknown>) {
  const callId = `call_${++n}`;
  rememberCall(callId, {
    accountId: 'acct_1',
    fromNumber: '+15550000001',
    toNumber: '+15550000002',
  });
  const stream = new FakeStream();
  const provider = new FakeProvider();
  let made = false;
  runSession({
    stream: stream as unknown as MediaStream,
    makeProvider: () => {
      made = true;
      return provider as unknown as VoiceProvider;
    },
    transfer: async () => undefined,
  });
  stream.emit('begin', {
    event: 'begin',
    call_id: callId,
    account_id: 'acct_1',
    audio_format: { encoding: 'audio/x-mulaw', sample_rate: 8000, channels: 1 },
    ...extra,
  });
  await new Promise((r) => setImmediate(r));
  return { stream, provider, made: () => made };
}

test('a server older than media protocol 2.2 is refused', async () => {
  const s = await start(undefined);
  assert.equal(s.stream.closed, true);
  assert.equal(s.made(), false);
});

test('provider audio is forwarded as it arrives, with a mark at most every 200 ms', async () => {
  const s = await start('2.2');
  for (let ms = 40; ms <= 1000; ms += 40) {
    s.provider.emit('audio', new Uint8Array(320), { itemId: 'i1', endMs: ms });
  }
  s.provider.emit('audio', new Uint8Array(0), { itemId: 'i1', endMs: 1000, last: true });
  s.provider.emit('audio', new Uint8Array(160), { itemId: 'i2', endMs: 20 });
  s.provider.emit('audio', new Uint8Array(0), { itemId: 'i2', endMs: 20, last: true });

  const audio = s.stream.sent.filter((m) => 'audio' in (m as object));
  assert.equal(audio.length, 26, 'every non-empty chunk forwarded, none held back');
  echoAll(s);
  assert.deepEqual(s.provider.played, [
    ['i1', 200],
    ['i1', 400],
    ['i1', 600],
    ['i1', 800],
    ['i1', 1000],
    ['i2', 20],
  ]);
});

test('echoes report play-out, except those released by clear', async () => {
  const s = await start('2.2');
  s.provider.emit('audio', new Uint8Array(1600), { itemId: 'i1', endMs: 200 });
  s.provider.emit('audio', new Uint8Array(1600), { itemId: 'i1', endMs: 400 });
  const [first, second] = marksSent(s);
  s.stream.emit('mark', { event: 'mark', name: first, timestamp: 250 });

  s.provider.emit('interrupt');
  assert.deepEqual(s.stream.sent.at(-1), { clear: true });
  s.stream.emit('mark', { event: 'mark', name: second, timestamp: 260 });

  assert.deepEqual(s.provider.played, [['i1', 200]]);
});

test('a begin with a non-string protocol_version is refused, not thrown', async () => {
  const s = await start(undefined);
  assert.equal(s.stream.closed, true);
  const t = await startRaw({ protocol_version: 2.2 });
  assert.equal(t.stream.closed, true);
  assert.equal(t.made(), false);
});

test('a large chunk is split so a mark lands every 200 ms inside it', async () => {
  const s = await start('2.2');
  s.provider.emit('audio', new Uint8Array(8000), { itemId: 'i1', endMs: 1000 });

  assert.deepEqual(s.stream.sent, [
    { audio: 1600 },
    { mark: '1' },
    { audio: 1600 },
    { mark: '2' },
    { audio: 1600 },
    { mark: '3' },
    { audio: 1600 },
    { mark: '4' },
    { audio: 1600 },
    { mark: '5' },
  ]);
});

function marksSent(s: { stream: FakeStream }): string[] {
  return s.stream.sent
    .filter((m) => 'mark' in (m as object))
    .map((m) => (m as { mark: string }).mark);
}

function echoAll(s: { stream: FakeStream }): void {
  for (const name of marksSent(s)) s.stream.emit('mark', { event: 'mark', name, timestamp: 0 });
}

function audioSent(s: { stream: FakeStream }): number {
  return s.stream.sent.reduce<number>((n, m) => n + ((m as { audio?: number }).audio ?? 0), 0);
}

test('a reply far ahead of the caller stops at 17 s, truthfully marked', async () => {
  const s = await start('2.2');
  for (let i = 0; i < 200; i++) {
    s.provider.emit('audio', new Uint8Array(1600), { itemId: 'i1', endMs: (i + 1) * 200 });
  }
  assert.equal(audioSent(s), 17 * 8000);
  assert.equal(marksSent(s).length, 85);
  assert.deepEqual(s.provider.dropped, [['i1', 17_000]]);

  // Echoes return credit, but the dropped reply stays dropped; the next plays.
  s.stream.emit('mark', { event: 'mark', name: marksSent(s).at(-1), timestamp: 17_000 });
  s.provider.emit('audio', new Uint8Array(1600), { itemId: 'i1', endMs: 40_200 });
  s.provider.emit('audio', new Uint8Array(1600), { itemId: 'i2', endMs: 200 });
  assert.equal(audioSent(s), 17 * 8000 + 1600);
  assert.deepEqual(s.provider.played, [['i1', 17_000]]);
});

test('marks stay under the limit, counting echoes a clear released', async () => {
  const s = await start('2.2');
  for (let i = 0; i < 1000; i++) {
    s.provider.emit('audio', new Uint8Array(80), { itemId: `i${i}`, endMs: 10, last: true });
  }
  assert.equal(marksSent(s).length, 900);

  s.provider.emit('interrupt');
  s.provider.emit('audio', new Uint8Array(80), { itemId: 'after', endMs: 10, last: true });
  assert.equal(marksSent(s).length, 900, 'released echoes still in transit count');

  echoAll(s);
  s.provider.emit('audio', new Uint8Array(80), { itemId: 'next', endMs: 10, last: true });
  assert.equal(marksSent(s).length, 901);
});

test('a short final part gets its own mark', async () => {
  const s = await start('2.2');
  s.provider.emit('audio', new Uint8Array(1603), { itemId: 'i1', endMs: 200, last: true });
  echoAll(s);
  assert.deepEqual(s.provider.played, [
    ['i1', 200],
    ['i1', 201],
  ]);
});
