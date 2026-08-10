# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0](https://github.com/dialstack/dialstack-sdk/compare/v2.0.0...v2.1.0) (2026-08-10)

### Features

#### Softphone

- **webrtc, react:** audio input and output device selection. The phone
  enumerates the available microphones and speakers as `AudioDeviceList`
  (`inputs` / `outputs` of `AudioDevice`), lets you pin either one, and switches
  the microphone mid-call without dropping the call. A pinned microphone is
  remembered across sessions; asking for the OS default clears the pin rather
  than pinning the device that happens to be default. The React softphone ships
  a device picker in the in-call controls, and re-enumerates once a call grants
  microphone access — device labels are empty until then.

#### Web components

- **js:** the phone-numbers component takes a search bar, filtering the list as
  you type and following the admin portal's search convention.
- **js:** new appearance tokens for control height, input fill, placeholder
  color, and focus-ring offset, so embedded components can be matched to a
  surrounding form more closely.

#### Server SDK

- **server:** park slots. `presence.list` reads the calls currently parked in an
  account — pass `parkSlots: true` for every occupied slot, or `parkSlotNumbers`
  to read specific slots including free ones. A `ParkSlotPresence` carries the
  slot number and its `parked_call` (`null` when free), and a parked call
  reports the caller, who parked it, their extension, when it was parked, when
  it rings back, and whether it is `'parked'` or `'ringing_back'`. Presence
  responses are discriminated by `object`, and a park-slot subscription streams
  slot changes as they happen. A refused presence stream is reported rather than
  retried silently.
- **server:** `admin.users.list` and `admin.users.retrieve` read the people who
  can administer an account in the portal. This is a different population from
  `users.list()` — an account owner typically has no voice user and so appears
  only here — and the two overlap by email address, which `AdminUser.user`
  resolves. Read-only, and expandable with `expand: ['user']`.
- **server:** new resources — `voicemails`, `voicemailGreetings`, `faxes`,
  `devices`, `buttonTemplates`, `hardwareOrders`, `callLogs`, `recordings`, and
  `listeners`.
- **server:** account subscription-agreement retrieval and acceptance. Read the
  agreement in effect and its acceptance state, and record an acceptance with
  the pricing it was agreed against.
- **server:** `expand[]` is supported on voice apps, dial plans, ring groups,
  queues, and AI agents, and forwarded along with `search` on `users.list` and
  `users.retrieve`.
- **server:** `accounts.create` takes an `address`, which becomes the account's
  main location — the default location for emergency calling and for tax and fee
  jurisdiction. `billing_address` is deprecated in its favor but still accepted;
  exactly one of the two is required, enforced in the types so omitting both or
  sending both is a compile error rather than a rejected request.

### Bug Fixes

#### Softphone

- **webrtc:** a locked microphone — held by another application — is reported
  separately from a missing one, instead of both surfacing as "no microphone".
- **webrtc:** a microphone the live call rejects is no longer persisted as the
  saved device, so a failed switch doesn't carry into the next call.
- **webrtc:** an explicit device switch is requested with `exact`, so asking for
  a specific microphone either gets that microphone or fails, rather than
  silently capturing a different one.
- **webrtc:** speaker "system default" and mid-call microphone switching now
  work as documented.
- **webrtc:** the browser's inability to enumerate audio devices is surfaced to
  the user rather than presenting an empty picker.
- **webrtc:** early media is skipped on stacks without `pranswer` support, and
  support is probed at connect time in the correct signaling state. A missing
  WebRTC stack is treated as inconclusive rather than unsupported.
- **react:** the in-call controls wrap onto two rows so the device picker fits
  alongside the native controls.

#### Server SDK

- **server:** `page` is reachable on every paginated list, `extensions.list`
  paginates, and `limit=0` is no longer dropped.
- **server:** errors carry the code and message from the API's error body
  instead of a generic message.
- **server:** `Voicemail.call` is typed as always present rather than optional —
  it is `null`, not absent, for a voicemail with no resolvable call.
- **server:** `calls.list` filters on the supported `did` (the phone number's
  id) rather than the unsupported `endpoint_id`.
- **server:** device and button types are declared from the API spec rather than
  reused from the browser models, so the server surface no longer carries the
  browser models' deprecated `*_id` aliases.
- **server:** `devices.list` no longer advertises a `button_template` expansion
  it does not support.

