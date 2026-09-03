# @dialstack/sdk-native

The React Native softphone components for the DialStack SDK — a headless
`SoftphoneProvider`, a batteries-included `<Softphone>`, and the composable
pieces (`<DialPad>` / `<IncomingCall>` / `<OngoingCall>`).

```tsx
import { Softphone, SoftphoneProvider } from '@dialstack/sdk-native';
```

## Why a separate package (not `@dialstack/sdk/native`)

This is a distinct package from `@dialstack/sdk` **on purpose**: it declares the
React Native peer dependencies. Keeping them here means the web SDK's dependency
graph is _structurally_ free of anything React Native — a web app that installs
`@dialstack/sdk` can never pull `react-native-webrtc`/`-svg`/`-incall-manager`.

`@dialstack/sdk-native` is self-contained: it inlines its own compiled copy of
the shared headless calling core and call-state hooks at build time, so it has
**no runtime dependency on `@dialstack/sdk`** (the core is authored once in that
package and shared at build time only). The core is written to the standard
browser WebRTC surface (`RTCPeerConnection`, `MediaStream`, `navigator.mediaDevices`);
call `registerGlobals()` from your WebRTC package at your app's entry point so
that surface exists on React Native before the SDK runs. The two RN-only gaps —
outbound ringback audio and E911 persistence — are supplied by the softphone
provider (an InCallManager-backed ringback and your `storage` adapter).

```js
// index.js — before anything imports the SDK
import { registerGlobals } from 'react-native-webrtc';
registerGlobals();
```

## Install

```sh
npm install @dialstack/sdk-native \
  'github:dialstack/react-native-webrtc#7e9a0eb55e068b2ba452f22e02e4b789aff9e4ed' \
  react-native-incall-manager react-native-svg libphonenumber-js
```

These are **peer dependencies** — install the versions that match your app.

**Install exactly one WebRTC package.** Two of them autolink two copies of the
native library and the Android build fails with `Duplicate class org.webrtc.*`.

We recommend DialStack's fork at the pinned commit above: it is the only build
that bridges DTMF (see below). If your app already ships a different WebRTC
package — LiveKit's, Stream's, or stock `react-native-webrtc` — keep that one
instead and skip ours. The SDK never imports a WebRTC package; it reads the
globals `registerGlobals()` installs, so any spec-compliant build works. The
`react-native-webrtc` peer is **optional** precisely so a differently-named
package can satisfy it without npm installing a second copy alongside.

See the example apps under `../mobile/` for a runnable Expo app and a bare React
Native app.

## DTMF

DTMF (RFC 4733 telephone-event over the media path) requires **DialStack's fork
of `react-native-webrtc`**, which adds the `RTCRtpSender.dtmf` bridge that no
published build ships:

```sh
npm install 'github:dialstack/react-native-webrtc#7e9a0eb55e068b2ba452f22e02e4b789aff9e4ed'
```

With any other WebRTC package — including LiveKit's and Stream's forks, neither
of which exposes `RTCRtpSender.dtmf` — `Call.canSendDtmf` is `false`, the in-call
keypad stays hidden, `Call.sendDtmf()` throws `call_failed`, and the SDK logs
`[dialstack] DTMF is unavailable …` on the first call. Calls are otherwise
unaffected, but there is no way to navigate an IVR or phone tree. That is the
tradeoff to weigh if another library forces a particular WebRTC package on you.

## Storage (required)

`<SoftphoneProvider>` requires a `storage` prop — a small `PlatformStorage`
adapter used to persist the selected E911 address id across launches. The SDK
takes **no** persistence dependency of its own (react-native-mmkv and
AsyncStorage vary across versions/architectures and can't be defaulted safely),
so you supply one:

```tsx
import type { PlatformStorage } from '@dialstack/sdk-native';
import { createMMKV } from 'react-native-mmkv';

const mmkv = createMMKV();
const storage: PlatformStorage = {
  getItem: (k) => mmkv.getString(k) ?? null,
  setItem: (k, v) => mmkv.set(k, v),
  removeItem: (k) => mmkv.remove(k),
};

<SoftphoneProvider token={token} storage={storage}>
  <Softphone />
</SoftphoneProvider>;
```

The Expo `../examples/mobile/expo` app ships this MMKV adapter; the bare
`../examples/mobile/bare` app ships an AsyncStorage one. Either works —
`storage` just needs `getItem`/`setItem`/`removeItem`.

## Scope

This package provides the in-app calling surface: the provider, the call state,
and the React Native UI. The operating system's own call experience — the
full-screen incoming call, ringing on a locked screen, and waking the app from a
push — is the integrator's to wire, using the platform frameworks directly (iOS
PushKit + CallKit, Android FCM + Telecom/ConnectionService).

The seams for that are public. `useSoftphone()` exposes `calls`,
`incomingCalls`, `activeCall` and `actions.callActionsFor(call)`, and every
`Call` carries a stable `id` and `state`, so a native call session can be
created, kept in step, and torn down alongside the SDK's own. DialStack stores
no device tokens — delivering the push that wakes your app is yours to arrange.
