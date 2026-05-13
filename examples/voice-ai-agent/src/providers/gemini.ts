// Google Gemini Live provider.
//
// Backed by `@google/genai`'s Live API. Two backends, selected by env:
//   • Google AI Studio  — `GEMINI_API_KEY` (simplest).
//   • Vertex AI         — `GOOGLE_GENAI_USE_VERTEXAI=true` + ADC.
//
// Gemini Live wants PCM 16-bit 16 kHz mono on the input side and emits
// PCM 16-bit 24 kHz mono on the output side. DialStack speaks μ-law 8 kHz,
// so the format conversion lives here in the provider rather than leaking
// into the session glue.
//
// Reference: https://ai.google.dev/gemini-api/docs/live

import { EventEmitter } from 'node:events';
import { GoogleGenAI, Modality } from '@google/genai';
import type { LiveServerMessage, Session } from '@google/genai';
import {
  bufferToPcm16,
  downsample24kTo8k,
  pcm16ToBuffer,
  upsample8kTo16k,
} from '../audio/resample.js';
import { mulawToPcm16, pcm16ToMulaw } from '../audio/mulaw.js';
import { logger } from '../logger.js';
import type { VoiceProvider } from './provider.js';

const DEFAULT_AI_STUDIO_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';
const DEFAULT_VERTEX_MODEL = 'gemini-live-2.5-flash-native-audio';
const DEFAULT_SYSTEM_PROMPT =
  'You are a friendly receptionist answering a phone call. Keep replies short and natural.';

export interface GeminiOptions {
  /** Optional override; defaults to env. */
  model?: string;
  /** Optional override; defaults to env or a sensible canned prompt. */
  systemPrompt?: string;
}

export class GeminiProvider extends EventEmitter implements VoiceProvider {
  private session?: Session;
  private log = logger.child({ provider: 'gemini' });

  constructor(private readonly opts: GeminiOptions = {}) {
    super();
  }

  async connect(): Promise<void> {
    const ai = buildGenAI();
    const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';
    const model =
      this.opts.model ??
      process.env.GEMINI_MODEL ??
      (useVertex ? DEFAULT_VERTEX_MODEL : DEFAULT_AI_STUDIO_MODEL);

    this.log.info({ model, backend: useVertex ? 'vertex' : 'aistudio' }, 'connecting to Gemini');

    const kickoff = process.env.GEMINI_KICKOFF_PROMPT ??
      'A new caller is on the line. Greet them warmly and ask how you can help.';

    this.session = await ai.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: {
          parts: [
            { text: this.opts.systemPrompt ?? process.env.GEMINI_SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT },
          ],
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onopen: () => this.log.debug('Gemini live socket open'),
        onmessage: (msg) => this.handleMessage(msg),
        onerror: (err) => {
          this.log.error({ err }, 'Gemini live error');
          this.emit('error', new Error(String(err.message ?? err)));
        },
        onclose: (ev) => {
          this.log.info({ reason: ev.reason }, 'Gemini live closed');
          this.emit('close', ev.reason);
        },
      },
    });

    // Gemini Live waits for input before speaking. Send a one-shot
    // "kickoff" turn so the agent greets the caller as soon as the call
    // connects (matching ElevenLabs' first-message behaviour).
    this.session.sendClientContent({
      turns: [{ role: 'user', parts: [{ text: kickoff }] }],
      turnComplete: true,
    });
  }

  sendAudio(ulaw: Uint8Array): void {
    if (!this.session) return;
    // μ-law 8 kHz → PCM 16 kHz, which is what Gemini Live expects.
    const pcm16k = upsample8kTo16k(mulawToPcm16(ulaw));
    this.session.sendRealtimeInput({
      audio: {
        data: pcm16ToBuffer(pcm16k).toString('base64'),
        mimeType: 'audio/pcm;rate=16000',
      },
    });
  }

  close(): void {
    this.session?.close();
    this.session = undefined;
  }

  private handleMessage(msg: LiveServerMessage): void {
    if (msg.serverContent?.interrupted) {
      // Same caveat as the ElevenLabs provider: Gemini's barge-in
      // detection treats agent voice leaking from the caller's speaker
      // back into their mic as a real interruption, so flushing the
      // queue here cancels the agent mid-sentence on echo. Log it and
      // trust Gemini to stop sending frames if the interruption was
      // genuine.
      this.log.debug('interruption (advisory; not flushing)');
    }

    // Inbound transcripts: logged only, not forwarded in v1.
    // Gated behind LOG_TRANSCRIPTS=true — transcripts carry PII (caller
    // names, account numbers, addresses) and should not land in a log sink
    // unless explicitly opted in.
    if (process.env.LOG_TRANSCRIPTS === 'true') {
      const inText = msg.serverContent?.inputTranscription?.text;
      if (inText) this.log.debug({ text: inText }, 'caller transcript');
      const outText = msg.serverContent?.outputTranscription?.text;
      if (outText) this.log.debug({ text: outText }, 'agent transcript');
    }

    // Agent audio: PCM 24 kHz inline data → downsample to 8 kHz → encode μ-law.
    const parts = msg.serverContent?.modelTurn?.parts ?? [];
    for (const part of parts) {
      const data = part.inlineData?.data;
      if (!data) continue;
      const pcm24k = bufferToPcm16(Buffer.from(data, 'base64'));
      const pcm8k = downsample24kTo8k(pcm24k);
      this.emit('audio', pcm16ToMulaw(pcm8k));
    }
  }
}

function buildGenAI(): GoogleGenAI {
  if (process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true') {
    const project = required('GOOGLE_CLOUD_PROJECT');
    const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1';
    return new GoogleGenAI({ vertexai: true, project, location });
  }
  return new GoogleGenAI({ apiKey: required('GEMINI_API_KEY') });
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