## [2.0.0](https://github.com/dialstack/dialstack-sdk/compare/v1.2.0...v2.0.0) (2026-07-31)

### Breaking changes

- **server:** `accounts.create` now requires `email` (the account owner's email),
  `primary_contact_name`, `billing_address`, and `pricing`. Calls that omitted any
  of them are rejected. `primary_contact_name` is also emitted on the account
  object.
- **server:** the rates on `AccountPricing` (`per_user_rate`, `per_did_rate`,
  `per_voiceai_location_rate`) are no longer nullable — they are always present on
  a retrieved pricing singleton. Writes are range-checked; a rate outside the
  permitted range is rejected and the API error names the accepted range.
- **server:** `account_role` is removed from the user wire and from
  `OnboardingUser`. It is no longer emitted or typed, so code branching on it must
  be reworked; the built-in onboarding team list no longer renders a role badge.
- the `users.endpoints` resource (`list` / `update`) and the `OnboardingEndpoint`
  and `UpdateEndpointRequest` types are removed. Endpoints are an internal
  operator resource — manage them through device assignment
  (`devices.assignUsers`) instead.

### Features

#### Softphone

- **react:** React Native softphone, shipped as its own `@dialstack/sdk-native`
  package over a headless call-state core shared with the web softphone. The
  React Native peer libraries are declared as optional peer dependencies, and
  `./components/softphone-theme` and `./components/softphone-icons` are published
  as subpaths for native consumers.
- **react:** multi-call support — call waiting, switching between calls, and
  automatic hold of the call you switch away from. `useCalls` exposes the call
  list with per-call actions, and the web UI stacks incoming calls and offers a
  switchable held-call list.
- **react:** attended transfer — place a consult call, talk to the transfer
  target, then complete or cancel. Consult and original are freely switchable and
  the in-call controls stay available throughout.
- **react:** E911 emergency-address binding in the softphone. The provider binds
  the user's chosen dispatchable address to the network it registers from, prompts
  when no address is bound, and re-binds when the network changes. The wait for a
  re-bind is capped so a stuck bind fails fast rather than hanging.
- **webrtc:** in-band token refresh — the phone invokes an `onTokenExpiring` host
  callback shortly before the token expires and re-authenticates over the live
  socket, with no reconnect and no dropped call. Forwarded through `useCalls` and
  both providers.
- **webrtc:** stale-session watchdog — an app-layer ping/pong plus a wake probe
  detects a session the network silently dropped (laptop sleep, backgrounded tab)
  and reconnects it.
- **webrtc:** DTMF on React Native, sent as native RTP telephone-events. The
  keypad is capability-gated and hidden where DTMF cannot be sent.
- **react:** incoming-call ringtone in the web softphone, plus live appearance
  theming that matches the other components.
- **react:** call and connection errors surface in the built-in softphone UI, and
  genuine errors are always logged to the console — no opt-in flag. The chip shows
  a generic message while the specific error still reaches your `onError`.
- **webrtc:** inject the signaling-socket factory and the storage adapter
  (`PhoneOptions.createSignalingSocket` / `storage`) instead of bundling a
  platform implementation, so the React Native build keeps its own User-Agent and
  persistence.
- **webrtc:** the signaling URL is now derived from `apiBaseUrl` (`api.` →
  `webrtc.`) when `signalingBaseUrl` is not given, an explicit base wins over the
  derived default, and `http(s)` bases are upgraded to `ws(s)`.
- **webrtc:** `session_replaced` is handled as a terminal close reason: when a
  newer connection takes over the user's session slot the phone stays closed
  rather than reconnecting into a takeover war. A manual `reconnect()` is still
  allowed. Every other fatal eviction still auto-reconnects.

#### Presence

- **webrtc:** presence subscribe — watch a set of users and receive their status
  live. `presence.subscribe` requires an explicit user list, unknown users come
  back with an unknown status, and a failed subscribe names the users that failed
  instead of reporting a status.
- **webrtc:** resolve the presence watch-list from `GET /v1/me/directory`.
- **server:** `do_not_disturb` on the user resource and on presence — a separate
  axis from `state`, always emitted on responses. A user can be `available` and
  still decline calls.
- **server:** `webrtc` reachability on `UserPresence`, separate from the
  endpoint-agnostic `state`.

#### Calls and call logs

- **server:** pause and resume recording on a live call —
  `calls.pauseRecording()` / `calls.resumeRecording()` — so sensitive audio (a
  card number read aloud) is never captured. Both parties hear a confirmation
  tone.
- **server:** `GET /v1/calls/:id` now also resolves in-progress calls, so a call
  can be retrieved over its whole lifecycle. On a live call `status` and
  `to_number` are null until the call is routed and completed.
- `connected_at` on the call log — when the call was actually connected, as
  distinct from when it started.
- transcript and voicemail sentiment, carrying a magnitude on a -1..1 scale. The
  sentiment badge renders independently of the summary.
- a caller name that merely restates the caller's number is no longer rendered.

#### Accounts, numbers, and provisioning

- **server:** mode-scoped webhook endpoints. An endpoint created with a live key
  receives events from live accounts only; one created with a test key receives
  sandbox events only. The signing `secret` is returned on create only. Endpoints
  are platform-global by default; set the `DialStack-Account` header to manage a
  single account's scoped endpoints, whose events are delivered in addition to the
  platform-global ones.
- **server:** `inbound_routing` on a phone number, `'default' | 'drop'` — `drop`
  deliberately drops inbound calls with no ring and no message, and forces
  `routing_target` to null.
- **server:** `caller_id_prepend` on the phone-number types.
- **server:** `recording_enabled` and `redaction_enabled` on `AccountConfig`.
- **server:** `default_agent_visible` on `AccountConfig`, a tri-state
  account-level override for whether the managed AI agent is offered when creating
  a voice app. Null inherits the platform default.
- **server:** API reference fields drop their `_id` suffixes (`schedule` rather
  than `schedule_id`, `target` rather than `target_id`, and so on). Both keys are
  emitted and accepted during the transition; the `_id` forms are deprecated and
  the unsuffixed name wins when both are sent.
- **server:** `MaterializedButton.source` can now be `'model_default'`, for a
  button the device model gets for free because its hardware has no other way to
  reach the function. It has neither a `template_button` nor an `override`, and a
  device override at the same position shadows or suppresses it.
- **server:** `ButtonCompatibilityReason` can now be `'park_slot_not_provisioned'`.

#### Onboarding

- **react/onboarding:** assign devices to users during onboarding via
  `/v1/devices/:id/users`.
- **react/onboarding:** route numbers before an order or port-in completes, so a
  number is not left unrouted while it is in flight.
- **react/onboarding:** the subscriber-agreement (SSA) gate is variant-aware and
  serves the agreement body from the TOS API as its single source of truth.
  Acceptance is exposed through the account `tos` expand, and a superseded
  acceptance reads as none.
- **react/onboarding:** onboarding can edit the account contact email.

#### Fax

- **server:** received faxes can be attached to the notification email and purged
  from storage, with delete-on-send for outbound. The `fax_notifications` toggles
  collapse into a single `delete_documents`; `attach_pdf` remains as a
  backwards-compatible alias and defaults to false (attach is opt-in). Enabling
  `delete_documents` now requires at least one entry in `recipients` — a received
  fax would otherwise be neither stored nor delivered.

### Bug Fixes

#### Softphone and WebRTC

- **webrtc:** `connect()` and outbound calls now time out, so a wedged session
  fails loudly instead of hanging; in-flight outbound calls settle on
  `disconnect()`, and `connect()` aborts when `disconnect()` lands mid-connect.
- **webrtc:** reconnect backoff is jittered to de-synchronise clients and resets
  on successful auth rather than on socket open. `reconnect()` emits
  `reconnecting` so the connection state transitions.
- **webrtc:** the socket is torn down on a server auth-reject, so a stray
  `authenticated` frame can no longer flip the phone to connected.
- **webrtc:** `hold()` / `resume()` no-op unless the call is in a holdable state,
  and a held call can be transferred.
- **webrtc:** incoming calls are de-duplicated by `call_id`.
- **react:** dial and blind-transfer destinations are sanitized, so a pasted or
  formatted number connects; `placeCall` no-ops surface through `onError`.
- **react:** `onCallEnded` fires once per user-visible call across a transfer.
- **react:** a second inbound call is rejected as busy while a call is active, and
  placing a call over an active one no longer orphans a transfer.
- **react:** the consult is hung up if the transfer original drops mid-dial, and
  unwired on cancel rather than waiting for its `ended`.
- **react:** one call always stays active while answered calls remain; held-call
  cards render above the active call.
- **react:** the call-waiting card is an in-flow banner rather than an overlapping
  overlay, and idle multi-incoming is its own screen rather than a dial-pad
  overlay.
- **react:** autoplay-block is reported from call state rather than the answered
  event, and `audio_playback_blocked` is not surfaced on call teardown.
- **react:** connection-class failures read as "Connection error" rather than
  "Call failed".
- **react:** the transfer input clears after a transfer, the disabled Transfer
  control is greyed out, and Transfer is disabled during a transfer or with two or
  more calls.
- **react:** the dial-pad number is centred on the keypad axis on web and native.
- **react:** the React Native audio session is released on unmount.
- **react:** `usePhone` is exported publicly so the decomposed hook path works,
  and a disconnected phone rejects reads as well as writes.
- **react:** the `useCalls` call list is cleared on phone change during render.

#### E911

- **react:** the E911 address that was actually presented is used to resolve the
  active address and the bound check, rather than the first address in the list,
  and it is latched to the socket's `authenticate` frame.
- **react:** a newly-created address is presented so it binds; an already-anchored
  address is treated as bound with no reconnect; a redundant reconnect is skipped
  when the saved address is already network-bound.
- **react:** binding is no longer marked bound off a stale `registered_ip`.
- **react:** binding state resets on user (token) change, is reconciled when a
  timed-out reconnect later settles, and the loading flag clears on terminal
  connection states so the prompt is not suppressed forever.
- **webrtc:** E911 state codes are normalized to a two-letter code before
  validation.
- **webrtc:** a live primary connection is not torn down when a rebuilt
  registration subscription fails.

#### Numbers, porting, and call logs

- port orders that are approved present as pending rather than active, and the
  transfer date is gated on `submitted_at` rather than status.
- a released number no longer masks a completed re-port, and routing resolves the
  live number rather than a lingering released row.
- order-flow routing applies to ordered numbers rather than completed ones, and
  order/port numbers resolve from a fresh full list so routing persists.
- call logs render defensively for unattributed rows: a labelled number is
  formatted and internal identifiers are withheld, call-party fall-through is
  escaped, the WebRTC address-of-record shape is guarded, and the stored voicemail
  sentinel is localized.
- call routing is hidden for fax numbers in the phone-numbers table.

#### Onboarding

- **react/onboarding:** the portal fails closed when the account fetch fails
  during bootstrap.
- **react/onboarding:** the subscriber-agreement gate is skipped when acceptance
  is not required, no longer clips plan prices in the pricing box, and aligns to
  the top rather than centring.
- **react/onboarding:** primary-DID onboarding is retired, and a retired primary
  number is bypassed after number orders.
- **server:** ownerless accounts converge, and a committed update is no longer
  reported as failed.
- **server:** the unimplemented public `tos_status` filter is dropped; status is
  carried on create and update instead.

## [1.2.0](https://github.com/dialstack/dialstack-sdk/compare/v1.1.0...v1.2.0) (2026-06-22)

### Features

- **server:** user presence API — single-user and bulk reads
- per-DID SMS port-out toggle, configurable after a number is created
- voicemails now reference their originating call (`expand[]=call`)
- **react/onboarding:** in-band subscriber agreement (SSA) acceptance gate at first login
- **react:** route in-progress port/order numbers before the port or order completes
- **webrtc:** local ringback tone on `call.ringing`
- **webrtc:** apply network early media as a JSEP provisional answer (pranswer); ringing on `180` only

### Bug Fixes

- **react/onboarding:** guard port-in eligibility arrays so empty or missing values no longer white-screen onboarding
- **react/onboarding:** fail closed on agreement load and recover from a stale agreement version
- **react:** stop a released DID from masking an active re-port
- invalidate the session and retry once on an API-request auth failure
- **webrtc:** stop the event-stream reconnect loop and wind down the refresh timer on auth give-up

## [1.1.0](https://github.com/dialstack/dialstack-sdk/compare/v1.0.0...v1.1.0) (2026-06-15)

### Features

- expose the upstream API error code on `ApiError`
- expose `transfer_mode` on the AI agent types
- **react:** show "Fax" as a usage in the phone numbers table

### Bug Fixes

- **webrtc:** attach the microphone on inbound answer so the call is not `recvonly`
- **webrtc:** allow attended mode on the call transfer action
- **webrtc:** make `transfer_mode` non-nullable and expose it on server resources
- **react:** rename the phone numbers "Direction" column to "Usage"
- **react:** show a temporary badge on active phone numbers
- **react:** zoom the dial plan canvas on scroll wheel instead of panning
- **react:** clearer port-order submission — actionable failure reason, pre-submit date validation, and edit-after-failure

## 1.0.0 (2026-06-10)

### Features

- E911 emergency address registration for WebRTC softphones
- **admin:** device onboarding readiness — stepper, steady state, and guided configuration
- **admin:** enumerate steady-state signals with status icons; online implies provisioned
- **api,admin:** drag-handle reordering for template buttons
- **api,sdk:** add signed url to File object + expand[]=file on faxes
- **api,sdk:** signed url on File + expand[]=file on faxes
- extend user-session token lifetime + server-side session revocation
- **kamailio:** hold WebRTC calls for mobile push wake-up
- **kamailio:** hold WebRTC calls for mobile push wake-up
- **lib:** raise user-session MaxTTL to 7 days
- **sdk,webrtc,ari:** blind/attended transfer in WebRTC SDK + softphone example
- **sdk:** implement blind/attended transfer + softphone example UI
- **sdk:** automate SDK releases with release-please
- **sdk:** automate SDK releases with release-please
- **sdk:** session_revoked terminal close + users.revokeSessions
- **voice:** add blind transfer
- **voice:** add blind transfer to pre-built VoiceAI
- **webrtc:** echo client_call_id on the consult leg's call.trying
- **webrtc:** support transfer on inbound calls (UAS-side REFER)

### Bug Fixes

- **api,lib:** product-level position cap and add-vs-move serialization
- **api,sdk:** harden button move against races and overflow
- **api,sdk:** degrade File url signing gracefully; nullable fax file_id
- **api:** return actionable 400 for upstream ZIP search rejections
- **deps:** align @types/react to 19.2.17 across workspaces and allow go binary in admin knip
- **sdk:** take raw readiness fields at face value — no client-side clamp
- **sdk:** reject pending consult on error frames echoing the parent call_id
- **sdk:** keep just-ordered numbers out of the Cancelled tab
- **sdk:** keep just-ordered numbers out of the Cancelled tab
- **sdk:** defer inbound answer until the SDP is ready
- **sdk:** defer inbound answer until the SDP is ready
- **sdk:** don't emit a duplicate error on mic-permission denial
- **sdk:** export emergency-address + pagination types from webrtc entry
- **sdk:** hide softphone Hang up button while inbound call is ringing
- **sdk:** hide softphone Hang up button while inbound call is ringing

## [Unreleased]

### Added

- **Device readiness fields** on the `Device` type: `registration_status` (`'registered' | 'not_registered'`), `last_registered_at`, and `last_call_at`. These are always present and live-derived — `registration_status` reflects current reachability (distinct from the provisioning `status`), and `last_call_at` is the latest call attempt involving the device.

### Changed

- **`DeviceType` now includes `'dect_handset'`**: the unified `/v1/devices` endpoint already returns DECT handsets, but the SDK union previously omitted the variant. Consumers that exhaustively narrow on `DeviceType` should handle the `'dect_handset'` case.

### Breaking Changes

- **Entity ID Format Migration**: All entity IDs now use TypeID format instead of UUIDs
  - Account IDs: `acct_` prefix (e.g., `acct_01h2xcejqtf2nbrexx3vqjhp41`)
  - User IDs: `user_` prefix (e.g., `user_01h2xcejqtf2nbrexx3vqjhp42`)
  - Endpoint IDs: `ep_` prefix (e.g., `ep_01h2xcejqtf2nbrexx3vqjhp43`)
  - All IDs should be treated as opaque strings
- **Session API Changes**:
  - Session creation endpoint changed from `/api/v1/platforms/{platform_id}/accounts/{account_id}/sessions` to `/api/v1/accounts/{account_id}/sessions`
  - Platform context is now implicit (determined by API key)
  - Session response now includes `account_id` field
  - All `platform_id` fields removed from API responses

## [0.2.1-alpha.1] - 2025-11-24

### Changed

- **Session Creation Endpoint**: Updated from `/api/v1/accounts/{account_id}/sessions` to `/api/v1/account_sessions` for improved security
  - `account_id` now passed in request body instead of URL path
  - Endpoint now only accepts API keys (not session tokens)
  - Prevents session tokens from creating new session tokens

### Security

- Session creation now requires API keys only (session tokens are rejected)
- Only API keys can create sessions, preventing unauthorized session extension

### Migration

No code changes required if using the SDK. Simply update to the latest version:

```bash
npm install @dialstack/sdk@0.2.1-alpha.1
```

### Added

- **Server SDK** - Node.js SDK for server-side API operations
  - `DialStack` class exported from `@dialstack/sdk/server`
  - `sessions.create()` method for creating account-scoped sessions
  - Secure API key authentication for server environments
  - Package.json subpath exports for clean import separation
- `loadDialstackAndInitialize()` - New primary initialization function
- Eager client secret fetching for improved performance
- Automatic session refresh every 50 minutes with 1-minute retry on failure
- Synchronous wrapper API that queues operations until session is ready
- `DialStackInstance.create()` - Create embedded components
- `DialStackInstance.update()` - Update appearance for all components
- `DialStackInstance.logout()` - Clean up session and components
- Event-based communication between SDK and components
- `BaseComponent` with appearance updates and logout handling
- Styled components with CSS custom properties for theming
- `useCreateComponent` hook with `useLayoutEffect` for synchronous component creation
- Updated React components to use new SDK instance pattern
- Vanilla JavaScript example demonstrating SDK usage
- Comprehensive type definitions for all APIs
- **CallLogs Web Component** - Displays call history in a formatted table
  - Real-time data fetching from DialStack API with session authentication
  - Professional table UI with Date, Direction, From, To, Duration, and Status columns
  - Color-coded call directions (inbound/outbound) and statuses (answered/no-answer/failed)
  - Loading, error, and empty state handling
  - Date and duration formatting utilities
  - React integration setter methods: `setDateRange()`, `setLimit()`, `setOffset()`
  - Responsive design with hover effects
  - Shadow DOM isolation for clean component encapsulation
- **Voicemails Web Component** - Displays user-specific voicemails with audio playback
  - User-scoped voicemail fetching with session authentication
  - List-based UI with avatars showing caller initials
  - HTML5 audio player with native controls
  - Automatic mark-as-read when audio playback starts
  - Visual distinction for unread voicemails (bold text, colored background, indicator dot)
  - Relative timestamp formatting ("5m ago", "2h ago", "Dec 15")
  - Colorful avatar backgrounds based on name hash
  - Duration badges for quick scanning
  - React integration setter method: `setUserId()`
  - Graceful error handling with silent mark-as-read failures
  - Shadow DOM isolation for component encapsulation

### Changed

- React Context Provider now accepts `dialstack` instance instead of `clientSecret`
- Web Components now receive SDK instance via `setInstance()` method
- Components auto-initialize when both connected to DOM and instance is set
- React wrapper components simplified to use `dialstack.create()` internally
- **React Components Enhanced with Props** - Full prop synchronization support
  - `<CallLogs />` now accepts `dateRange` and `limit` props
  - `<Voicemails />` now accepts required `userId` prop
  - Props automatically sync to Web Component setter methods
  - `useUpdateWithSetter` hook for declarative prop-to-setter synchronization
  - `useCreateComponent` now returns both containerRef and componentInstance
  - `DateRange` type exported for TypeScript consumers

### Deprecated

- `initialize()` function (use `loadDialstackAndInitialize()` instead)
- `getInstance()` function (use instance returned by `loadDialstackAndInitialize()` instead)

## [0.1.0] - 2025-11-14

### Added

- Initial release of @dialstack/sdk
- Core SDK initialization with `initialize()` and `getInstance()`
- Web Components for CallLogs and Voicemails
- React wrapper components and hooks:
  - `DialstackComponentsProvider` for context management
  - `CallLogs` and `Voicemails` React components
  - `useDialstackComponents` hook
  - `useCreateComponent` hook for Web Component integration
  - `useUpdateWithSetter` utility hook
- Rollup build system with three output formats:
  - CommonJS (dist/sdk.js)
  - ES Modules (dist/sdk.esm.js)
  - UMD (dist/sdk.umd.js)
- TypeScript type definitions
- GitHub Actions CI workflow
- MIT License
- Contribution guidelines
- Pre-commit hooks for type checking and build validation

[Unreleased]: https://github.com/dialstack/dialstack-sdk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/dialstack/dialstack-sdk/releases/tag/v0.1.0
