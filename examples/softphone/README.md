# DialStack softphone example

Minimal Next.js softphone built on `@dialstack/sdk/webrtc`. Mints a short-lived
user session on the server (so your `sk_live_*` key never reaches the browser),
opens the WebRTC signalling WebSocket, and lets you place and receive calls.

## Features

- Connect / disconnect
- Outbound call with two-way audio
- Inbound call with answer / reject
- Hold / resume
- Mute / unmute
- DTMF

## Setup

```bash
# From the repo root: builds the SDK first.
npm run setup

cd sdk/examples/softphone
cp .env.example .env.local
# Edit .env.local: paste an sk_live_ key and an existing user_*** id.
npm install
npm run dev
```

Open <http://localhost:3000>, click **Connect**, then dial an extension or
E.164 number. The browser will prompt for microphone access on the first call.

## Configuration

| Env var                  | Required | Purpose                                                                         |
| ------------------------ | -------- | ------------------------------------------------------------------------------- |
| `DIALSTACK_API_BASE_URL` | No       | API base URL. Defaults to `https://api.dialstack.ai`.                           |
| `DIALSTACK_SECRET_KEY`   | Yes      | Platform secret key (`sk_live_…`). Used server-side only.                       |
| `DIALSTACK_USER_ID`      | Yes      | The user ID this softphone signs in as. Must belong to your platform's account. |

## How it gets a session token

`POST /api/session` (Next.js route handler) calls
`POST $DIALSTACK_API_BASE_URL/v1/user_sessions` with the secret key, gets back a
short-lived `client_secret`, and hands it to the browser. The browser passes
it to `new DialStackPhone({ token, apiBaseUrl })`.
