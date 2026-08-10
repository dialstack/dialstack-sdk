# @dialstack/sdk-react

React components and hooks for the DialStack SDK — call logs, voicemails, call
history, phone numbers, number ordering, AI agent, the dial-plan editor, the
softphone and onboarding.

## Install

```bash
npm install @dialstack/sdk-js @dialstack/sdk-react react react-dom
```

Two of those need explaining.

**`@dialstack/sdk-js`** is a peer, not a dependency, the same way
`@stripe/react-connect-js` peers on `@stripe/connect-js`: you install both, and you
call the initializer yourself. npm 7+ installs a missing peer automatically, so in
practice this is one command.

**`@xyflow/react`** is a peer too, but only the dial-plan editor needs it. Install
it if you import `./dial-plan`:

```bash
npm install @xyflow/react
```

It holds module-level state that must not be duplicated, which is why it resolves
to the one copy your app installs rather than a copy of ours.

You do **not** need to import any stylesheet. Components render into shadow roots
and carry the styles they need.

## One import path per component

Components are **not** exported from the package root. Each has its own subpath:

```tsx
import { DialstackComponentsProvider } from '@dialstack/sdk-react';
import { CallLogs } from '@dialstack/sdk-react/call-logs';
import { Voicemails } from '@dialstack/sdk-react/voicemails';

<DialstackComponentsProvider dialstack={dialstack}>
  <CallLogs />
  <Voicemails userId={userId} />
</DialstackComponentsProvider>;
```

| Subpath                   | Exports                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `@dialstack/sdk-react`    | `DialstackComponentsProvider`, `useDialstack`, `useDialstackComponents`, `useCreateComponent`, `useAppearance`, `useUpdateWithSetter` |
| `./call-logs`             | `CallLogs`                                                                                                                            |
| `./voicemails`            | `Voicemails`                                                                                                                          |
| `./call-history`          | `CallHistory`                                                                                                                         |
| `./phone-numbers`         | `PhoneNumbers`                                                                                                                        |
| `./phone-number-ordering` | `PhoneNumberOrdering`                                                                                                                 |
| `./ai-agent`              | `AIAgent`, the FAQ prefill helpers                                                                                                    |
| `./dial-plan`             | `DialPlan` and its types                                                                                                              |
| `./softphone`             | `SoftphoneProvider`, `Softphone`, the call hooks and UI primitives                                                                    |
| `./onboarding`            | `OnboardingPortal`                                                                                                                    |

**Why not a root barrel.** A barrel re-exporting every component makes the whole
module graph behind it reachable from any single import, so importing one thin
wrapper pulled in the dial-plan editor's `@xyflow/react`, `dagre` and `cmdk`
regardless. Measured: ~144 KB with all three, against ~58 KB for the softphone
alone and ~1.5 KB for an element wrapper when imported directly.
`sideEffects: false` cannot fix that — the code is genuinely reachable, not dead —
and neither does emitting per-module files. Splitting the entry point is the only
thing that works.

Every subpath resolves the same React context, so a provider your app renders is
visible to whatever it wraps.

## The softphone needs no initializer

It is the one component family that authenticates on its own — a short-lived
user-session token over a WebSocket, rather than the instance's client secret over
REST:

```tsx
import { SoftphoneProvider, Softphone } from '@dialstack/sdk-react/softphone';

<SoftphoneProvider token={userSessionToken}>
  <Softphone />
</SoftphoneProvider>;
```

No `loadDialstackAndInitialize`, no `<DialstackComponentsProvider>`. Passing an
instance is optional and only enables live appearance sync. Registration, dialling
and in-call control keep working when the REST API is unreachable, which is
deliberate.

## Everything else needs one

The remaining components read the REST API, so they need an initialized instance
above them — including `DialPlan`, which renders its own canvas rather than a web
component but is the heaviest consumer of the instance in the package.

If a component renders blank, that is what to check first. This package throws a
named error when the elements were never registered, which happens if
`@dialstack/sdk-js` is missing or your bundler dropped its side-effect imports.

## Documentation

Full documentation: <https://docs.dialstack.ai/sdks>

## License

MIT
