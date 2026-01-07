# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
