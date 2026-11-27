// Per-call session: ties one DialStack media WebSocket to one VoiceProvider.
//
// Everything on this side of the provider boundary speaks μ-law 8 kHz —
// DialStack's native format. Providers handle their own transcoding
// internally; we just shuttle bytes here.
//
// Lifecycle:
//   1. We wait for the `begin` event from MediaStream to learn the call_id,
//      and refuse a server older than media protocol 2.2.
//   2. We call `provider.connect()`.
//   3. Caller audio frames arrive ~every 20 ms (~160 μ-law bytes). We
//      base64-decode them and hand the raw μ-law to the provider.
//   4. Provider audio (also μ-law 8 kHz) is forwarded as it arrives, in
//      whatever size the provider produced it: DialStack plays it at real
//      time. On barge-in we send `clear`, which drops what is still queued.
//   5. For providers that tag their audio (OpenAI), we send a `mark` every
//      200 ms of an item and report each echo back with `audioPlayed`, so the
//      provider can truncate an interrupted item to what the caller heard.
//   6. Either side closing closes the other side.

import { logger } from './logger.js';
import { takeCall } from './calls.js';
import type { AudioMeta, CallInfo, VoiceProvider } from './providers/provider.js';
import type {
  MediaStream,
  MediaStreamAudioEvent,
  MediaStreamBeginEvent,
  MediaStreamMarkEvent,
} from '@dialstack/sdk-server';
import { resolveTransferTarget } from './transfer-target.js';

const CONNECT_TIMEOUT_MS = 15_000;
// One mark per 200 ms of an item bounds both the truncation error and the
// marks pending at DialStack (20 s of audio queued is 100 marks, under 1024).
const MARK_EVERY_BYTES = 1600;
// DialStack queues about 20 s and drops what goes past it, and a mark after a
// drop would report unheard audio as played. Unechoed audio is at least what is
// queued, so audio is forwarded only while less than 17 s of it is unechoed,
// which keeps the queue short of the limit (and of the `overflow` warning just
// below it), and marks stay under DialStack's 1024 pending, counting echoes a
// clear released that have not arrived yet. Past either, the rest of that item
// is dropped here, where its last mark stays truthful.
const MAX_UNECHOED_BYTES = 17 * 8000;
const MAX_OUTSTANDING_MARKS = 900;
const REQUIRED_PROTOCOL = [2, 2];

/** True when `version` ("major.minor") is at least the protocol we need. */
export function supportsProtocol(version: unknown): boolean {
  if (typeof version !== 'string') return false;
  const [major, minor] = version.split('.').map(Number);
  if (!Number.isInteger(major) || !Number.isInteger(minor)) return false;
  return (
    major > REQUIRED_PROTOCOL[0] ||
    (major === REQUIRED_PROTOCOL[0] && minor >= REQUIRED_PROTOCOL[1])
  );
}

export interface SessionOptions {
  stream: MediaStream;
  /** Called once the call is known, so a provider can be chosen per call. */
  makeProvider: (call: CallInfo) => VoiceProvider;
  transfer: (callId: string, accountId: string, target: string) => Promise<unknown>;
}

