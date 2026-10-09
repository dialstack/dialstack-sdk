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
// natively speak μ-law 8 kHz (ElevenLabs agents set to μ-law) are pure
// pass-throughs; providers that need a different format (Gemini Live wants
// PCM 16 kHz in, PCM 24 kHz out) do the conversion in their own module.
//
// Providers emit `interrupt` when the caller barges in; the session then
// drops any agent audio still queued for the caller. Providers whose
// barge-in signal also fires on echo (Gemini) don't emit it.
// `close` fires when the upstream connection terminates. Providers that let
// the agent ask for a human (ElevenLabs, via a client tool) emit `transfer`;
// the session then issues a DialStack `transfer` action on the call.

import { EventEmitter } from 'node:events';

/** What DialStack told us about the call, for providers that pass it to the agent. */
export interface CallInfo {
  callId: string;
  accountId: string;
  /** From the verified `call.received` webhook. */
  fromNumber?: string;
  toNumber?: string;
}

export interface VoiceProviderEvents {
  audio: (ulaw: Uint8Array) => void;
  interrupt: () => void;
  /** `done` reports whether DialStack accepted the transfer, so the agent can tell the caller. */
  transfer: (done: (err?: Error) => void) => void;
  close: (reason?: string) => void;
  error: (err: Error) => void;
}

export interface VoiceProvider extends EventEmitter {
  /** Open the upstream connection. Resolves once the provider is ready to receive audio. */
  connect(call: CallInfo): Promise<void>;

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
