# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
