# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`@dialstack/sdk-native` is versioned independently of the web SDK packages
(`@dialstack/sdk-js`, `-react`, `-webrtc`, `-server`), which release together on
their own line.

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
