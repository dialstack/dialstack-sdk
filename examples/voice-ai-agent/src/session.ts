// Per-call session: ties one DialStack media WebSocket to one VoiceProvider.
//
// Everything on this side of the provider boundary speaks μ-law 8 kHz —
// DialStack's native format. Providers handle their own transcoding
// internally; we just shuttle bytes here.
//
// Lifecycle:
//   1. We wait for the `begin` event from MediaStream to learn the call_id.
//   2. We call `provider.connect()`.
//   3. Caller audio frames arrive ~every 20 ms (~160 μ-law bytes). We
//      base64-decode them and hand the raw μ-law to the provider.
//   4. Provider audio (also μ-law 8 kHz) is pushed onto an outbound queue.
//      A drift-compensated 20 ms scheduler drains the queue and writes one
//      160-byte frame per tick so DialStack never sees a stuttery stream.
//   5. Either side closing closes the other side.

import { logger } from './logger.js';
import type { VoiceProvider } from './providers/provider.js';
import type {
  MediaStream,
  MediaStreamAudioEvent,
  MediaStreamBeginEvent,
} from '@dialstack/sdk/server';

const FRAME_MS = 20;
const FRAME_BYTES_8K = 160; // 20 ms of μ-law @ 8 kHz
const CONNECT_TIMEOUT_MS = 15_000;

export interface SessionOptions {
  stream: MediaStream;
  makeProvider: () => VoiceProvider;
}

export function runSession({ stream, makeProvider }: SessionOptions): void {
  const log = logger.child({ component: 'session' });

  const outQueue: Buffer[] = [];
  let outCarry = Buffer.alloc(0);
  let provider: VoiceProvider | undefined;
  let tickTimer: NodeJS.Timeout | undefined;
  let closed = false;

  stream.once('begin', async (begin: MediaStreamBeginEvent) => {
    log.info({ call_id: begin.call_id, account_id: begin.account_id }, 'call begin');

    provider = makeProvider();

    provider.on('audio', (ulaw) => enqueueProviderAudio(ulaw));
    provider.on('close', () => closeAll('provider closed'));
    provider.on('error', (err) => {
      log.error({ err }, 'provider error');
      closeAll('provider error');
    });

    try {
      await Promise.race([
        provider.connect(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('provider connect timeout')), CONNECT_TIMEOUT_MS),
        ),
      ]);
    } catch (err) {
      log.error({ err }, 'provider connect failed');
      closeAll('provider connect failed');
      return;
    }

    // Drift-compensated scheduler. Plain `setInterval(_, 20)` actually fires
    // every ~20.8 ms on Node, so we'd send ~48 frames/sec to DialStack
    // instead of the 50 frames/sec a real-time μ-law stream needs. The call
    // leg then fills the gap on the far end with comfort noise → the caller
    // hears stutters, missing syllables and crackle as the underflow
    // compounds. We anchor every tick against a fixed start time so a slow
    // tick gets recovered by the next.
    const tickStart = Date.now();
    let tickIndex = 0;
    const scheduleNextTick = (): void => {
      tickIndex++;
      const target = tickStart + tickIndex * FRAME_MS;
      const delay = Math.max(0, target - Date.now());
      tickTimer = setTimeout(() => {
        drainOneFrame();
        if (!closed) scheduleNextTick();
      }, delay);
    };
    scheduleNextTick();
  });

  stream.on('audio', (event: MediaStreamAudioEvent) => {
    if (!provider) return;
    provider.sendAudio(new Uint8Array(Buffer.from(event.payload, 'base64')));
  });

  stream.on('close', (code: number, reason: string) => {
    log.info({ code, reason }, 'media stream closed');
    closeAll('media stream closed');
  });
  stream.on('error', (err: Error) => {
    log.error({ err }, 'media stream error');
    closeAll('media stream error');
  });

  function enqueueProviderAudio(ulaw: Uint8Array): void {
    // Chunk to exact 20 ms frames so the scheduler can shift one frame per
    // tick with no per-tick math; keep a small carry for the next batch.
    let combined = Buffer.concat([
      outCarry,
      Buffer.from(ulaw.buffer, ulaw.byteOffset, ulaw.byteLength),
    ]);
    while (combined.length >= FRAME_BYTES_8K) {
      outQueue.push(combined.subarray(0, FRAME_BYTES_8K));
      combined = combined.subarray(FRAME_BYTES_8K);
    }
    outCarry = combined;
  }

  function drainOneFrame(): void {
    const frame = outQueue.shift();
    if (!frame) return;
    stream.sendAudio(frame.toString('base64'));
  }

  function closeAll(why: string): void {
    if (closed) return;
    closed = true;
    log.info({ why }, 'closing session');
    if (tickTimer) clearTimeout(tickTimer);
    provider?.close();
    stream.close();
  }
}
