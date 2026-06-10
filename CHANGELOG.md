# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0](https://github.com/dialstack/dialstack/compare/sdk-v0.2.2-alpha.13...sdk-v1.0.0) (2026-06-10)

### Features

- [DIA-644] E911 emergency address registration for WebRTC softphones ([ed696b7](https://github.com/dialstack/dialstack/commit/ed696b7d20de784a3eae1bdb7cbd404c8dd330d5))
- **admin:** [DIA-1373] device onboarding readiness — stepper, steady state, and guided configuration ([4674638](https://github.com/dialstack/dialstack/commit/4674638c58a510a86e3dc12c6a88435e23fb244e))
- **admin:** [DIA-1373] enumerate steady-state signals with status icons; online implies provisioned ([ecabe26](https://github.com/dialstack/dialstack/commit/ecabe26de2dd2c5ffc1036fdd8445fcc769ad3ff))
- **api,admin:** [DIA-1346] drag-handle reordering for template buttons ([9785c5d](https://github.com/dialstack/dialstack/commit/9785c5d20ee4938870b25a822f41e7a1b40019a8))
- **api,sdk:** add signed url to File object + expand[]=file on faxes ([3074207](https://github.com/dialstack/dialstack/commit/307420748051ef902aa42b762b95f36e0d46fd79))
- **api,sdk:** signed url on File + expand[]=file on faxes ([68de89b](https://github.com/dialstack/dialstack/commit/68de89beb8e427571cd0071c217fbb42ed7e81e3))
- extend user-session token lifetime + server-side session revocation (DIA-1333) ([d48c836](https://github.com/dialstack/dialstack/commit/d48c836873d8c8f2ca7f54350c3fd1787b0cbb0b))
- **kamailio:** hold WebRTC calls for mobile push wake-up (DIA-1254) ([d609d38](https://github.com/dialstack/dialstack/commit/d609d382e3603de474e0cd566466d8f55d59cbce))
- **kamailio:** hold WebRTC calls for mobile push wake-up (DIA-1254) ([da99aa2](https://github.com/dialstack/dialstack/commit/da99aa2702d49b45e67c72dbc02c0937089f5699))
- **lib:** raise user-session MaxTTL to 7 days ([22be253](https://github.com/dialstack/dialstack/commit/22be253789b5b173a903e2facdbf8bd0178161b5))
- **sdk,webrtc,ari:** [DIA-1376] blind/attended transfer in WebRTC SDK + softphone example ([c945e0a](https://github.com/dialstack/dialstack/commit/c945e0a41b18911ec4a1df0c9517e6a57d58ff73))
- **sdk:** [DIA-1376] implement blind/attended transfer + softphone example UI ([04ca263](https://github.com/dialstack/dialstack/commit/04ca26397cdd5aed4a69fc925463d84782a22b6e))
- **sdk:** [DIA-1388] automate SDK releases with release-please ([0bbcaf2](https://github.com/dialstack/dialstack/commit/0bbcaf25bc6bfa2c96ff7436371baa154eda0581))
- **sdk:** [DIA-1388] automate SDK releases with release-please ([2421467](https://github.com/dialstack/dialstack/commit/242146779db2735deb224b0ee6f1e9a2b9a5a34a))
- **sdk:** session_revoked terminal close + users.revokeSessions ([adb9b5e](https://github.com/dialstack/dialstack/commit/adb9b5e9df660b48bcc899b355ede9b3c125d6c0))
- **voice:** [DIA-1293] add blind transfer ([2afef49](https://github.com/dialstack/dialstack/commit/2afef49575e10a4864b2ceb3922016ad97e8afa0))
- **voice:** [DIA-1293] add blind transfer to pre-built VoiceAI ([9bcda20](https://github.com/dialstack/dialstack/commit/9bcda205c613f60de5c2a67e6ac903f78fa02f1d))
- **webrtc:** [DIA-1376] echo client_call_id on the consult leg's call.trying ([2271d32](https://github.com/dialstack/dialstack/commit/2271d32290488fd7674443cdbcc89ff3bdb19a93))
- **webrtc:** [DIA-1376] support transfer on inbound calls (UAS-side REFER) ([5dbe38c](https://github.com/dialstack/dialstack/commit/5dbe38c62f6ad65ee2e186e684e54737dbf7461e))

### Bug Fixes

- **api,lib:** [DIA-1346] product-level position cap and add-vs-move serialization ([ec6ec1f](https://github.com/dialstack/dialstack/commit/ec6ec1ff565202734db98bbfa33422b630b3d463))
- **api,sdk:** [DIA-1346] harden button move against races and overflow ([17f988d](https://github.com/dialstack/dialstack/commit/17f988d856909f18cf5d71d0f12bb0a5a592a9ee))
- **api,sdk:** degrade File url signing gracefully; nullable fax file_id ([170cfa1](https://github.com/dialstack/dialstack/commit/170cfa14a8a479bd539cde36cee40f1b29f36a86))
- **api:** [DIA-1386] return actionable 400 for upstream ZIP search rejections ([0faba63](https://github.com/dialstack/dialstack/commit/0faba63869b31b64146b0711b4d74734de11d6ea))
- **deps:** align @types/react to 19.2.17 across workspaces and allow go binary in admin knip ([2100a3d](https://github.com/dialstack/dialstack/commit/2100a3d6fb74392cadc1bda849388220662cae69))
- **sdk:** [DIA-1373] take raw readiness fields at face value — no client-side clamp ([850c0b9](https://github.com/dialstack/dialstack/commit/850c0b9c04378ca99834b6f9d639df715ff1023f))
- **sdk:** [DIA-1376] reject pending consult on error frames echoing the parent call_id ([2841b9c](https://github.com/dialstack/dialstack/commit/2841b9cd6c041d31b5b17d6084055e3435fcbb81))
- **sdk:** [DIA-1390] keep just-ordered numbers out of the Cancelled tab ([20cb1ce](https://github.com/dialstack/dialstack/commit/20cb1ce75fe55fa4559db6211d0ae91ca7aab9ca))
- **sdk:** [DIA-1390] keep just-ordered numbers out of the Cancelled tab ([15f553f](https://github.com/dialstack/dialstack/commit/15f553f20ad47b2404ace6075baf49892c397238))
- **sdk:** [DIA-1471] defer inbound answer until the SDP is ready ([e8dea59](https://github.com/dialstack/dialstack/commit/e8dea591c8c93bdca32c839ae79bb3ce19f84cf9))
- **sdk:** [DIA-1471] defer inbound answer until the SDP is ready ([8a2d852](https://github.com/dialstack/dialstack/commit/8a2d852b1b16dfcb020525f07ec1ddba8f9dfe6e))
- **sdk:** [DIA-1471] don't emit a duplicate error on mic-permission denial ([1ff1d02](https://github.com/dialstack/dialstack/commit/1ff1d02c04bd1a101002b00152646045dd14f40e))
- **sdk:** [DIA-644] export emergency-address + pagination types from webrtc entry ([2a490a9](https://github.com/dialstack/dialstack/commit/2a490a950e0f1e661cf5f8abc5c000da750063e1))
- **sdk:** hide softphone Hang up button while inbound call is ringing (DIA-1405) ([b054f1a](https://github.com/dialstack/dialstack/commit/b054f1a0ae2f2fc8410dce5178005f2fefd8279b))
- **sdk:** hide softphone Hang up button while inbound call is ringing (DIA-1405) ([d6dbeab](https://github.com/dialstack/dialstack/commit/d6dbeab9ca6e7f369b1d011ac43aec8ad17c9c90))

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
