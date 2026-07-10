// Metro config for the in-repo mobile example.
//
// This example consumes the SDK's *source* (not the published dist bundle) so
// that Metro resolves the platform seam to `platform.native.ts` (react-native-
// webrtc) — the pre-bundled web `dist/` would have inlined the browser
// `platform.ts` and could never be swapped. We therefore:
//   1. watch the SDK source tree, and
//   2. alias `@dialstack/sdk[...]` to `sdk/src` so imports resolve to source.
//
// node_modules resolve from THIS example's folder via `nodeModulesPaths` (so the
// SDK source — which lives outside the project root — still finds react-native-
// webrtc et al.), while normal hierarchical lookup stays on so Expo's own nested
// transitive deps resolve.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sdkRoot = path.resolve(projectRoot, '../..'); // sdk/
const sdkSrc = path.resolve(sdkRoot, 'src');
// The RN Softphone component lives beside this example (sdk/mobile/softphone/) and is
// imported by relative path; watch it so edits hot-reload.
const componentSrc = path.resolve(projectRoot, '../softphone/src');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [sdkSrc, componentSrc];

config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

// Map the package specifier to the SDK source so subpath imports like
// `@dialstack/sdk/webrtc` and `@dialstack/sdk/components/softphone-theme` resolve
// to source files (and the platform seam resolves to platform.native.ts).
config.resolver.extraNodeModules = {
  '@dialstack/sdk': sdkSrc,
};

// `@dialstack/sdk/react/softphone` is a published package export that maps to the
// `react-softphone.ts` bundle entry; in this source-consuming example there is no
// `src/react/softphone` directory (the hooks live in `src/react/softphone-hooks/`), so
// alias the public specifier to the source barrel directly.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@dialstack/sdk/react/softphone') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(sdkSrc, 'react-softphone.ts'),
    };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