export function runSession({ stream, makeProvider, transfer }: SessionOptions): void {
  const log = logger.child({ component: 'session' });

  let provider: VoiceProvider | undefined;
  let closed = false;
  // Marks sent and not yet echoed, with the audio sent up to each, and those a
  // clear released: their echoes say nothing about what was played.
  const pendingMarks = new Map<string, { itemId: string; endMs: number; upTo: number }>();
  let markSeq = 0;
  const clearedMarks = new Set<string>();
  let markedItem: string | undefined;
  let itemBytes = 0;
  let markedBytes = 0;
  // Audio sent on the marked path, and how much of it an echo has covered.
  let sentBytes = 0;
  let echoedBytes = 0;
  let droppingItem: string | undefined;

  stream.once('begin', async (begin: MediaStreamBeginEvent) => {
    log.info({ call_id: begin.call_id, account_id: begin.account_id }, 'call begin');

    if (!supportsProtocol(begin.protocol_version)) {
      // Only its type: the socket is not yet tied to a verified call.
      log.error(
        { protocol_version_type: typeof begin.protocol_version },
        'needs DialStack media protocol 2.2; closing'
      );
      closeAll('unsupported media protocol');
      return;
    }

    const call = takeCall(begin.call_id);
    if (!call) {
      log.warn({ call_id: begin.call_id }, 'media socket for a call we did not attach; closing');
      closeAll('unknown call');
      return;
    }

    const info: CallInfo = {
      callId: begin.call_id,
      accountId: call.accountId,
      fromNumber: call.fromNumber,
      toNumber: call.toNumber,
    };
    provider = makeProvider(info);

    provider.on('audio', (ulaw, meta) => forwardProviderAudio(ulaw, meta));
    provider.on('interrupt', () => clearProviderAudio());
    provider.on('transfer', (args, done) => {
      // The transfer replaces the running attach; DialStack then closes this
      // media socket, which ends the session.
      const resolved = resolveTransferTarget(args, process.env);
      if ('error' in resolved) {
        // Only the extension: the other arguments are model-written from what
        // the caller said, which stays out of the logs (see LOG_TRANSCRIPTS).
        log.warn({ extension: args.extension, reason: resolved.error.message }, 'transfer refused');
        done(resolved.error);
        return;
      }
      const { target } = resolved;
      log.info({ target }, 'transferring the caller');
      transfer(begin.call_id, call.accountId, target).then(
        () => done(),
        (err: unknown) => {
          log.error({ err }, 'transfer failed');
          done(err instanceof Error ? err : new Error(String(err)));
        }
      );
    });
    provider.on('close', () => closeAll('provider closed'));
    provider.on('error', (err) => {
      log.error({ err }, 'provider error');
      closeAll('provider error');
    });

    try {
      await Promise.race([
        provider.connect(info),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('provider connect timeout')), CONNECT_TIMEOUT_MS)
        ),
      ]);
    } catch (err) {
      log.error({ err }, 'provider connect failed');
      closeAll('provider connect failed');
      return;
    }
  });

  stream.on('audio', (event: MediaStreamAudioEvent) => {
    if (!provider) return;
    provider.sendAudio(new Uint8Array(Buffer.from(event.payload, 'base64')));
  });

  stream.on('mark', (event: MediaStreamMarkEvent) => {
    if (clearedMarks.delete(event.name)) return;
    const mark = pendingMarks.get(event.name);
    if (!mark) return;
    pendingMarks.delete(event.name);
    echoedBytes = Math.max(echoedBytes, mark.upTo);
    provider?.audioPlayed?.(mark.itemId, mark.endMs);
  });

  stream.on('close', (code: number, reason: string) => {
    log.info({ code, reason }, 'media stream closed');
    closeAll('media stream closed');
  });
  stream.on('error', (err: Error) => {
    log.error({ err }, 'media stream error');
    closeAll('media stream error');
  });

  function forwardProviderAudio(ulaw: Uint8Array, meta?: AudioMeta): void {
    let chunk = Buffer.from(ulaw.buffer, ulaw.byteOffset, ulaw.byteLength);
    if (!meta || !provider?.audioPlayed) {
      if (chunk.length > 0) stream.sendAudioBuffer(chunk);
      return;
    }
    if (meta.itemId === droppingItem) return;
    if (meta.itemId !== markedItem) {
      markedItem = meta.itemId;
      itemBytes = markedBytes = 0;
    }
    // Split at each 200 ms boundary of the item, so a chunk of any size
    // still gets a mark every 200 ms.
    while (chunk.length > 0) {
      const boundary = (Math.floor(itemBytes / MARK_EVERY_BYTES) + 1) * MARK_EVERY_BYTES;
      const part = chunk.subarray(0, boundary - itemBytes);
      if (sentBytes - echoedBytes + part.length > MAX_UNECHOED_BYTES || !markRoom()) {
        dropRestOfItem(meta.itemId);
        return;
      }
      stream.sendAudioBuffer(part);
      itemBytes += part.length;
      sentBytes += part.length;
      chunk = chunk.subarray(part.length);
      if (itemBytes === boundary) sendItemMark(meta.itemId);
    }
    if (meta.last && itemBytes > markedBytes && markRoom()) sendItemMark(meta.itemId);
  }

  function markRoom(): boolean {
    return pendingMarks.size + clearedMarks.size < MAX_OUTSTANDING_MARKS;
  }

  function dropRestOfItem(itemId: string): void {
    droppingItem = itemId;
    log.warn(
      { item_id: itemId, sent_ms: Math.floor(itemBytes / 8) },
      'agent audio too far ahead of the caller; dropping the rest of this reply'
    );
    if (itemBytes > markedBytes && markRoom()) sendItemMark(itemId);
    provider?.audioDropped?.(itemId, Math.ceil(itemBytes / 8));
  }

  function sendItemMark(itemId: string): void {
    // A counter, not the item id: ids can be long, and nothing is parsed back.
    const name = String(++markSeq);
    markedBytes = itemBytes;
    pendingMarks.set(name, { itemId, endMs: Math.ceil(itemBytes / 8), upTo: sentBytes });
    stream.sendMark(name);
  }

  function clearProviderAudio(): void {
    for (const name of pendingMarks.keys()) clearedMarks.add(name);
    pendingMarks.clear();
    echoedBytes = sentBytes;
    stream.sendClear();
  }

  function closeAll(why: string): void {
    if (closed) return;
    closed = true;
    log.info({ why }, 'closing session');
    provider?.close();
    stream.close();
  }
}
