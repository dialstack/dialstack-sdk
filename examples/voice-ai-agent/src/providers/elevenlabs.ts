// ElevenLabs Conversational AI provider.
//
// Both audio formats are agent settings (ASR input, TTS output); neither is
// a per-conversation override, so we send no override and adapt to what the
// agent reports in `conversation_initiation_metadata`:
//   • ulaw_8000: pass μ-law bytes through verbatim.
//   • pcm_16000: transcode via PCM 8 kHz and resample.
// Any other format fails the call with a clear log line.
//
// For best audio quality, set both formats to **μ-law 8000 Hz** in the
// agent's settings so both legs are pass-through.
//
// Reference:
//   https://elevenlabs.io/docs/agents-platform/api-reference/agents-platform/websocket

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { mulawToPcm16, pcm16ToMulaw } from '../audio/mulaw.js';
import { downsample16kTo8k, pcm16ToBuffer, upsample8kTo16k } from '../audio/resample.js';
import { logger } from '../logger.js';
import type { CallInfo, VoiceProvider } from './provider.js';

export interface ElevenLabsOptions {
  apiKey: string;
  agentId: string;
}

const SUPPORTED_FORMATS = ['ulaw_8000', 'pcm_16000'] as const;
type AudioFormat = (typeof SUPPORTED_FORMATS)[number];
const isAudioFormat = (f: string): f is AudioFormat =>
  (SUPPORTED_FORMATS as readonly string[]).includes(f);

const TRANSFER_TOOL = 'transfer_to_human';

const SIGNED_URL_ENDPOINT = 'https://api.elevenlabs.io/v1/convai/conversation/get-signed-url';

export class ElevenLabsProvider extends EventEmitter implements VoiceProvider {
  private ws?: WebSocket;
  private log = logger.child({ provider: 'elevenlabs' });
  private inputFormat: AudioFormat = 'pcm_16000'; // updated from init metadata
  private outputFormat: AudioFormat = 'pcm_16000'; // updated from init metadata
  // Resolves connect() once conversation_initiation_metadata arrives and
  // inputFormat is known — avoids sending the first audio frames as PCM16
  // when the agent expects ulaw_8000.
  private metadataResolve?: () => void;
  private metadataReject?: (err: Error) => void;
  // Audio events of a response ElevenLabs has interrupted can still be in
  // flight; their event_id is below the interruption's. Equal ids belong to
  // the next response, matching the ElevenLabs JS client.
  private interruptedEventId = -1;

  constructor(private readonly opts: ElevenLabsOptions) {
    super();
  }

  async connect(call: CallInfo): Promise<void> {
    const signedUrl = await this.fetchSignedUrl();
    this.log.info('connecting to ElevenLabs');

    const ws = new WebSocket(signedUrl);
    this.ws = ws;

    // Attach handlers BEFORE the socket opens so we never lose the
    // `conversation_initiation_metadata` message — ElevenLabs sends it
    // immediately after our init, and if we wait until after resolve() to
    // attach the message listener it can race and be dropped.
    ws.on('message', (raw) => this.handleMessage(raw.toString('utf8')));
    ws.on('close', (code, reason) => {
      this.log.info({ code, reason: reason.toString('utf8') }, 'ElevenLabs WS closed');
      this.settleConnect(new Error(`ElevenLabs closed before the agent was ready (${code})`));
      this.emit('close', reason.toString('utf8'));
    });
    ws.on('error', (err) => {
      this.log.error({ err }, 'ElevenLabs WS error');
      this.emit('error', err);
    });

    await new Promise<void>((resolve, reject) => {
      this.metadataResolve = resolve;
      this.metadataReject = reject;
      ws.once('open', () => {
        // Dynamic variables are only substituted where the agent's prompt or
        // first message references them, e.g. {{caller_number}}.
        ws.send(
          JSON.stringify({
            type: 'conversation_initiation_client_data',
            dynamic_variables: {
              caller_number: call.fromNumber ?? '',
              called_number: call.toNumber ?? '',
            },
          })
        );
        // Do not resolve here — wait for conversation_initiation_metadata so
        // inputFormat is set before the session starts forwarding caller audio.
      });
      ws.once('error', reject);
    });
  }

  private settleConnect(err?: Error): void {
    if (!this.metadataReject) return;
    if (err) this.metadataReject(err);
    else this.metadataResolve?.();
    this.metadataResolve = undefined;
    this.metadataReject = undefined;
  }

