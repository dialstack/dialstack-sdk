// Stock Expo Metro config.
//
// This example consumes the SDK and the RN Softphone component the way any app
// outside this repo would: as installed packages (`@dialstack/sdk` and
// `@dialstack/mobile-softphone`), resolved from node_modules via their
// package.json `exports` / `react-native` fields. There are NO source aliases —
// removing them is the whole point of this example (it must work as if it were
// not sitting inside the SDK repo).
//
// `@dialstack/sdk/webrtc` resolves to the package's `react-native` export
// condition (its per-file native build), so Metro's own platform-extension
// resolution picks `platform.native.js`. `@dialstack/mobile-softphone` ships
// TypeScript source, which Expo's Metro transpiles like any other dependency.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
