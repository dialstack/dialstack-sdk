# @dialstack/sdk-webrtc

Headless WebRTC softphone for the DialStack SDK.

- **No runtime dependencies.** Nothing is installed alongside it, and nothing
  third-party is compiled into it. CI fails the build if that stops being true.
- **No React, no DOM UI.** Use it from vanilla JS, Angular, Vue, Svelte, or any
  framework. React components live in
  [`@dialstack/sdk-react`](https://www.npmjs.com/package/@dialstack/sdk-react).

## Install

```bash
npm install @dialstack/sdk-webrtc
```

That is the whole install: one package, nothing transitive.

## Usage

```ts
import { DialStackPhone } from '@dialstack/sdk-webrtc';

const phone = new DialStackPhone({ token: userSessionToken });
await phone.connect();

phone.on('incoming', (call) => call.accept());

const call = await phone.call('+14155550123');
call.hangup();
```

It authenticates with a short-lived user-session token over a WebSocket, so it
needs no initializer and no publishable key — unlike the REST-backed packages,
which mint a client secret. Your backend issues the token; refresh it from
`onTokenExpiring`.

## Which package do I want?

| You are building              | Install                                      |
| ----------------------------- | -------------------------------------------- |
| A softphone in any framework  | this package alone                           |
| A React app with DialStack UI | `@dialstack/sdk-js` + `@dialstack/sdk-react` |
| A plain HTML page             | `@dialstack/sdk-js`                          |
| A Node backend                | `@dialstack/sdk-server`                      |

`@dialstack/sdk-react` depends on this package at an exact version, so a React
app that also embeds the softphone gets one copy of the phone, not two.

## Building

Plain `tsc`, no bundler — `npm run build`. Unbundled compilation is the point: it
emits one output file per input with imports left intact, so no third-party code
can be inlined and an empty `dependencies` field cannot drift from what the
package actually needs.

Two consequences worth knowing before editing:

- `tsconfig.json` uses `moduleResolution: NodeNext`, so **relative imports in
  `src/` must end in `.js`** (e.g. `from './phone.js'`), naming the emitted
  sibling rather than the `.ts` source. Under `Bundler` resolution the emitted
  `.d.ts` files keep extensionless specifiers, which bundlers tolerate but Node's
  own ESM resolver does not — `attw` reports an internal resolution error for
  `node16` consumers.
- The package is ESM-only. `attw` reports `CJSResolvesToESM` for CommonJS
  consumers, who need a dynamic `import()`; that is expected and is why the rule
  is ignored in `check:package`.

## Documentation

Full documentation: <https://docs.dialstack.ai/sdks>

## License

MIT
