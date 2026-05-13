// Common interface implemented by every voice AI backend.
//
// The session glue in `src/session.ts` only ever talks to a `VoiceProvider`,
// so swapping providers is a CLI flag, not a code change.
//
// Audio contract:
//   • `sendAudio(ulaw)` — caller speech as μ-law 8 kHz bytes (DialStack's
//     native wire format).
//   • the `audio` event delivers provider speech in the same format.
//
// Each provider owns any transcoding it needs internally. Providers that
// natively speak μ-law 8 kHz (ElevenLabs Conversational AI) are pure
// pass-throughs; providers that need a different format (Gemini Live wants
// PCM 16 kHz in, PCM 24 kHz out) do the conversion in their own module.
//
// Providers emit `interrupt` when the caller barges in (advisory — callers
// may use this to react, but the provider handles barge-in internally) and
// `close` when the upstream connection terminates.

import { EventEmitter } from 'node:events';

export interface VoiceProviderEvents {
  audio: (ulaw: Uint8Array) => void;
  interrupt: () => void;
  close: (reason?: string) => void;
  error: (err: Error) => void;
}

export interface VoiceProvider extends EventEmitter {
  /** Open the upstream connection. Resolves once the provider is ready to receive audio. */
  connect(): Promise<void>;

  /** Forward a caller audio chunk (μ-law 8 kHz). */
  sendAudio(ulaw: Uint8Array): void;

  /** Tear down the upstream connection. */
  close(): void;

  on<K extends keyof VoiceProviderEvents>(event: K, listener: VoiceProviderEvents[K]): this;
  emit<K extends keyof VoiceProviderEvents>(
    event: K,
    ...args: Parameters<VoiceProviderEvents[K]>
  ): boolean;
}
