# DialStack Voice AI Agent example

A minimal Node/TypeScript example that connects a [DialStack](https://dialstack.ai) phone call to either:

- **[ElevenLabs Conversational AI](https://elevenlabs.io/conversational-ai)**, or
- **[Google Gemini Live](https://ai.google.dev/gemini-api/docs/live)** (via Google AI Studio or Vertex AI), or
- **[OpenAI Realtime](https://developers.openai.com/api/docs/guides/realtime)** (G.711 μ-law end to end — no transcoding).
- **[Telnyx AI Assistants](https://developers.telnyx.com/api-reference/websockets/talk-to-an-ai-assistant-over-websocket)** (over Telnyx's conversation WebSocket — no Telnyx number or SIP needed).

The provider is selected with a CLI flag at start time. Audio runs both directions over a single WebSocket; we transcode μ-law ⇄ PCM and resample as needed so each provider gets the format it expects.

This is the runnable companion to the [BYO VoiceAI guide](https://docs.dialstack.ai/guides/voiceai-byo).

## What it does

```
Caller ──► DialStack ──webhook──► this server ──► attaches /media WebSocket
                                       │
                                       └──► Voice AI provider (ElevenLabs, Gemini, OpenAI or Telnyx)
```

1. A Voice App routes the inbound call to your server and DialStack POSTs `call.received` to `/webhook`.
2. The handler verifies the HMAC signature and calls `POST /v1/calls/{id}` with an `attach` action that points at `wss://<your-host>/media`.
3. DialStack opens the media WebSocket. Audio frames flow in (μ-law 8 kHz, ~20 ms each).
4. The example decodes μ-law → PCM, resamples to the provider's input rate (16 kHz), and forwards each frame.
5. The provider streams PCM audio back; the example resamples to 8 kHz, re-encodes μ-law, and writes it back to the call at a 20 ms pace.

## Prerequisites

- Node.js 20+ (`nvm use`)
- A DialStack account with:
  - An API key
  - A Voice App with a webhook URL pointing at this server (we'll set this up once you have a public URL)
- An account on the AI provider(s) you want to use:
  - **ElevenLabs**: a Conversational AI agent and an API key with **write** access to Agents (`convai_write`; a read-only key can't fetch a signed URL)
  - **Gemini (AI Studio)**: an API key from [aistudio.google.com](https://aistudio.google.com/)
  - **OpenAI**: an API key with Realtime API access from [platform.openai.com](https://platform.openai.com/)
  - **Telnyx**: an AI Assistant and an API v2 key from the Telnyx Mission Control portal
  - **Gemini (Vertex AI)**: a GCP project with the Vertex AI API enabled and Application Default Credentials configured locally (`gcloud auth application-default login`)
- A way to expose your local server publicly during development — [cloudflared](https://github.com/cloudflare/cloudflared) or [ngrok](https://ngrok.com/) both work.

## Setup

```sh
npm run build --prefix ../..   # builds the local @dialstack/sdk-server this example links
npm install
cp .env.example .env
# edit .env — fill in the keys for whichever provider you plan to use
```

Expose your local port with a public HTTPS tunnel:

```sh
cloudflared tunnel --url http://localhost:8080
# (or: ngrok http 8080)
# copy the https:// forwarding URL into PUBLIC_URL in .env
```

Create a Voice App in DialStack pointed at `https://<your-ngrok>/webhook`. (Either via the dashboard or `POST /v1/voice-apps` — see the [Voice Apps guide](https://docs.dialstack.ai/guides/voice-apps).) Assign that Voice App to a DID or dial plan node so inbound calls land on it.

## Run

```sh
# ElevenLabs
npm run dev -- --provider elevenlabs

# Gemini Live (Google AI Studio)
npm run dev -- --provider gemini

# Gemini Live (Vertex AI)
GOOGLE_GENAI_USE_VERTEXAI=true npm run dev -- --provider gemini

# OpenAI Realtime
npm run dev -- --provider openai
# Telnyx AI Assistant
npm run dev -- --provider telnyx
```

Then call the DID assigned to your Voice App. You should hear the agent answer; speak back and forth as you would with any voice agent.

## Configuration reference

All settings come from environment variables — see [`.env.example`](./.env.example) for the full list with comments. The non-obvious ones:

| Var                         | Notes                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_URL`                | The HTTPS URL where this server is reachable from the public internet. The webhook handler derives the `wss://.../media` URL from this.                                                                             |
| `VOICE_APP_WEBHOOK_SECRET`  | The HMAC secret DialStack uses to sign webhook payloads. Set when you create the Voice App.                                                                                                                         |
| `GOOGLE_GENAI_USE_VERTEXAI` | `true` to route Gemini through Vertex AI (requires `GOOGLE_CLOUD_PROJECT` and ADC). Unset or `false` uses the AI Studio API and `GEMINI_API_KEY`.                                                                   |
| `TRANSFER_TARGET`           | Where to transfer the caller when an ElevenLabs agent or Telnyx assistant calls its `transfer_to_human` client tool: an extension, an E.164 number or a `sip:` URI. Unset, the tool call is answered with an error. |
| `LOG_TRANSCRIPTS`           | Set to `true` to log caller and agent transcript text at debug level. **Off by default** — transcripts contain PII (names, account numbers, addresses). Only enable in controlled environments.                     |

## Layout

```
src/
├── index.ts            CLI entry; parses --provider; loads env; starts server
├── server.ts           Express + ws: POST /webhook, WS /media
├── webhook.ts          HMAC verification + POST /v1/calls/{id} attach / transfer
├── calls.ts            Calls attached by a verified webhook; gates /media sessions
├── session.ts          Per-call audio plumbing (μ-law ↔ PCM, resampling, pacing)
├── logger.ts           pino
├── audio/
│   ├── mulaw.ts        μ-law ⇄ PCM16 via alawmulaw
│   └── resample.ts     8k↔16k, 24k→8k, any→8k linear resampling (dep-free)
└── providers/
    ├── provider.ts     Interface every provider implements
    ├── elevenlabs.ts   ElevenLabs Conversational AI WebSocket
    ├── gemini.ts       Google Gemini Live (AI Studio + Vertex)
    ├── openai.ts       OpenAI Realtime WebSocket
    └── telnyx.ts       Telnyx AI Assistant conversation WebSocket
```

## Provider-specific notes

### ElevenLabs

- Set both audio formats on the agent to **μ-law 8000 Hz**: the input format (`asr.user_input_audio_format`) and the output format (`tts.agent_output_audio_format`). Neither is a per-conversation override, so the example sends no override and needs none enabled. It reads the formats from `conversation_initiation_metadata`: `ulaw_8000` is passed through, `pcm_16000` is transcoded, and any other format fails the call with an error log.
- On an `interruption` event, ElevenLabs has already abandoned the agent's response, so the example drops the audio still queued for the caller and ignores late audio events of that response (lower `event_id`). If echo on the caller's line triggers interruptions, tune the agent's turn settings in ElevenLabs.
- The caller's and called numbers are sent as the dynamic variables `caller_number` and `called_number`. Reference them in the agent's prompt or first message as `{{caller_number}}`.
- To let the agent hand the caller to a person, add a **client tool** named `transfer_to_human` to the agent. When the agent calls it, the example issues a DialStack `transfer` action to `TRANSFER_TARGET`. It does not use ElevenLabs' own transfer tools, which act on calls ElevenLabs carries itself.
- The connection uses a signed URL fetched with `ELEVENLABS_API_KEY`. A `401` from `get-signed-url` means a bad key or one without `convai_write`, a `404` a bad `ELEVENLABS_AGENT_ID`.

### Gemini Live

- Gemini does not have a built-in "first message" — it waits for input before generating. The example sends a one-shot text turn (`GEMINI_KICKOFF_PROMPT`) right after `connect` so the agent greets the caller without them having to speak first.
- Gemini's `interrupted` flag is logged, not acted on: it also fires on the agent's own voice echoing back, and flushing on it cuts the agent off mid-sentence.
- On Vertex AI, the Live API is region-limited. The current preview model is `gemini-live-2.5-flash-native-audio`; check the Vertex AI Live API docs for your region.

### OpenAI Realtime

- The session is configured with `audio/pcmu` (G.711 μ-law) for input and output, so audio passes through untouched in both directions.
- Model, voice and instructions come from `OPENAI_MODEL` (default `gpt-realtime-2.1`), `OPENAI_VOICE` (default `marin`) and `OPENAI_INSTRUCTIONS`. The voice can't change once the agent has spoken in a session.
- The agent speaks first: the example sends `response.create` as soon as `session.updated` confirms the configuration.
- Barge-in: server VAD with `interrupt_response` cancels the response on OpenAI's side, and `input_audio_buffer.speech_started` drops any agent audio still queued for the caller. The example doesn't send `conversation.item.truncate`, so the model's transcript of an interrupted turn may include words the caller never heard.

### Telnyx

- The example connects with `input_sample_rate=8000`, so caller audio is only μ-law-decoded to PCM16 — no resampling on the way in.
- The output rate is chosen by the assistant's voice, not the client. The example reads it from `session.created` and downsamples to 8 kHz, so changing the voice needs no code change.
- Barge-in: `input_audio_buffer.speech_started` drops any agent audio still queued for the caller. (Gemini's interruption signal also fires on echo, so it is only logged.)
- Greeting, prompt, voice and tools are all configured on the assistant in Telnyx; the example sends no instructions.
- The caller's and called numbers are sent in the first `session.update` as the dynamic variables `caller_number` and `called_number`. Reference them in the assistant's instructions or greeting as `{{caller_number}}`.
- To let the assistant hand the caller to a person, add a **client-side tool** named `transfer_to_human` to the assistant. When the assistant calls it, the example issues a DialStack `transfer` action to `TRANSFER_TARGET`.

## Audio plumbing notes

- **Pacing**: outbound frames are emitted at exactly 50 frames/sec using a drift-compensated scheduler. A plain `setInterval(_, 20)` actually fires every ~20.8 ms in Node, which drops you to 48 frames/sec; the call leg then fills the gaps with comfort noise on the far end, which you hear as stutters and missing syllables. If you adapt this code, keep the deadline-anchored scheduler in `session.ts`.
- **Barge-in**: when a provider emits `interrupt`, the session drops every agent frame still queued for the caller. Only emit it from a signal you trust not to fire on echo.
- **Format negotiation**: handlers are attached before the upstream WebSocket opens so the `conversation_initiation_metadata` message from ElevenLabs is never raced and dropped.

## Security notes

- `/media` accepts a session only for a call ID this server attached from a signature-verified `call.received` webhook, and takes the account and caller details from that webhook, not from the socket's `begin` message. Without this, anyone who can reach `/media` could open agent sessions on your provider account, or transfer calls with your DialStack key.

## Out of scope (intentionally)

- **Tool / function calling.** Both providers support it; wiring it through is a separate concern.
- **Transfer for the other providers.** Only the ElevenLabs and Telnyx providers map a tool call to a DialStack `transfer`; see the [Voice Apps guide](https://docs.dialstack.ai/guides/voice-apps) to do the same elsewhere.
- **Reconnection / retry.** A real production deployment should handle upstream WebSocket disconnects more gracefully.

## Troubleshooting

- **Webhook returns 400 "invalid signature"** — `VOICE_APP_WEBHOOK_SECRET` doesn't match the one on the Voice App in DialStack. Re-fetch from the dashboard.
- **DialStack opens the media socket but no audio plays** — verify `PUBLIC_URL` is `https://` (not `http://`) and reachable from the internet. Check that you have the `attach` URL printed in the logs.
- **ElevenLabs disconnects immediately** — check the `ElevenLabs WS closed` log line for the close code and reason, and the `unsupported agent audio format` error. Run with `LOG_LEVEL=debug`.
- **OpenAI handshake fails with HTTP 401** — `OPENAI_API_KEY` is wrong or lacks Realtime access. An `error` event right after connect usually means an invalid `OPENAI_MODEL` or `OPENAI_VOICE`; it is logged with its code.
- **Telnyx handshake fails with HTTP 401** — `TELNYX_API_KEY` is wrong or not an API v2 key. HTTP 404 usually means a wrong `TELNYX_ASSISTANT_ID`.
- **Gemini 401 / 403** — for AI Studio, confirm `GEMINI_API_KEY` is set; for Vertex, run `gcloud auth application-default login` and confirm the user/SA has the `Vertex AI User` role on `GOOGLE_CLOUD_PROJECT`.
- **Choppy or stuttering audio** — the example uses simple linear resampling. If you need higher fidelity, swap in `node-libsamplerate` or similar.

## License

MIT — see [LICENSE](./LICENSE).
