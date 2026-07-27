# DialStack basic softphone example

Minimal Next.js softphone built **directly on the headless `@dialstack/sdk/webrtc`
core** — it wires `DialStackPhone` / `Call` by hand and renders its own UI. Mints a
short-lived user session on the server (so your `sk_live_*` key never reaches the
browser), opens the WebRTC signalling WebSocket, and lets you place and receive
calls.

> Looking for the batteries-included UI instead? See
> [`web-softphone-example`](../web-softphone-example), which renders the shared
> React `<Softphone>` component from `@dialstack/sdk/react` — the web sibling of the
> [mobile examples](../mobile). Use this basic example when you want full control of
> the call UI; use the web example when you want the drop-in component.

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
- Team presence (BLF): watch the account's other users and see who's available / on a call

## Setup

```bash
# Build the SDK first — this example reads its built dist/, not the source.
# Run from sdk/examples/basic-softphone-example; --prefix ../.. points at the SDK.
npm install --prefix ../..
npm run build --prefix ../..

cp .env.example .env.local
# Edit .env.local: paste your sk_live_ key and the account id (DIALSTACK_ACCOUNT)
# whose users the picker should list (and optionally an API base URL).
npm install
npm run dev
```

Open <http://localhost:3000>, pick a user from the **Connect as** list, click
**Connect**, then dial an extension or E.164 number. The browser will prompt for
microphone access on the first call.

## Configuration

| Env var                  | Required | Purpose                                                                                                                                                                |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DIALSTACK_API_BASE_URL` | No       | API base URL. Defaults to `https://api.dialstack.ai`.                                                                                                                  |
| `DIALSTACK_SECRET_KEY`   | Yes      | Platform secret key (`sk_live_…`). Used server-side only.                                                                                                              |
| `DIALSTACK_ACCOUNT`      | Yes\*    | Account (`acct_…`) whose users the picker lists. Sent as `DialStack-Account` on the server-side `/api/users` read. \*Only needed with a platform key (the usual case). |

> The `sk_live_…` key is a **live secret**. It is read only in the server-side
> route handlers (`app/api/**`) and never sent to the browser — the browser only
> ever receives a short-lived, per-user session token. A platform key spans many
> accounts, so the account-scoped `/v1/users` read (which backs the picker) needs
> `DialStack-Account` to say which account; the example sends it server-side, so
> the account id never reaches the browser either. This example lists the
> account's users and lets you choose one purely so it's usable without
> hardcoding an id; a real product authenticates its own end-user and mints a
> session for exactly that person on its own backend, never exposing the account
> user list.

## How it picks a user and gets a session token

1. On load, the app calls `GET /api/users` (a route handler that lists
   `GET /v1/users` with the secret key) and shows a picker. A single-user account
   is auto-selected.
2. On **Connect**, `POST /api/session` (with the chosen user id in the body)
   calls `POST $DIALSTACK_API_BASE_URL/v1/user_sessions` with the secret key,
   gets back a short-lived `client_secret`, and hands it to the browser as
   `token`.
3. The browser passes it to `new DialStackPhone({ token, apiBaseUrl, … })`.

### Token refresh

User session tokens are short-lived. The phone is constructed with an
`onTokenExpiring` callback that, shortly before the token expires, re-mints a
session for the selected user via the same `POST /api/session` route and returns
the fresh token. The SDK applies it **in-band over the existing connection** — no
reconnect and no call disruption.

## Team presence (BLF)

Once connected, the softphone calls `phone.listDirectory()`
(`GET /v1/me/directory`) to discover the colleagues it may watch — resolved from
the session token alone, with no account context and no user list supplied by
the backend — then subscribes to their presence over the signalling WebSocket.
The **Team presence** panel shows each one's status (`available` or `on_call`),
updating live as they take and end calls, and re-subscribes on reconnect.

> The push path reports `available` / `on_call` only; it does not emit
> `offline`, so an unregistered user still shows as available. Presence
> subscription accepts at most 100 users at once, so a very large directory is
> watched as a subset.

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
