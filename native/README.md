# @dialstack/sdk-native

The React Native softphone components for the DialStack SDK — a headless
`SoftphoneProvider`, a batteries-included `<Softphone>`, and the composable
pieces (`<DialPad>` / `<IncomingCall>` / `<OngoingCall>`).

```tsx
import { Softphone, SoftphoneProvider } from '@dialstack/sdk-native';
```

## Why a separate package (not `@dialstack/sdk/native`)

This is a distinct package from `@dialstack/sdk` **on purpose**: it carries the
React Native peer dependencies. Keeping them here means the web SDK's dependency
graph is _structurally_ free of anything React Native — a web app that installs
`@dialstack/sdk` can never pull `react-native-webrtc`/`-svg`/`-incall-manager`,
and there's no `optional: true` peer flag to remember or accidentally drop.

`@dialstack/sdk-native` depends on `@dialstack/sdk` for the shared headless
calling core and call-state hooks. The core is written to the standard browser
WebRTC surface (`RTCPeerConnection`, `MediaStream`, `navigator.mediaDevices`);
call `registerGlobals()` from `react-native-webrtc` at your app's entry point so
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
npm install @dialstack/sdk-native @dialstack/sdk \
  react-native-webrtc react-native-incall-manager react-native-svg \
  libphonenumber-js
```

The React Native libraries are **peer dependencies** — install the versions that
match your app (and its architecture). See the example apps under
`../mobile/` for a runnable Expo app and a bare React Native app.

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

Foreground calling only. Backgrounded / locked-screen incoming calls (iOS PushKit

- CallKit, Android FCM + ConnectionService) are out of scope.
