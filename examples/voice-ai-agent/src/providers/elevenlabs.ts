// ElevenLabs Conversational AI provider.
//
// ElevenLabs' agent supports two audio formats: μ-law 8 kHz (`ulaw_8000`)
// and PCM 16-bit 16 kHz (`pcm_16000`). The agent's *input* format is set in
// the dashboard and isn't API-overridable; the *output* format can be
// overridden per-conversation.
//
// We always request `ulaw_8000` for output (matches DialStack's wire
// format → no transcoding on the way out), and we adapt to whichever input
// format the agent reports in `conversation_initiation_metadata`:
//   • ulaw_8000: pass μ-law bytes through verbatim.
//   • pcm_16000: μ-law → PCM 8k → upsample → 16 kHz PCM.
//
// For best audio quality, set "Input audio format" to **μ-law 8000 Hz** in
// the ElevenLabs agent's Voice settings so both legs are pass-through.
//
// Reference:
//   https://elevenlabs.io/docs/conversational-ai/api-reference/conversational-ai/websocket

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { mulawToPcm16, pcm16ToMulaw } from '../audio/mulaw.js';
import { downsample16kTo8k, pcm16ToBuffer, upsample8kTo16k } from '../audio/resample.js';
import { logger } from '../logger.js';
import type { VoiceProvider } from './provider.js';

export interface ElevenLabsOptions {
  apiKey: string;
  agentId: string;
}

type AudioFormat = 'ulaw_8000' | 'pcm_16000';

const SIGNED_URL_ENDPOINT =
  'https://api.elevenlabs.io/v1/convai/conversation/get-signed-url';

export class ElevenLabsProvider extends EventEmitter implements VoiceProvider {
  private ws?: WebSocket;
  private log = logger.child({ provider: 'elevenlabs' });
  private inputFormat: AudioFormat = 'pcm_16000'; // updated from init metadata
  private outputFormat: AudioFormat = 'pcm_16000'; // updated from init metadata
  // Resolves connect() once conversation_initiation_metadata arrives and
  // inputFormat is known — avoids sending the first audio frames as PCM16
  // when the agent expects ulaw_8000.
  private metadataResolve?: () => void;

  constructor(private readonly opts: ElevenLabsOptions) {
    super();
  }

  async connect(): Promise<void> {
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
      this.emit('close', reason.toString('utf8'));
    });
    ws.on('error', (err) => {
      this.log.error({ err }, 'ElevenLabs WS error');
      this.emit('error', err);
    });

    await new Promise<void>((resolve, reject) => {
      this.metadataResolve = resolve;
      ws.once('open', () => {
        ws.send(
          JSON.stringify({
            type: 'conversation_initiation_client_data',
            conversation_config_override: {
              agent: {
                // Ask the agent to emit μ-law 8 kHz so we can pipe its audio
                // straight to DialStack without resampling.
                tts: { agent_output_audio_format: 'ulaw_8000' },
              },
            },
          }),
        );
        // Do not resolve here — wait for conversation_initiation_metadata so
        // inputFormat is set before the session starts forwarding caller audio.
      });
      ws.once('error', reject);
    });
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
      throw new Error(`ElevenLabs get-signed-url failed: ${res.status} ${await res.text()}`);
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
          | { user_input_audio_format?: string; agent_output_audio_format?: string }
          | undefined;
        if (meta?.user_input_audio_format === 'ulaw_8000') this.inputFormat = 'ulaw_8000';
        if (meta?.agent_output_audio_format === 'ulaw_8000') this.outputFormat = 'ulaw_8000';
        this.log.info(
          { inputFormat: this.inputFormat, outputFormat: this.outputFormat },
          'agent ready',
        );
        this.metadataResolve?.();
        this.metadataResolve = undefined;
        return;
      }

      case 'audio': {
        const audioEvent = msg.audio_event as { audio_base_64?: string } | undefined;
        const b64 = audioEvent?.audio_base_64;
        if (!b64) return;
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
        // Echo event_id back as a pong (the optional ping_ms delay is
        // skipped here for simplicity).
        const pingEvent = msg.ping_event as { event_id?: number } | undefined;
        this.ws?.send(JSON.stringify({ type: 'pong', event_id: pingEvent?.event_id }));
        return;
      }

      case 'interruption':
        // ElevenLabs fires this whenever its server-side VAD detects user
        // audio overlapping with agent audio. Over a phone call with
        // imperfect echo cancellation, that includes the agent's *own*
        // voice leaking from the caller's speaker back into their mic, so
        // treating it as a hard "flush the queue" cancels the agent
        // mid-sentence on most turns. We log it for visibility but trust
        // ElevenLabs to actually stop generating frames if the
        // interruption was real.
        this.log.debug('interruption (advisory; not flushing)');
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
