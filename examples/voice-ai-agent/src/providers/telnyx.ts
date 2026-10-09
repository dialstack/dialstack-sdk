// Telnyx AI Assistant provider.
//
// Talks to a Telnyx AI Assistant directly over its conversation WebSocket —
// no Telnyx number or SIP leg involved. The protocol is close to OpenAI
// Realtime: base64 PCM16 in via `input_audio_buffer.append`, base64 PCM16
// out via `response.output_audio.delta`.
//
//   • Input: we connect with `input_sample_rate=8000`, so caller audio only
//     needs a μ-law → PCM16 decode, no resampling.
//   • Output: the rate is set by the assistant's voice, not by us, and is
//     reported in `session.created`. We read it from there and downsample to
//     8 kHz; it is never hard-coded.
//   • Barge-in: `input_audio_buffer.speech_started` emits `interrupt`, which
//     makes the session drop agent audio still queued for the caller.
//   • The caller's numbers go in the first `session.update` as dynamic
//     variables; a client-side tool named `transfer_to_human` emits `transfer`.
//
// Reference:
//   https://developers.telnyx.com/api-reference/websockets/talk-to-an-ai-assistant-over-websocket

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { mulawToPcm16, pcm16ToMulaw } from '../audio/mulaw.js';
import { bufferToPcm16, Downsampler8k, pcm16ToBuffer } from '../audio/resample.js';
import { logger } from '../logger.js';
import type { CallInfo, VoiceProvider } from './provider.js';

export interface TelnyxOptions {
  apiKey: string;
  assistantId: string;
}

const INPUT_SAMPLE_RATE = 8000;
const TRANSFER_TOOL = 'transfer_to_human';

interface SessionCreated {
  session?: {
    conversation_id?: string;
    audio?: { output?: { format?: { rate?: number } } };
  };
}

export class TelnyxProvider extends EventEmitter implements VoiceProvider {
  private ws?: WebSocket;
  private log = logger.child({ provider: 'telnyx' });
  private outputRate?: number; // from session.created
  private downsampler?: Downsampler8k;
  // Response in progress, and the one the caller barged in on: deltas from
  // the interrupted response can still arrive after speech_started.
  private currentResponseId?: string;
  private interruptedResponseId?: string;
  // A delta can end mid-sample; carry the odd byte so later samples stay aligned.
  private pendingByte?: Buffer;
  private sessionResolve?: () => void;
  private sessionReject?: (err: Error) => void;

  constructor(private readonly opts: TelnyxOptions) {
    super();
  }

