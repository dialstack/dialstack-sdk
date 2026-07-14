# DialStack Mobile Softphone example (Expo + react-native-webrtc)

A launchable [Expo](https://expo.dev) app that renders the SDK's **`<Softphone>`**
from `@dialstack/sdk/native` so you can run it on a device/simulator. The React
Native softphone lives inside the SDK (the RN sibling of the web softphone): it
reuses the SDK's **headless calling core** (`DialStackPhone` / `Call`) plus the
shared call-state hooks, so the only thing that differs from the web softphone is
the rendering layer (React Native views instead of DOM). Like the web SDK, the
connection lives in `<SoftphoneProvider>` and the UI (`<Softphone>`, or the
composable `<DialPad>` / `<IncomingCall>` / `<OngoingCall>`) subscribes to it.

This app is just the Expo shell that imports `@dialstack/sdk/native` and makes it
launchable — see [How it consumes the SDK](#how-it-consumes-the-sdk).

> **Foreground calling only.** This example covers placing, receiving, and
> controlling calls while the app is in the foreground. Backgrounded /
> locked-screen incoming calls are intentionally **out of scope** — see
> [Out of scope](#out-of-scope) below.

## Why a custom dev client (not Expo Go)

`react-native-webrtc` ships native code, so it **cannot run in Expo Go**. You
must build a custom dev client (or a release build) via `expo prebuild` +
`expo run:*`. Native configuration (permissions, the WebRTC pods/gradle) is
applied automatically by the [`@config-plugins/react-native-webrtc`](https://github.com/expo/config-plugins/tree/main/packages/react-native-webrtc)
config plugin, wired up in `app.json`.

## Prerequisites

- Node 20+, and the platform toolchains you intend to target:
  - **iOS**: Xcode + CocoaPods (macOS only), a simulator or device.
  - **Android**: Android Studio / SDK, an emulator or device.
- A DialStack **WebRTC user token** to connect with. In a real app your backend
  mints this (see the web example's `/api/session`); here you paste it into the
  setup screen.

## Setup

```bash
# 1. Build the SDK first. The example installs @dialstack/sdk from the built
#    package (dist/), NOT its source — so dist/ must exist and be current.
npm run build --prefix ../../../   # from sdk/examples/mobile/expo

# 2. Install the example's dependencies (pulls in @dialstack/sdk via a file:
#    specifier, plus the RN peer deps).
cd sdk/examples/mobile/expo
npm install

# 3. Generate the native projects (ios/ + android/) with the WebRTC plugin applied.
npm run prebuild

# 4. Build + run a dev client on a simulator/emulator or connected device:
npm run ios       # or: npm run android
```

Then paste your WebRTC token (and optionally the API base URL) on the setup
screen and tap **Connect**.

> `npm install` aligns the native dependency versions; if Expo warns about a
> mismatch, run `npx expo install react-native-webrtc react-native-incall-manager
@react-native-async-storage/async-storage react-native-safe-area-context` to
> let Expo pick versions matching the installed SDK.

## How it consumes the SDK

This app depends on a **single package** — `@dialstack/sdk` — and imports the
React Native softphone from its mobile entry point:

```tsx
import { Softphone, SoftphoneProvider } from '@dialstack/sdk/native';
```

There are **no source aliases** in `metro.config.js` or `tsconfig.json`; the app
resolves the SDK exactly as an app outside this repo would. `@dialstack/sdk` is
pinned with a `file:../../` specifier and installed as a **copy** (via
`install-links` in `.npmrc`), just like an `npm install @dialstack/sdk` would
land it in `node_modules`.

The calling core hides its platform primitives behind a seam (`platform.ts` on
web, `platform.native.ts` on RN). The SDK exposes a **`react-native` export
condition** on `@dialstack/sdk/native` (and `/webrtc`, `/react/softphone`) that
points at a per-file native build (`dist/native/`), compiled with `tsc` so
`platform.native.js` survives as a separate file — Metro's platform-extension
resolution then picks the React Native primitives (`react-native-webrtc`,
`react-native-incall-manager`) instead of the browser ones. Persistence is not
one of them: the SDK takes no storage dependency and the host injects it (see
[Storage](#storage-required)). That's why this example works without reaching
into SDK source, and why the SDK must be built (step 1) before installing.

## Storage (required)

`<SoftphoneProvider>` requires a `storage` prop — a small `PlatformStorage`
adapter used to persist the selected E911 address id across launches. The SDK
takes **no** persistence dependency of its own (react-native-mmkv and
AsyncStorage vary across versions/architectures and can't be defaulted safely),
so the host brings one. This example ships an MMKV-backed reference adapter,
[`mmkvStorage.ts`](./mmkvStorage.ts) (`react-native-mmkv` v4 — synchronous, so no
cache needed; it's a Nitro module, hence `react-native-nitro-modules` and the New
Architecture, enabled in `app.json`). The bare example ships an AsyncStorage one;
any store implementing `getItem`/`setItem`/`removeItem` works.

```tsx
import { mmkvStorage } from './mmkvStorage';
<SoftphoneProvider token={token} storage={mmkvStorage}>
  …
</SoftphoneProvider>;
```

## Audio & permissions

- **Microphone**: requested on launch (Android `RECORD_AUDIO`; iOS via the first
  `getUserMedia`, with `NSMicrophoneUsageDescription` set in `app.json`).
- **Playback / routing**: `react-native-webrtc` routes the remote audio
  automatically once the track is attached to the peer connection — there is no
  `<audio>` element. `react-native-incall-manager` owns the audio session while a
  call is up; the native ringback (outbound) is also InCallManager-backed.

## Known limitations

- **DTMF**: `react-native-webrtc` (locked at 124.0.7) exposes no `RTCDTMFSender`,
  so DTMF cannot be sent on native. The softphone detects this via
  `Call.canSendDtmf` (false when the sender has no `.dtmf`) and hides the in-call
  keypad control entirely on native; web keeps it. A direct `call.sendDtmf()`
  call throws `call_failed`. Sending DTMF on native needs a server-side
  signaling path (tracked follow-up).

## Out of scope

Backgrounded / locked-screen **incoming** calls need native call UI plus a push
wake-up path, which is a separate, larger integration:

- **iOS**: PushKit (VoIP push) + CallKit.
- **Android**: FCM high-priority data messages + ConnectionService (+ a
  foreground service).

TODO: add VoIP-push + native call UI for backgrounded incoming calls. This
example deliberately handles **foreground calling** end to end only.
