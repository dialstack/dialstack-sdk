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
// the agent ask for a human (Telnyx, ElevenLabs and OpenAI, via a tool named
// `transfer_to_human`) emit `transfer`; the session then transfers the call.
// Telnyx, ElevenLabs and OpenAI also emit `transcript` turns and `tool` for
// their other client tools. Telnyx, ElevenLabs and OpenAI accept text turns
// (`sendText`), which a warm transfer needs to brief the person who
// answers and to hand the caller back afterwards.

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
  /**
   * The agent's `transfer_to_human` tool call, with its arguments. `done`
   * reports whether DialStack accepted the transfer, so the agent can tell the caller.
   */
  transfer: (args: Record<string, unknown>, done: (err?: Error) => void) => void;
  /**
   * Any other client-side tool the agent called, with its arguments. `reply`
   * sends the tool's result back to the agent. The Telnyx, ElevenLabs and OpenAI
   * providers emit it; with no listener, the tool call is refused.
   */
  tool: (
    name: string,
    args: Record<string, unknown>,
    reply: (output: Record<string, unknown>) => void
  ) => void;
  /**
   * A finished turn: what the caller said, or what the agent said. The
   * Telnyx, ElevenLabs and OpenAI providers emit it. Turns come in arrival order, not conversation
   * order: a caller's transcription can land after the agent's reply to it.
   */
  transcript: (role: 'caller' | 'agent', text: string) => void;
  close: (reason?: string) => void;
  error: (err: Error) => void;
}

export interface VoiceProvider extends EventEmitter {
  /** Open the upstream connection. Resolves once the provider is ready to receive audio. */
  connect(call: CallInfo): Promise<void>;

  /** Forward a caller audio chunk (μ-law 8 kHz). */
  sendAudio(ulaw: Uint8Array): void;

  /**
   * Add a user text turn the agent answers as it would a spoken one. Telnyx,
   * ElevenLabs and OpenAI Realtime implement it; Gemini does not yet.
   */
  sendText?(text: string): void;

  /** Tear down the upstream connection. */
  close(): void;

  on<K extends keyof VoiceProviderEvents>(event: K, listener: VoiceProviderEvents[K]): this;
  emit<K extends keyof VoiceProviderEvents>(
    event: K,
    ...args: Parameters<VoiceProviderEvents[K]>
  ): boolean;
}
