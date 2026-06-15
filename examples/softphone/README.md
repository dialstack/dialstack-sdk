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
- Blind transfer
- Attended transfer: consult, then complete or abandon (hang up consult + resume)
- E911: register a per-user emergency address and bind it to the current network

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

## E911 / emergency calling

WebRTC has no fixed street address, so each user registers their own emergency
(E911) address, and the SDK binds it to the network the device is currently on.
**Outbound calls to phone numbers are blocked until a bound emergency address is
present** — internal and inbound calls are unaffected.

In the **Emergency address (E911)** panel (shown once connected):

1. Fill in the civic address and click **Save & bind**. This calls
   `phone.setEmergencyAddress(...)`, which validates the address against the
   carrier database, then reconnects so the address binds to the current network
   (it is presented on the `authenticate` handshake via `emergencyAddressId`).
2. When the SDK emits `network.changed` (the device moved networks), the panel
   shows a **Re-bind** prompt. Re-binding calls
   `phone.clearEmergencyAddressRegisteredIp(id)` and reconnects so 911 routes to
   the device's current location.

The selected address id is persisted by the SDK (localStorage) and reused on the
next connect, so returning users keep their binding.

> Emergency calling depends on an accurate, current address. Treat the binding
> as required before relying on this softphone for 911.
