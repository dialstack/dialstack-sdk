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
//   • Tools: Realtime keeps no assistant on OpenAI's side, so the tools (and
//     instructions) are declared in each session's `session.update`. A
//     function named `transfer_to_human` emits `transfer`; any other emits
//     `tool` for the application to answer. Calls run only from a completed
//     `response.done`, never from an interrupted one. Either reply goes back as a
//     `function_call_output`, followed by `response.create` so the model
//     speaks the result.
//   • Each finished turn is emitted as `transcript` (the caller's from input
//     transcription, the agent's assembled from its deltas), and `sendText`
//     adds a user text turn, which the model answers like a spoken one.
//
// Reference:
//   https://developers.openai.com/api/docs/guides/realtime-websocket
//   https://developers.openai.com/api/reference/resources/realtime/client-events
//   https://developers.openai.com/api/reference/resources/realtime/server-events

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { logger } from '../logger.js';
import type { VoiceProvider } from './provider.js';
import { agentTransferError, parseToolArgs } from '../transfer-target.js';

/** A function the model may call, as `session.update` declares it. */
export interface OpenAITool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface OpenAIOptions {
  apiKey: string;
  model: string;
  voice: string;
  instructions: string;
  tools?: OpenAITool[];
  /** Speak first once the session is ready (default). Off, wait for a turn. */
  greet?: boolean;
  /** Transcribe the caller for `transcript` events. Off by default: it is billed per minute. */
  transcribe?: boolean;
}

const TRANSFER_TOOL = 'transfer_to_human';
const TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';

/** The `extension` parameter, shared by any tool that names a transfer target. */
export const TRANSFER_EXTENSION_PARAM = {
  type: 'string',
  description: 'The extension the caller asked for, digits only. Omit if they named none.',
};

/** The tool behind `transfer`; declare it to let the model hand the caller to a person. */
export const TRANSFER_TOOL_DEFINITION: OpenAITool = {
  type: 'function',
  name: TRANSFER_TOOL,
  description: 'Transfer the caller to a person when they ask for one.',
  parameters: {
    type: 'object',
    properties: {
      extension: TRANSFER_EXTENSION_PARAM,
    },
    required: [],
  },
};

