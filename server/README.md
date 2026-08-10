# @dialstack/sdk-server

Node.js server client for the DialStack SDK — the REST API, webhook signature
verification and media streams.

> **Never import this from browser code.** It reads your secret key.

- **No runtime dependencies.** One package, nothing transitive. CI fails the build
  if that stops being true.
- **No browser code.** None of the web components, React bindings or the softphone
  are reachable from here, so a backend deployment does not carry them.

## Install

```bash
npm install @dialstack/sdk-server
```

## Usage

```ts
import { DialStack } from '@dialstack/sdk-server';

const dialstack = new DialStack(process.env.DIALSTACK_SECRET_KEY);
const calls = await dialstack.calls.list({ limit: 20 });

// Every list method auto-paginates: await it for the first page envelope, or
// iterate to walk the whole collection.
for await (const call of dialstack.calls.list().autoPagingEach()) {
  console.log(call.id);
}
```

### Webhooks

`webhooks` is a static, so verification needs no client instance and no secret key:

```ts
import { DialStack } from '@dialstack/sdk-server';

const event = DialStack.webhooks.constructEvent(
  rawBody, // string | Buffer
  req.headers['x-dialstack-signature'],
  process.env.DIALSTACK_WEBHOOK_SECRET
);
```

Pass the **raw** body. A framework that parses JSON before you see it re-serializes
with different bytes, and the signature will not match. It throws on a bad
signature or a timestamp outside the tolerance window (300s by default).

## Which package do I want?

| You are building              | Install                                      |
| ----------------------------- | -------------------------------------------- |
| A Node backend                | this package alone                           |
| A plain HTML page             | `@dialstack/sdk-js`                          |
| A React app with DialStack UI | `@dialstack/sdk-js` + `@dialstack/sdk-react` |
| A softphone in any framework  | `@dialstack/sdk-webrtc`                      |

## Types shared with the browser SDK

Some request and response shapes — button templates, device settings — are the
same wire contract the browser SDK describes, so they are defined once in
`@dialstack/sdk-js` and named here in `import type` only. The declaration build
inlines their definitions into this package's own `.d.ts`, so they resolve for you
without installing anything else. That is why `@dialstack/sdk-js` appears in
`devDependencies` and not in `dependencies`.

## Documentation

Full documentation: <https://docs.dialstack.ai/sdks>

## License

MIT
