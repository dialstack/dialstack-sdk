# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