export class OpenAIProvider extends EventEmitter implements VoiceProvider {
  private ws?: WebSocket;
  private log = logger.child({ provider: 'openai' });
  private ready = false; // session.updated received
  // Response in progress, and the one the caller barged in on: deltas from
  // the interrupted response can still arrive after speech_started.
  private currentResponseId?: string;
  private interruptedResponseId?: string;
  // Only one response may be in progress, counted from the moment it is
  // requested; a request made meanwhile waits for it to end.
  private responseActive = false;
  private responseRequested = false; // sent, not yet created
  private responsePending = false;
  // Tags our response.create, so an error naming it can be told apart from
  // one about anything else.
  private createEventId?: string;
  private createCount = 0;
  private agentText = '';
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
      ws.once('open', () => ws.send(JSON.stringify(this.sessionUpdate())));
    });
  }

  private sessionUpdate() {
    return {
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: this.opts.instructions,
        tools: this.opts.tools ?? [],
        audio: {
          input: {
            format: { type: 'audio/pcmu' },
            ...(this.opts.transcribe && { transcription: { model: TRANSCRIPTION_MODEL } }),
            turn_detection: {
              type: 'server_vad',
              create_response: true,
              interrupt_response: true,
            },
          },
          output: { format: { type: 'audio/pcmu' }, voice: this.opts.voice },
        },
      },
    };
  }

  private requestResponse(): void {
    if (this.responseActive) {
      this.responsePending = true;
      return;
    }
    // One response answers everything already in the conversation, so a
    // queued request is covered by this one.
    this.responseActive = this.responseRequested = true;
    this.responsePending = false;
    this.createEventId = `response-create-${++this.createCount}`;
    this.ws?.send(JSON.stringify({ type: 'response.create', event_id: this.createEventId }));
  }

  private responseEnded(): void {
    this.responseActive = this.responseRequested = false;
    if (this.responsePending) this.requestResponse();
  }

  sendAudio(ulaw: Uint8Array): void {
    // Hold audio until session.updated so none of it is read as PCM16.
    if (this.ws?.readyState !== WebSocket.OPEN || !this.ready) return;
    const payload = Buffer.from(ulaw.buffer, ulaw.byteOffset, ulaw.byteLength);
    this.ws.send(
      JSON.stringify({ type: 'input_audio_buffer.append', audio: payload.toString('base64') })
    );
  }

  /**
   * Add a user text turn and ask the model to answer it. Unlike Telnyx, OpenAI
   * answers only when asked (response.create). Dropped before session.updated,
   * so it can't overtake the session.update.
   */
  sendText(text: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN || !this.ready) return;
    this.ws.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
      })
    );
    this.requestResponse();
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
        if (this.opts.greet !== false) this.requestResponse();
        this.sessionResolve?.();
        this.sessionResolve = this.sessionReject = undefined;
        return;
      }

      case 'response.created': {
        const response = msg.response as { id?: string } | undefined;
        this.currentResponseId = response?.id;
        this.responseActive = true;
        this.responseRequested = false;
        this.agentText = '';
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
          | {
              id?: string;
              status?: string;
              status_details?: { error?: unknown };
              output?: { type?: string; call_id?: string; name?: string; arguments?: unknown }[];
            }
          | undefined;
        if (response?.status === 'failed') {
          this.log.error(
            { responseId: response.id, error: response.status_details?.error },
            'OpenAI response failed'
          );
        }
        // A late done for an interrupted response must not end the current one.
        if (response?.id !== this.currentResponseId) return;
        // A cancelled response (barge-in) is reported as far as it was
        // generated, which can run ahead of what the caller actually heard.
        this.turn('agent', this.agentText);
        this.agentText = '';
        this.currentResponseId = undefined;
        // Tool results go in before any queued response is requested, so the
        // model answers with them rather than without.
        this.responseActive = this.responseRequested = false;
        // Only a completed response's function calls run: an interrupted or
        // cancelled one can carry a call the model never finished. It is
        // still in the conversation, so the model is told it didn't run.
        for (const item of response?.output ?? []) {
          if (item.type !== 'function_call') continue;
          if (response?.status === 'completed') {
            this.handleFunctionCall(item);
          } else {
            this.log.warn(
              { tool: item.name, status: response?.status },
              'function call in an unfinished response not run'
            );
            this.sendFunctionOutput(item.call_id, {
              error: 'The call was cut off and did not run. Try again if still needed.',
            });
          }
        }
        if (!this.responseActive) this.responseEnded();
        return;
      }

      case 'input_audio_buffer.speech_started':
        this.log.debug('speech started (barge-in)');
        this.interruptedResponseId = this.currentResponseId;
        this.emit('interrupt');
        return;

      case 'error': {
        const error = msg.error as
          { type?: string; code?: string; message?: string; event_id?: string } | undefined;
        // Fatal errors close the socket, and our close handler ends the call.
        // Before session.updated nothing would ever resolve connect() (a
        // rejected session.update, say), so fail it straight away.
        this.log.error(
          { errorType: error?.type, code: error?.code, message: error?.message },
          'OpenAI error event'
        );
        // Only an error about our response.create touches the response slot.
        // Refused because another response (server VAD's) is active: ask
        // again once that one ends. Rejected otherwise: it never starts.
        // The other response's response.created may already have arrived.
        if (error?.event_id !== undefined && error.event_id === this.createEventId) {
          if (error.code === 'conversation_already_has_active_response') {
            this.responseActive = true;
            this.responseRequested = false;
            this.responsePending = true;
          } else if (this.responseRequested) {
            this.responseEnded();
          }
        }
        if (this.sessionReject) {
          this.failSession(
            new Error(`OpenAI error before session.updated: ${error?.message ?? error?.code}`)
          );
        }
        return;
      }

      case 'conversation.item.input_audio_transcription.completed':
        // Gated behind LOG_TRANSCRIPTS=true — these bodies carry PII.
        if (process.env.LOG_TRANSCRIPTS === 'true') this.log.debug({ msg }, type);
        if (typeof msg.transcript === 'string') this.turn('caller', msg.transcript);
        return;

      case 'response.output_audio_transcript.delta':
        if (process.env.LOG_TRANSCRIPTS === 'true') this.log.debug({ msg }, type);
        if (msg.response_id !== this.currentResponseId) return;
        if (typeof msg.delta === 'string') this.agentText += msg.delta;
        return;

      default:
        this.log.debug({ type }, 'unhandled message');
    }
  }

  private turn(role: 'caller' | 'agent', text: string): void {
    const t = text.trim();
    if (t) this.emit('transcript', role, t);
  }

  private sendFunctionOutput(callId: string | undefined, output: Record<string, unknown>): boolean {
    if (!callId || this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) },
      })
    );
    return true;
  }

  private handleFunctionCall(call: { call_id?: string; name?: string; arguments?: unknown }): void {
    const reply = (output: Record<string, unknown>): void => {
      if (this.sendFunctionOutput(call.call_id, output)) this.requestResponse();
    };
    const args = parseToolArgs(call.arguments);
    if (!args) {
      this.log.warn({ tool: call.name }, 'function call with malformed arguments');
      reply({ error: 'The tool arguments must be a JSON object. Try again.' });
      return;
    }
    if (call.name !== TRANSFER_TOOL) {
      // Any other tool belongs to the application, if it listens for one.
      if (call.name && this.listenerCount('tool') > 0) {
        this.emit('tool', call.name, args, reply);
        return;
      }
      this.log.warn({ tool: call.name }, 'unhandled function call');
      reply({ error: 'This tool is not available.' });
      return;
    }
    // Answer only once DialStack has accepted the transfer, so a rejected
    // one doesn't leave the model promising a hand-off that won't happen.
    this.emit('transfer', args, (err?: Error) =>
      reply(err ? { error: agentTransferError(err) } : { result: 'Transferring the caller.' })
    );
  }

  private failSession(err: Error): void {
    this.log.error({ err }, 'OpenAI session failed');
    this.sessionReject?.(err);
    this.sessionResolve = this.sessionReject = undefined;
    this.ws?.close();
  }
}
