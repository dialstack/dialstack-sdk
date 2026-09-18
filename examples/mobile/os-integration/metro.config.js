// Stock Expo Metro config — no watchFolders, no aliases, on purpose: this example
// must resolve the SDK exactly as an outside consumer's app would.
//
// That works because .npmrc sets `install-links=true`, so the `file:../../../native`
// dependency is copied into node_modules as a real directory. A plain `file:` dep
// without it is a symlink pointing outside this project, which Metro re-roots and
// then fails to resolve.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
