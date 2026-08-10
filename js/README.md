# @dialstack/sdk-js

The DialStack browser SDK — initialization, the REST client, and six
self-registering web components.

Everything a plain HTML or JavaScript page needs. React bindings live in
[`@dialstack/sdk-react`](https://www.npmjs.com/package/@dialstack/sdk-react),
which peers on this package.

## Install

```bash
npm install @dialstack/sdk-js
```

Or from a `<script>` tag, no bundler required:

```html
<script src="https://unpkg.com/@dialstack/sdk-js"></script>
```

The script build exposes everything on `window.DialStack`.

## Usage

```ts
import { loadDialstackAndInitialize } from '@dialstack/sdk-js';

const dialstack = await loadDialstackAndInitialize({
  publishableKey: 'pk_live_…',
  fetchClientSecret: async () => {
    const res = await fetch('/api/dialstack-session', { method: 'POST' });
    return (await res.json()).client_secret;
  },
});
```

```html
<dialstack-call-logs></dialstack-call-logs> <dialstack-voicemails></dialstack-voicemails>
```

## Importing this package registers the elements

That is a side effect, and it is deliberate: the entry point imports each
component module, and each ends in `customElements.define(...)`. So a single
`import '@dialstack/sdk-js'` is what makes `<dialstack-call-logs>` a real element
rather than an inert unknown one.

Two things follow.

**`sideEffects` is an allowlist, not `false`.** A blanket `false` would let a
bundler drop those imports as unused, and the failure is silent —
`document.createElement` succeeds for an unregistered tag and returns an element
that renders nothing, with no error. If you are vendoring or re-bundling this
package, preserve that field.

**Use `./pure` when you do not want the side effect.** Same surface, nothing
registered on import; you call `registerComponents()` yourself. That is what you
want for server-side rendering, for tests, and anywhere a module-level
`customElements.define` would run too early or in the wrong realm.

```ts
import { registerComponents, loadDialstackAndInitialize } from '@dialstack/sdk-js/pure';

if (typeof window !== 'undefined') registerComponents();
```

## Errors

Catch API failures with `isApiError`, not `instanceof ApiError`:

```ts
import { isApiError } from '@dialstack/sdk-js';

try {
  await dialstack.phoneNumbers.list();
} catch (err) {
  if (isApiError(err) && err.status === 409) {
    /* … */
  }
}
```

`instanceof` compares against one specific class object, so it returns false
whenever two copies of this package end up in a tree, or when the error crosses a
realm. `isApiError` reads the fields carried on the error itself and cannot skew.

## Which package do I want?

| You are building              | Install                               |
| ----------------------------- | ------------------------------------- |
| A plain HTML page             | this package alone                    |
| A React app with DialStack UI | this package + `@dialstack/sdk-react` |
| A softphone in any framework  | `@dialstack/sdk-webrtc`               |
| A Node backend                | `@dialstack/sdk-server`               |

## Documentation

Full documentation: <https://docs.dialstack.ai/sdks>

## License

MIT