  sendAudio(ulaw: Uint8Array): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    let payload: Buffer;
    if (this.inputFormat === 'ulaw_8000') {
      payload = Buffer.from(ulaw.buffer, ulaw.byteOffset, ulaw.byteLength);
    } else {
      // pcm_16000 — decode μ-law to PCM 8 kHz, then upsample.
      const pcm16k = upsample8kTo16k(mulawToPcm16(ulaw));
      payload = pcm16ToBuffer(pcm16k);
    }
    this.ws.send(JSON.stringify({ user_audio_chunk: payload.toString('base64') }));
  }

  close(): void {
    this.ws?.close();
  }

  private async fetchSignedUrl(): Promise<string> {
    const url = `${SIGNED_URL_ENDPOINT}?agent_id=${encodeURIComponent(this.opts.agentId)}`;
    const res = await fetch(url, { headers: { 'xi-api-key': this.opts.apiKey } });
    if (!res.ok) {
      const hint =
        res.status === 401
          ? ' (check ELEVENLABS_API_KEY and its convai_write permission)'
          : res.status === 404
            ? ' (check ELEVENLABS_AGENT_ID)'
            : '';
      throw new Error(`ElevenLabs get-signed-url failed: ${res.status}${hint} ${await res.text()}`);
    }
    const body = (await res.json()) as { signed_url: string };
    return body.signed_url;
  }

  private handleMessage(text: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(text) as Record<string, unknown>;
    } catch {
      this.log.warn({ text }, 'non-JSON message from ElevenLabs');
      return;
    }

    const type = typeof msg.type === 'string' ? msg.type : '';
    switch (type) {
      case 'conversation_initiation_metadata': {
        const meta = msg.conversation_initiation_metadata_event as
          | {
              conversation_id?: string;
              user_input_audio_format?: string;
              agent_output_audio_format?: string;
            }
          | undefined;
        const input = meta?.user_input_audio_format ?? '(missing)';
        const output = meta?.agent_output_audio_format ?? '(missing)';
        if (!isAudioFormat(input) || !isAudioFormat(output)) {
          this.log.error(
            { input, output, supported: SUPPORTED_FORMATS },
            'unsupported agent audio format; set the agent to μ-law 8000 Hz'
          );
          this.settleConnect(
            new Error(`unsupported ElevenLabs audio format input=${input} output=${output}`)
          );
          return;
        }
        this.inputFormat = input;
        this.outputFormat = output;
        this.log.info(
          {
            conversation_id: meta?.conversation_id,
            inputFormat: this.inputFormat,
            outputFormat: this.outputFormat,
          },
          'agent ready'
        );
        this.settleConnect();
        return;
      }

      case 'audio': {
        const audioEvent = msg.audio_event as
          { audio_base_64?: string; event_id?: number } | undefined;
        const b64 = audioEvent?.audio_base_64;
        if (!b64) return;
        if ((audioEvent?.event_id ?? Infinity) < this.interruptedEventId) return;
        const bytes = Buffer.from(b64, 'base64');
        if (this.outputFormat === 'ulaw_8000') {
          this.emit('audio', new Uint8Array(bytes));
        } else {
          // pcm_16000 — downsample to 8 kHz, then μ-law encode.
          const pcm16k = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1);
          this.emit('audio', pcm16ToMulaw(downsample16kTo8k(pcm16k)));
        }
        return;
      }

      case 'ping': {
        // ping_ms is ElevenLabs' latency measurement, not a requested delay.
        const pingEvent = msg.ping_event as { event_id?: number } | undefined;
        this.ws?.send(JSON.stringify({ type: 'pong', event_id: pingEvent?.event_id }));
        return;
      }

      case 'interruption': {
        // ElevenLabs has already abandoned the agent's response, so the audio
        // we still hold for it is stale. Echo on the caller's line can also
        // trigger this; that is tuned on the agent (turn settings), not here.
        const ev = msg.interruption_event as { event_id?: number } | undefined;
        if (typeof ev?.event_id === 'number') this.interruptedEventId = ev.event_id;
        this.log.debug({ event_id: ev?.event_id }, 'interruption');
        this.emit('interrupt');
        return;
      }

      case 'client_tool_call': {
        // A client tool named `transfer_to_human` on the agent hands the call
        // to DialStack's `transfer` action. Other client tools aren't handled.
        const call = msg.client_tool_call as
          { tool_name?: string; tool_call_id?: string; expects_response?: boolean } | undefined;
        const reply = (result: string, isError: boolean): void => {
          if (call?.expects_response === false || !call?.tool_call_id) return;
          this.ws?.send(
            JSON.stringify({
              type: 'client_tool_result',
              tool_call_id: call.tool_call_id,
              result,
              is_error: isError,
            })
          );
        };
        if (call?.tool_name !== TRANSFER_TOOL) {
          this.log.warn({ tool: call?.tool_name }, 'unhandled client tool');
          reply('This tool is not available.', true);
          return;
        }
        // Answer only once DialStack has accepted the transfer, so a rejected
        // one doesn't leave the agent promising a hand-off that won't happen.
        this.emit('transfer', (err?: Error) =>
          err
            ? reply(
                'The transfer could not be placed. Apologise and keep helping the caller.',
                true
              )
            : reply('Transferring the caller.', false)
        );
        return;
      }

      case 'agent_response_correction':
        // Sent after an interruption with the truncated reply text; nothing to do.
        return;

      case 'agent_response':
      case 'user_transcript':
        // Gated behind LOG_TRANSCRIPTS=true — these bodies carry PII.
        if (process.env.LOG_TRANSCRIPTS === 'true') this.log.debug({ msg }, type);
        return;

      default:
        this.log.debug({ type }, 'unhandled message');
    }
  }
}