  async connect(call: CallInfo): Promise<void> {
    const url =
      `wss://api.telnyx.com/v2/ai/assistants/${encodeURIComponent(this.opts.assistantId)}` +
      `/conversation?input_sample_rate=${INPUT_SAMPLE_RATE}&input_format=pcm16&output_format=pcm16`;
    this.log.info('connecting to Telnyx');

    const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${this.opts.apiKey}` } });
    this.ws = ws;

    // Handlers go on before open so session.created can't be missed.
    ws.on('message', (raw) => this.handleMessage(raw.toString('utf8')));
    ws.on('close', (code, reason) => {
      this.log.info({ code, reason: reason.toString('utf8') }, 'Telnyx WS closed');
      this.sessionReject?.(new Error(`Telnyx WS closed before session.created (${code})`));
      this.emit('close', reason.toString('utf8'));
    });
    ws.on('error', (err) => {
      this.log.error({ err }, 'Telnyx WS error');
      this.emit('error', err);
    });
    ws.on('unexpected-response', (_req, res) => {
      const err = new Error(`Telnyx WS handshake failed: HTTP ${res.statusCode}`);
      this.sessionReject?.(err);
      ws.terminate();
    });

    await new Promise<void>((resolve, reject) => {
      this.sessionResolve = resolve;
      this.sessionReject = reject;
      ws.once('open', () => {
        // Must be the first frame: Telnyx rejects a session.update after the
        // session starts. Without it the conversation also only starts after
        // a server-side timeout. Dynamic variables are only substituted where
        // the assistant's instructions or greeting reference them, e.g.
        // {{caller_number}}.
        ws.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              assistant: {
                dynamic_variables: {
                  caller_number: call.fromNumber ?? '',
                  called_number: call.toNumber ?? '',
                },
              },
            },
          }),
        );
      });
      ws.once('error', reject);
    });
  }

  sendAudio(ulaw: Uint8Array): void {
    // Hold audio until session.created; the server rejects it before then.
    if (this.ws?.readyState !== WebSocket.OPEN || this.outputRate === undefined) return;
    const pcm = pcm16ToBuffer(mulawToPcm16(ulaw));
    this.ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: pcm.toString('base64') }));
  }

  close(): void {
    this.ws?.close();
  }

  private handleMessage(text: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(text) as Record<string, unknown>;
    } catch {
      this.log.warn({ text }, 'non-JSON message from Telnyx');
      return;
    }

    const type = typeof msg.type === 'string' ? msg.type : '';
    switch (type) {
      case 'session.created': {
        const session = (msg as SessionCreated).session;
        const rate = session?.audio?.output?.format?.rate;
        if (typeof rate !== 'number' || rate < 8000) {
          this.failSession(new Error(`Telnyx session.created has unusable output rate: ${rate}`));
          return;
        }
        this.outputRate = rate;
        this.downsampler = new Downsampler8k(rate);
        this.log.info(
          { conversationId: session?.conversation_id, outputRate: rate },
          'assistant ready',
        );
        this.sessionResolve?.();
        this.sessionResolve = this.sessionReject = undefined;
        return;
      }

      case 'response.created': {
        const response = msg.response as { id?: string } | undefined;
        this.currentResponseId = response?.id;
        this.pendingByte = undefined;
        return;
      }

      case 'response.done':
        this.currentResponseId = undefined;
        return;

      case 'response.output_audio.delta': {
        if (!this.downsampler || typeof msg.delta !== 'string') return;
        if (msg.response_id !== undefined && msg.response_id === this.interruptedResponseId) return;
        let bytes = Buffer.from(msg.delta, 'base64');
        if (this.pendingByte) bytes = Buffer.concat([this.pendingByte, bytes]);
        this.pendingByte = bytes.length % 2 ? bytes.subarray(bytes.length - 1) : undefined;
        const pcm = bufferToPcm16(bytes);
        this.emit('audio', pcm16ToMulaw(this.downsampler.push(pcm)));
        return;
      }

      case 'input_audio_buffer.speech_started':
        this.log.debug('speech started (barge-in)');
        this.interruptedResponseId = this.currentResponseId;
        this.emit('interrupt');
        return;

      case 'conversation.item.created': {
        const item = msg.item as { type?: string; call_id?: string; name?: string } | undefined;
        if (item?.type === 'function_call') this.handleFunctionCall(item);
        return;
      }

      case 'error': {
        const error = msg.error as { code?: string; message?: string } | undefined;
        // The docs don't say which codes are fatal; the fatal ones close the
        // socket, and our close handler ends the call. Before session.created
        // nothing would ever resolve connect(), so fail it straight away.
        this.log.error({ code: error?.code, message: error?.message }, 'Telnyx error event');
        if (this.sessionReject) {
          this.failSession(new Error(`Telnyx error before session.created: ${error?.code}`));
        }
        return;
      }

      case 'conversation.item.input_audio_transcription.completed':
      case 'response.output_audio_transcript.delta':
        // Gated behind LOG_TRANSCRIPTS=true — these bodies carry PII.
        if (process.env.LOG_TRANSCRIPTS === 'true') this.log.debug({ msg }, type);
        return;

      default:
        this.log.debug({ type }, 'unhandled message');
    }
  }

  private handleFunctionCall(item: { call_id?: string; name?: string }): void {
    const reply = (output: string): void => {
      if (!item.call_id) return;
      this.ws?.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: { type: 'function_call_output', call_id: item.call_id, output },
        }),
      );
    };
    if (item.name !== TRANSFER_TOOL) {
      this.log.warn({ tool: item.name }, 'unhandled client-side tool');
      reply(JSON.stringify({ error: 'This tool is not available.' }));
      return;
    }
    // Answer only once DialStack has accepted the transfer, so a rejected
    // one doesn't leave the assistant promising a hand-off that won't happen.
    this.emit('transfer', (err?: Error) =>
      reply(
        JSON.stringify(
          err
            ? { error: 'The transfer could not be placed. Apologise and keep helping the caller.' }
            : { result: 'Transferring the caller.' },
        ),
      ),
    );
  }

  private failSession(err: Error): void {
    this.log.error({ err }, 'Telnyx session failed');
    this.sessionReject?.(err);
    this.sessionResolve = this.sessionReject = undefined;
    this.ws?.close();
  }
}
