# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
