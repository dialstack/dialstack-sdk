# DialStack Mobile Softphone example (Expo + react-native-webrtc)

A launchable [Expo](https://expo.dev) app that wraps the **`<Softphone>`**
component (in `../softphone/`) so you can run it on a device/simulator. The
components are the React Native siblings of the SDK's web softphone: they reuse
the SDK's **headless calling core** (`DialStackPhone` / `Call`) plus the shared
call-state hooks (`@dialstack/sdk/react/softphone`), so the only thing that differs
from the web softphone is the rendering layer (React Native views instead of
DOM). Like the web SDK, the connection lives in `<SoftphoneProvider>` and the UI
(`<Softphone>`, or the composable `<DialPad>` / `<IncomingCall>` /
`<OngoingCall>`) subscribes to it.

Layout:

- `sdk/mobile/softphone/` — the reusable softphone components.
- `sdk/mobile/softphone-example/` — this app: the Expo shell that imports it and
  makes it launchable.

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
cd sdk/mobile/softphone-example
npm install

# Generate the native projects (ios/ + android/) with the WebRTC plugin applied.
npm run prebuild

# Build + run a dev client on a simulator/emulator or connected device:
npm run ios       # or: npm run android
```

Then paste your WebRTC token (and optionally the API base URL) on the setup
screen and tap **Connect**.

> `npm install` aligns the native dependency versions; if Expo warns about a
> mismatch, run `npx expo install react-native-webrtc react-native-incall-manager
@react-native-async-storage/async-storage react-native-safe-area-context` to
> let Expo pick versions matching the installed SDK.

## How it consumes the SDK

This app imports the `<Softphone>` component by relative path (`../softphone/src`),
and the component in turn imports the SDK's **source** (not the published `dist/`
bundle) via Metro aliases in `metro.config.js`:

- `@dialstack/sdk/webrtc` → `../../src/webrtc`
- `@dialstack/sdk/react/softphone` → `../../src/react-softphone.ts` (shared call hooks)

That matters because the calling core hides its platform primitives behind a
seam (`sdk/src/webrtc/platform.ts`). Metro's platform-extension resolution picks
**`platform.native.ts`** (backed by `react-native-webrtc`,
`react-native-incall-manager`, and AsyncStorage) instead of the browser
`platform.ts`. The pre-bundled web `dist/` has the browser primitives inlined and
could not be swapped, which is why the example points at source.

A published app outside this monorepo would instead depend on the
`@dialstack/sdk` package; shipping a React-Native-resolvable entry for the core
is a packaging follow-up.

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
