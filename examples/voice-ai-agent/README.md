# DialStack Voice AI Agent example

A minimal Node/TypeScript example that connects a [DialStack](https://dialstack.ai) phone call to either:

- **[ElevenLabs Conversational AI](https://elevenlabs.io/conversational-ai)**, or
- **[Google Gemini Live](https://ai.google.dev/gemini-api/docs/live)** (via Google AI Studio or Vertex AI).

The provider is selected with a CLI flag at start time. Audio runs both directions over a single WebSocket; we transcode μ-law ⇄ PCM and resample as needed so each provider gets the format it expects.

This is the runnable companion to the [BYO VoiceAI guide](https://docs.dialstack.ai/guides/voiceai-byo).

## What it does

```
Caller ──► DialStack ──webhook──► this server ──► attaches /media WebSocket
                                       │
                                       └──► Voice AI provider (ElevenLabs or Gemini)
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
  - **ElevenLabs**: a Conversational AI agent
  - **Gemini (AI Studio)**: an API key from [aistudio.google.com](https://aistudio.google.com/)
  - **Gemini (Vertex AI)**: a GCP project with the Vertex AI API enabled and Application Default Credentials configured locally (`gcloud auth application-default login`)
- A way to expose your local server publicly during development — [cloudflared](https://github.com/cloudflare/cloudflared) or [ngrok](https://ngrok.com/) both work.

## Setup

```sh
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
```

Then call the DID assigned to your Voice App. You should hear the agent answer; speak back and forth as you would with any voice agent.

## Configuration reference

All settings come from environment variables — see [`.env.example`](./.env.example) for the full list with comments. The non-obvious ones:

| Var                         | Notes                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_URL`                | The HTTPS URL where this server is reachable from the public internet. The webhook handler derives the `wss://.../media` URL from this.                                                         |
| `VOICE_APP_WEBHOOK_SECRET`  | The HMAC secret DialStack uses to sign webhook payloads. Set when you create the Voice App.                                                                                                     |
| `GOOGLE_GENAI_USE_VERTEXAI` | `true` to route Gemini through Vertex AI (requires `GOOGLE_CLOUD_PROJECT` and ADC). Unset or `false` uses the AI Studio API and `GEMINI_API_KEY`.                                               |
| `LOG_TRANSCRIPTS`           | Set to `true` to log caller and agent transcript text at debug level. **Off by default** — transcripts contain PII (names, account numbers, addresses). Only enable in controlled environments. |

## Layout

```
src/
├── index.ts            CLI entry; parses --provider; loads env; starts server
├── server.ts           Express + ws: POST /webhook, WS /media
├── webhook.ts          HMAC verification + POST /v1/calls/{id} attach
├── session.ts          Per-call audio plumbing (μ-law ↔ PCM, resampling, pacing)
├── logger.ts           pino
├── audio/
│   ├── mulaw.ts        μ-law ⇄ PCM16 via alawmulaw
│   └── resample.ts     8k↔16k, 24k→8k linear resampling (dep-free)
└── providers/
    ├── provider.ts     Interface every provider implements
    ├── elevenlabs.ts   ElevenLabs Conversational AI WebSocket
    └── gemini.ts       Google Gemini Live (AI Studio + Vertex)
```

## Provider-specific notes

### ElevenLabs

- The agent's **input audio format** (`asr.user_input_audio_format`) is not API-overridable per call. Set it to `ulaw_8000` in the agent's Voice settings (or via `PATCH /v1/convai/agents/{id}`) so caller audio is true pass-through. If you leave it as `pcm_16000`, the example will resample for you, but you'll get linear-interpolation artefacts in the transcript path.
- The agent's **output audio format** (`tts.agent_output_audio_format`) is also overridable from the dashboard. Setting it to `ulaw_8000` skips a downsample on the way back to the caller. The example also requests `ulaw_8000` per-call via `conversation_config_override`, but ElevenLabs only honours that if the override is allow-listed on the agent.
- ElevenLabs' server-side VAD fires `interruption` events when caller audio overlaps agent audio — including the agent's own voice leaking from the caller's speaker back into the mic. The example **logs but does not flush the queue** on these events; if the interruption is real, ElevenLabs stops sending frames and the queue drains naturally. Flushing on every event cancels the agent mid-sentence on most phones.

### Gemini Live

- Gemini does not have a built-in "first message" — it waits for input before generating. The example sends a one-shot text turn (`GEMINI_KICKOFF_PROMPT`) right after `connect` so the agent greets the caller without them having to speak first.
- The same advisory-interrupt treatment applies as ElevenLabs.
- On Vertex AI, the Live API is region-limited. The current preview model is `gemini-live-2.5-flash-native-audio`; check the Vertex AI Live API docs for your region.

## Audio plumbing notes

- **Pacing**: outbound frames are emitted at exactly 50 frames/sec using a drift-compensated scheduler. A plain `setInterval(_, 20)` actually fires every ~20.8 ms in Node, which drops you to 48 frames/sec; the call leg then fills the gaps with comfort noise on the far end, which you hear as stutters and missing syllables. If you adapt this code, keep the deadline-anchored scheduler in `session.ts`.
- **Format negotiation**: handlers are attached before the upstream WebSocket opens so the `conversation_initiation_metadata` message from ElevenLabs is never raced and dropped.

## Out of scope (intentionally)

- **Tool / function calling.** Both providers support it; wiring it through is a separate concern.
- **Transfer / hand-off.** You can issue another `actions: [{ type: 'transfer', ... }]` update to the call when your agent decides to escalate; see the [Voice Apps guide](https://docs.dialstack.ai/guides/voice-apps).
- **Reconnection / retry.** A real production deployment should handle upstream WebSocket disconnects more gracefully.

## Troubleshooting

- **Webhook returns 400 "invalid signature"** — `VOICE_APP_WEBHOOK_SECRET` doesn't match the one on the Voice App in DialStack. Re-fetch from the dashboard.
- **DialStack opens the media socket but no audio plays** — verify `PUBLIC_URL` is `https://` (not `http://`) and reachable from the internet. Check that you have the `attach` URL printed in the logs.
- **ElevenLabs disconnects immediately** — likely a wrong `ELEVENLABS_AGENT_ID`. The signed-URL request will succeed but the WS will close. Run with `LOG_LEVEL=debug`.
- **Gemini 401 / 403** — for AI Studio, confirm `GEMINI_API_KEY` is set; for Vertex, run `gcloud auth application-default login` and confirm the user/SA has the `Vertex AI User` role on `GOOGLE_CLOUD_PROJECT`.
- **Choppy or stuttering audio** — the example uses simple linear resampling. If you need higher fidelity, swap in `node-libsamplerate` or similar.

## License

MIT — see [LICENSE](./LICENSE).
