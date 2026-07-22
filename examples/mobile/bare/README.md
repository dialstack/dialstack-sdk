# DialStack Softphone example — bare React Native (no Expo)

A plain [React Native](https://reactnative.dev) app (scaffolded with the React
Native Community CLI, **no Expo**) that renders the SDK's `<Softphone>` from its
single mobile entry point:

```tsx
import { Softphone, SoftphoneProvider } from '@dialstack/sdk-native';
```

## Why this example exists

It's the sibling of the Expo example (`../expo`), and its job is to
prove `@dialstack/sdk-native` works in a **bare** React Native app. Bare Metro
does **not** transpile `node_modules` the way Expo's does, so this app relies on
the SDK's **pre-compiled** builds. The `@dialstack/sdk` core is written to the
standard WebRTC surface; `registerGlobals()` from react-native-webrtc (called in
`index.js`) installs those globals so the core works on RN. There are no
Metro/tsconfig source aliases — the SDK resolves exactly as it would for an app
that ran `npm install @dialstack/sdk`.

> **Foreground calling only** — same scope as the Expo example. Backgrounded /
> locked-screen incoming calls (iOS PushKit + CallKit, Android FCM +
> ConnectionService) are out of scope.

## Prerequisites

- Node 20+.
- **iOS**: Xcode + CocoaPods (≥1.10), an iOS 12.0+ simulator or device (macOS
  only).
- **Android**: Android Studio / SDK, an emulator or device (min API level 24).

## Setup

```bash
# 1. Build the SDK first — this example installs @dialstack/sdk from the built
#    package (dist/), not its source.
npm run build --prefix ../../../          # from sdk/examples/mobile/bare

# 2. Install JS deps (@dialstack/sdk is installed as a copy via install-links;
#    RN peer deps come along).
npm install

# 3. iOS: install pods, then run. (react-native-webrtc is autolinked.)
cd ios && pod install && cd ..
npm run ios          # or: npm run android
```

Paste your WebRTC token (and optionally the API base URL) on the setup screen and
tap **Connect**.

### Required native edits for react-native-webrtc

`react-native-webrtc` is autolinked (RN ≥ 0.60), so the pod/gradle wiring is
automatic — but you must declare permissions and minimum platform versions.
(Source: the library's iOS/Android installation docs.)

**iOS** — in `ios/SoftphoneExampleBare/Info.plist`:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>DialStack needs the microphone to place and receive calls.</string>
```

Ensure `ios/Podfile` targets iOS 12.0 or higher (`platform :ios, '12.0'`).

**Android** — in `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.INTERNET" />
```

Ensure `android/build.gradle` sets `minSdkVersion = 24` (or higher).

## Storage (required)

`<SoftphoneProvider>` requires a `storage` prop — a `PlatformStorage` adapter for
persisting the selected E911 address id across launches. The SDK takes no
persistence dependency of its own, so the host supplies one. This example ships
an AsyncStorage-backed adapter, [`asyncStorageAdapter.ts`](./asyncStorageAdapter.ts)
— AsyncStorage is async while the core reads synchronously, so the adapter keeps
a small in-memory cache the softphone can read from synchronously. The Expo
example ships an MMKV one instead; any store implementing
`getItem`/`setItem`/`removeItem` works.

```tsx
import { asyncStorageAdapter } from './asyncStorageAdapter';
<SoftphoneProvider token={token} storage={asyncStorageAdapter}>
  …
</SoftphoneProvider>;
```

## E911 location (manual entry)

The emergency-address form is manual-entry in this example. To offer a "Use my
current location" autofill button, pass a `locationProvider` to
`<SoftphoneProvider>` — a function that requests location permission, gets the
device position, reverse-geocodes it, and returns an `EmergencyAddressInput`.
Wire it with `@react-native-community/geolocation` (plus a reverse-geocode
service) and the iOS/Android location permissions; the Expo example
(`../expo`) shows the shape using `expo-location`.

## Skipping the setup screen during development

Create a git-ignored `dev-session.local.json` next to `App.tsx` to prefill the
token:

```json
{
  "token": "<webrtc token>",
  "apiBaseUrl": "https://api.dev.dialstack.ai",
  "autoConnect": true
}
```

## How it consumes the SDK

Identical model to the Expo example: `@dialstack/sdk-native` (and its
`@dialstack/sdk` core dependency) pinned `file:` and installed as copies via
`install-links` in `.npmrc`. The core resolves through the package's standard
`exports`; `registerGlobals()` (in `index.js`) installs react-native-webrtc's
globals so the core's WebRTC calls work. Nothing app-specific is wired into
`metro.config.js` or `tsconfig.json`.
