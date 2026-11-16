# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`@dialstack/sdk-native` is versioned independently of the web SDK packages
(`@dialstack/sdk-js`, `-react`, `-webrtc`, `-server`), which release together on
their own line.

## [0.5.0](https://github.com/dialstack/dialstack-sdk/compare/native-v0.4.0...native-v0.5.0) (2026-11-16)

### Features

- The softphone lists the other users in the signed-in user's account, with
  live presence, in its directory. `SoftphoneProvider` takes
  `accountDirectory`, which defaults to on when you pass no `directory`; pass
  both to list the account's users ahead of your entries. Each presence state
  has its own badge, and Do Not Disturb and away are marked.
- The dial pad offers the directory and suggests matching contacts as you
  dial; tapping a suggestion or a directory entry calls it, from the dial pad
  and from Add call.
- The transfer and add-call panels say what the target is, switch with an
  icon button, and show the picked contact as its directory row with live
  presence and a × to change it. The directory search has a search icon and a
  clear button, and closes on a pick.
- Calls are named after the directory contact or account user they reach, and
  numbers in the directory, dial matches and call views are formatted for
  display.
- `listDirectory({ types })` returns typed entries for the account's other
  dialable destinations as well as users: queues, ring groups, voice apps,
  dial plans and shared voicemail boxes. Every entry has an `id`.
  `types: 'all'` asks for every type, and entries of a type this SDK version
  doesn't know are skipped. `listDirectory()` without options is unchanged.
- Calls stay up through a dropped signalling socket. While the phone resumes
  its session, `call.isReconnecting` is true and the call emits
  `reconnecting`, then `reconnected`. Mute and hang-up take effect locally at
  once and reach the server on the resume; hold, resume and transfer throw
  `transport_closed` until the call is back. The softphone shows
  "Reconnecting…" and disables those buttons meanwhile.
- Calls restart ICE by themselves when the network changes under them.
  `SoftphoneProvider` takes `subscribeNetworkChange` (for example with
  `@react-native-community/netinfo`) so a network change is noticed at once,
  and `call.restartIce()` is public for apps that learn of one first.
- `rebindEmergencyAddress(id, { anchor })` binds an emergency address on the
  open connection, keeping calls in progress up, and resolves with the
  verdict. The softphone now binds this way and never drops a call to bind
  E911. `reconnectWithEmergency` is deprecated.
- A blind transfer the far end refuses is reported as a `transfer_failed`
  error and the call stays up; the softphone shows "Transfer failed". Once the
  far end accepts, the call ends as `transferred` while the target may still
  be ringing.

### Bug Fixes

- `call.transfer()` throws `transfer_failed` while an earlier transfer on the
  same call is still unanswered, and a call can transfer again after a
  reconnect lost the answer to its last transfer.
- ICE restarts stay in order and no longer latch, and session resume works
  within the window after a long outage, with its retry backoff capped at 2 s.
  Gathering waits for a complete candidate set unless the far end trickles.
- Re-INVITE handling follows RFC 3261, 6026, 6141 and 8839: target refresh,
  CANCEL on timeout, glare back-off, and ending the call on a 481 or 408.
- The far end putting the call on hold no longer emits `held`; the call stays
  `active`, and `held` reports only a local hold.
- A mute the server lost is resent, a hang-up made during a drop is
  delivered, and a server error for an action of a call that has already
  ended is dropped.
- A denied E911 submit is rejected, and a rebind whose send throws settles.
- Repeated taps on answer, decline, hang up, mute, hold, transfer, merge,
  conference hold and switch are ignored, and a second `placeCall` is dropped
  while one is still being placed.
- The dial pad and keypad fit their keys to the available height, keep their
  proportions as they shrink or the directory opens, and stay still as the
  first digit is typed.
- Feature codes show their leading `*` or `#`.

## [0.4.0](https://github.com/dialstack/dialstack-sdk/compare/native-v0.3.0...native-v0.4.0) (2026-10-26)

### Features

- `SoftphoneProvider` takes a `directory` of `DirectoryContact` entries
  (colleagues, departments or any other destination) that the user can pick
  from instead of typing a number when transferring or adding a call. Each
  entry has a stable `id`, a `label` and a `destination` (anything the number
  field accepts), plus an optional `description`, `group` heading and `tags`,
  shown as chips. The list is searchable by any of those fields, and a
  number-like search matches however it is punctuated. Typing a destination
  still works. Transfer and add call now open in a dial panel that shows the
  picked or typed destination. Pass a new array when the directory changes.
- `listDirectory()` entries carry `extensionNumbers`, the colleague's active
  extensions dialable from this account (empty when they have none).
- The SDK identifies itself to DialStack with a `DialStack-Client` header on
  API requests and the signaling connection, and its User-Agent now carries
  the `sdk-native` version. Pass `appInfo` (a `name` and optional `version`) to
  `createPhone()` or `SoftphoneProvider` to report your application too.

## [0.3.0](https://github.com/dialstack/dialstack-sdk/compare/native-v0.2.1...native-v0.3.0) (2026-10-19)

### Features

- `SoftphoneProvider` takes a `resolvePeer` callback that looks up each call's
  remote party in your own records (for example, the customer behind a caller
  ID). The `name` it returns becomes the call's title in place of the
  caller-ID name or number, and the `avatar` (initials, or an image URL that
  falls back to the initials if it fails to load) is shown wherever the screen
  has room. A `null` result, a rejection or a throw leaves the default
  display. Pass a new function when its answers would change: live calls are
  resolved again, and removing the callback clears resolved peers. `PeerInfo`
  and `ResolvePeer` are exported.
- The softphone has a compact size tier for small hosts (below about
  300×480). It applies to every screen, including the E911 banner, call
  waiting, held calls and transfer actions. The new `layoutVariant` prop pins a
  tier: `'auto'` (default), `'full'` or `'compact'` (`SoftphoneLayoutVariant`).

## [0.2.1](https://github.com/dialstack/dialstack-sdk/compare/native-v0.2.0...native-v0.2.1) (2026-10-12)

### Bug Fixes

- A call that ends while it is being answered no longer takes or keeps the
  microphone, sends an answer, or reports mic and answer errors. ICE
  candidates arriving after a call ends are ignored. An answer that fails on a
  call that is still live is now reported.

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
