// OpenAI Realtime provider.
//
// Talks to the OpenAI Realtime API (GA interface) over its WebSocket. Realtime
// accepts and emits G.711 μ-law (`audio/pcmu`) natively, so both legs are a
// pure pass-through of DialStack's μ-law 8 kHz — no transcoding, no
// resampling.
//
//   • Setup: on open we send `session.update` (μ-law both ways, voice,
//     instructions, server VAD). Once `session.updated` confirms it we send
//     `response.create` so the agent greets the caller first.
//   • Barge-in: server VAD with `interrupt_response` cancels the response
//     server-side; `input_audio_buffer.speech_started` emits `interrupt`,
//     which makes the session drop agent audio still queued for the caller.
//     Deltas of the interrupted response that are already in flight are
//     dropped by `response_id`.
//
// Reference:
//   https://developers.openai.com/api/docs/guides/realtime-websocket
//   https://developers.openai.com/api/reference/resources/realtime/client-events
//   https://developers.openai.com/api/reference/resources/realtime/server-events

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { logger } from '../logger.js';
import type { VoiceProvider } from './provider.js';

export interface OpenAIOptions {
  apiKey: string;
  model: string;
  voice: string;
  instructions: string;
}

export class OpenAIProvider extends EventEmitter implements VoiceProvider {
  private ws?: WebSocket;
  private log = logger.child({ provider: 'openai' });
  private ready = false; // session.updated received
  // Response in progress, and the one the caller barged in on: deltas from
  // the interrupted response can still arrive after speech_started.
  private currentResponseId?: string;
  private interruptedResponseId?: string;
  private sessionResolve?: () => void;
  private sessionReject?: (err: Error) => void;

  constructor(private readonly opts: OpenAIOptions) {
    super();
  }

  async connect(): Promise<void> {
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.opts.model)}`;
    this.log.info({ model: this.opts.model }, 'connecting to OpenAI Realtime');

    const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${this.opts.apiKey}` } });
    this.ws = ws;

    // Handlers go on before open so session.updated can't be missed.
    ws.on('message', (raw) => this.handleMessage(raw.toString('utf8')));
    ws.on('close', (code, reason) => {
      this.log.info({ code, reason: reason.toString('utf8') }, 'OpenAI WS closed');
      this.sessionReject?.(new Error(`OpenAI WS closed before session.updated (${code})`));
      this.emit('close', reason.toString('utf8'));
    });
    ws.on('error', (err) => {
      this.log.error({ err }, 'OpenAI WS error');
      // Before session.updated, connect() reports the failure; don't also
      // fail the session (ws emits an extra error when a handshake aborts).
      if (this.sessionReject) this.failSession(err);
      else if (this.ready) this.emit('error', err);
    });
    ws.on('unexpected-response', (_req, res) => {
      // The body is OpenAI's JSON error (invalid_api_key, model_not_found, …).
      let body = '';
      res.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
      res.on('end', () => {
        this.failSession(new Error(`OpenAI WS handshake failed: HTTP ${res.statusCode} ${body}`));
        ws.terminate();
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.sessionResolve = resolve;
      this.sessionReject = reject;
      ws.once('open', () => {
        ws.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              type: 'realtime',
              instructions: this.opts.instructions,
              audio: {
                input: {
                  format: { type: 'audio/pcmu' },
                  turn_detection: {
                    type: 'server_vad',
                    create_response: true,
                    interrupt_response: true,
                  },
                },
                output: { format: { type: 'audio/pcmu' }, voice: this.opts.voice },
              },
            },
          }),
        );
      });
    });
  }

  sendAudio(ulaw: Uint8Array): void {
    // Hold audio until session.updated so none of it is read as PCM16.
    if (this.ws?.readyState !== WebSocket.OPEN || !this.ready) return;
    const payload = Buffer.from(ulaw.buffer, ulaw.byteOffset, ulaw.byteLength);
    this.ws.send(
      JSON.stringify({ type: 'input_audio_buffer.append', audio: payload.toString('base64') }),
    );
  }

  close(): void {
    this.ws?.close();
  }

  private handleMessage(text: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(text) as Record<string, unknown>;
    } catch {
      this.log.warn({ text }, 'non-JSON message from OpenAI');
      return;
    }

    const type = typeof msg.type === 'string' ? msg.type : '';
    switch (type) {
      case 'session.updated': {
        if (this.ready) return;
        this.ready = true;
        this.log.info('session ready');
        // Have the agent speak first instead of waiting for the caller.
        this.ws?.send(JSON.stringify({ type: 'response.create' }));
        this.sessionResolve?.();
        this.sessionResolve = this.sessionReject = undefined;
        return;
      }

      case 'response.created': {
        const response = msg.response as { id?: string } | undefined;
        this.currentResponseId = response?.id;
        return;
      }

      case 'response.output_audio.delta': {
        if (typeof msg.delta !== 'string') return;
        if (msg.response_id !== undefined && msg.response_id === this.interruptedResponseId) return;
        this.emit('audio', Buffer.from(msg.delta, 'base64'));
        return;
      }

      case 'response.done': {
        // A failed response (a failed greeting, say) leaves the socket open,
        // so the caller just hears silence; say why.
        const response = msg.response as
          | { id?: string; status?: string; status_details?: { error?: unknown } }
          | undefined;
        if (response?.status === 'failed') {
          this.log.error(
            { responseId: response.id, error: response.status_details?.error },
            'OpenAI response failed',
          );
        }
        return;
      }

      case 'input_audio_buffer.speech_started':
        this.log.debug('speech started (barge-in)');
        this.interruptedResponseId = this.currentResponseId;
        this.emit('interrupt');
        return;

      case 'error': {
        const error = msg.error as { type?: string; code?: string; message?: string } | undefined;
        // Fatal errors close the socket, and our close handler ends the call.
        // Before session.updated nothing would ever resolve connect() (a
        // rejected session.update, say), so fail it straight away.
        this.log.error(
          { errorType: error?.type, code: error?.code, message: error?.message },
          'OpenAI error event',
        );
        if (this.sessionReject) {
          this.failSession(new Error(`OpenAI error before session.updated: ${error?.message ?? error?.code}`));
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

  private failSession(err: Error): void {
    this.log.error({ err }, 'OpenAI session failed');
    this.sessionReject?.(err);
    this.sessionResolve = this.sessionReject = undefined;
    this.ws?.close();
  }
}
