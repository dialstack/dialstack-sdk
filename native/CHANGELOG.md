# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`@dialstack/sdk-native` is versioned independently of the web SDK packages
(`@dialstack/sdk-js`, `-react`, `-webrtc`, `-server`), which release together on
their own line.

## [0.2.0](https://github.com/dialstack/dialstack-sdk/compare/native-v0.1.1...native-v0.2.0) (2026-10-05)

### Features

- **OS call UI integration.** `NativeCallBridge` connects the softphone to
  CallKit or Telecom through an `OsCallAdapter` you implement over the OS call
  library of your choice. It reports incoming and outgoing calls to the OS,
  keeps answer, decline, hold and hangup in step between the OS and the app,
  and handles calls that arrive by push (`registerWakeTask` for Android's
  headless task, `appLifecycle`, `RuntimeHold`). `maxOsCalls` caps how many
  calls are reported to the OS (default `1`); further calls ring in-app.
- `createPhone()`, `getPhone()` and `requirePhone()` manage the app's single
  `DialStackPhone`, so a push-woken runtime and the UI share one phone.
- `SoftphoneProvider` accepts `existingPhone`, to adopt that phone and the
  calls already on it, and `bridge`, to place and answer calls through the OS.
  `onIncomingCall` now receives the call's `callId`.
- **Call audio.** `callAudio="host"` leaves ringing, ringback and the audio
  session to the host app (always the case with a `bridge`). Pass
  `audioOutput` to drive the in-call speaker button, and read the current
  route with `useAudioOutput()`.
- `@dialstack/sdk-native/testing` provides `FakeOsCallAdapter`, the
  `runOsCallAdapterContract` suite an adapter must pass, and `FakePhone`,
  `FakeCall` and `FakeLifecycle`.
- The in-call keypad shows the digits you send.
- `nativeSignalingSocket` is exported for apps that construct their own phone.

### Bug Fixes

- Session token refresh now works on React Native.
- More reliable connections: `connect()` waits for a connect already in flight
  instead of throwing, recovers after a disconnect or a lost connection, and
  never uses an expired session token. A failed token fetch shows as a
  connection error.
- The microphone is taken when a call is answered, not while it rings, so
  calls answered through the OS have audio.
- Calls always end, and emit `ended`, when they are hung up, disconnected or
  lost with the connection.
- The emergency address is never changed during a call.
- The softphone screens fit the space their host gives them, from small phones
  to tall layouts, and the dial pad, call screen, incoming card, transfer field
  and emergency banner no longer overlap.

## [0.1.1](https://github.com/dialstack/dialstack-sdk/compare/native-v0.1.0...native-v0.1.1) (2026-09-10)

### Bug Fixes

- the "DTMF is unavailable" warning no longer implies DialStack's
  `react-native-webrtc` fork is the only option — any package implementing
  `RTCRtpSender.dtmf` works

## Unreleased

The first published release. Retitle this section with the version and date
when it is cut — `## [X.Y.Z](compare-link) (YYYY-MM-DD)`, matching the form
`scripts/sdk-release` generates and the publish gate greps for.

### Features

- `SoftphoneProvider` — the headless provider. Wires a DialStack session to the
  React Native WebRTC stack and supplies the two RN-only pieces the shared
  calling core cannot provide itself: an InCallManager-backed outbound ringback
  and a `storage` adapter for emergency-address persistence.
- `<Softphone>` — a batteries-included softphone, plus the composable pieces
  (`<DialPad>`, `<IncomingCall>`, `<OngoingCall>`, `<EmergencyBanner>`) for
  building your own UI.
- `useSoftphone()` exposes `calls`, `incomingCalls`, `activeCall` and
  `actions.callActionsFor(call)`, so a call can be bridged to the platform's own
  call UI (CallKit on iOS, Telecom/ConnectionService on Android).
  `useActiveCall()` and `useIncomingCall()` are narrower conveniences for a
  build-your-own UI.
- Self-contained: no runtime dependency on any other `@dialstack` package. The
  shared calling core is compiled in at build time, so installing this package
  alone is enough.
- React Native peer dependencies are declared here rather than in the web SDK,
  so a web app's dependency graph stays structurally free of React Native.
  `react-native-webrtc` is an optional peer for apps that supply their own
  WebRTC globals.
