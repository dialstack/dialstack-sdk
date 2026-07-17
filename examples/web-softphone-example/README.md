# DialStack web softphone example

A minimal Next.js app that renders the SDK's batteries-included **`<Softphone>`**
component from `@dialstack/sdk/react` — the web sibling of the
[mobile examples](../mobile). It mints a short-lived user session on the server
(so your `sk_live_*` key never reaches the browser), hands the token to
`<SoftphoneProvider>`, and the component owns everything else: connecting, the
dial pad, incoming/ongoing call UI, audio, mute/hold/transfer/DTMF, and the E911
flow.

> **This vs. the [basic example](../basic-softphone-example):** the basic example
> wires the headless `@dialstack/sdk/webrtc` core (`DialStackPhone` / `Call`) by
> hand and renders its own UI — use it when you want full control. This example
> drops in the shared component — use it when you want the batteries-included web
> softphone with almost no code.

## Setup

```bash
# Build the SDK first — this example reads its built dist/, not the source.
# Run from sdk/examples/web-softphone-example; --prefix ../.. points at the SDK.
npm install --prefix ../..
npm run build --prefix ../..

cp .env.example .env.local
# Edit .env.local: paste an sk_live_ key and an existing user_*** id.
npm install
npm run dev
```

Open <http://localhost:3000>, click **Connect**, then use the softphone to place
and receive calls. The browser prompts for microphone access on the first call.

## Configuration

| Env var                  | Required | Purpose                                                                               |
| ------------------------ | -------- | ------------------------------------------------------------------------------------- |
| `DIALSTACK_API_BASE_URL` | No       | API base URL. Defaults to `https://api.dialstack.ai`.                                 |
| `DIALSTACK_SECRET_KEY`   | Yes      | Platform secret key (`sk_live_…`). Used server-side only — never sent to the browser. |
| `DIALSTACK_USER_ID`      | Yes      | The user ID this softphone signs in as. Must belong to your platform's account.       |

## How it gets a session token

`POST /api/session` (a Next.js route handler) uses the server SDK to mint the
token:

```ts
import { DialStack } from '@dialstack/sdk/server';

const dialstack = new DialStack(process.env.DIALSTACK_SECRET_KEY, {
  apiUrl: process.env.DIALSTACK_API_BASE_URL,
});
const session = await dialstack.userSessions.create({ user: process.env.DIALSTACK_USER_ID });
// -> { client_secret, expires_at, ... }
```

The route returns `{ token, apiBaseUrl }` to the browser, which passes them to
`<SoftphoneProvider token={token} apiBaseUrl={apiBaseUrl}>`. The user is pinned to
`DIALSTACK_USER_ID` server-side — the request has no `user` field, so the endpoint
can only ever mint a session for the one configured user.

## Which import? (`@dialstack/sdk/react` vs `@dialstack/sdk/react/core`)

Import the web components from **`@dialstack/sdk/react`**:

```tsx
import { SoftphoneProvider, Softphone } from '@dialstack/sdk/react';
```

The neighbouring `@dialstack/sdk/react/core` entry is the DOM-free headless
"brain" (the shared hooks + provider base) that React Native imports — it does
**not** export the web `<Softphone>` UI. For a web app you always want
`@dialstack/sdk/react`.

## A note on a shared token server (and why there isn't one)

A natural question is whether all the examples — web plus the two mobile ones —
should share a single tiny Node server that mints tokens, instead of each app
minting its own.

It's technically easy (one `http.createServer` calling
`dialstack.userSessions.create(...)`), but we deliberately **do not ship one**.
The web example doesn't need it — Next.js already gives it a server side, which is
exactly where token minting belongs. And for the mobile examples the only reason
to want it is reachability: a phone on cellular (or a locked-down Wi-Fi) can't
reach a dev server on your laptop's `localhost`, so the shared server would have
to be **exposed publicly** (e.g. via an `ngrok` / `cloudflared` tunnel) — all
while holding your `sk_live_*` secret key. A publicly reachable, key-holding mint
endpoint is an exposure we don't want to hand out as an example, even pinned to a
single user; doing it responsibly would mean a shared-secret gate, short token
TTLs, and loud "dev-only, never deploy this" framing — more machinery than the
convenience is worth.

So instead:

- **This web app mints its own token** in `/api/session` (shown above) — the same
  server-side pattern a real web app uses.
- **The mobile examples take a pasted token** on their setup screen. In a real
  mobile app, the phone fetches the token from _your_ backend over the public
  internet (an env-configured token-endpoint URL) — the same server-side mint as
  here, just reached over the network rather than from a browser on the same
  machine. That backend is your production API, not a tunnelled dev shim.
