// Stock Expo Metro config.
//
// This example consumes the SDK and the RN softphone the way any app outside
// this repo would: as installed packages (`@dialstack/sdk` and
// `@dialstack/sdk-native`), resolved from node_modules via their package.json
// `exports`. There are NO source aliases — removing them is the whole point of
// this example (it must work as if it were not sitting inside the SDK repo).
//
// `@dialstack/sdk`'s core is written to the standard WebRTC surface; the app
// calls `registerGlobals()` from react-native-webrtc in `index.js` so those
// globals exist at runtime. `@dialstack/sdk-native` ships TypeScript source,
// which Expo's Metro transpiles like any other dependency.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
