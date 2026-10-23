import type { StorybookConfig } from '@storybook/react-native-web-vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The React Native softphone, rendered in the browser through react-native-web.
// Separate from ../.storybook because `framework` is single-valued and that one
// is @storybook/react-vite for the web components. The globs stay disjoint so
// web components are never pulled through this instance's Flow transform.
// Web first, so react-native-svg resolves to its `.web` files. Vite 8
// pre-bundles with Rolldown and ignores `esbuildOptions`, so this has to reach
// the optimizer through `rolldownOptions` as well.
const WEB_FIRST_EXTENSIONS = ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js'];

// See shims/svg-native-modules.ts. A plugin, not an alias: one of the imports is
// relative and inside a pre-bundled dependency, which only the optimizer's own
// resolver sees, so it has to run there as well as in the dev server.
const svgNativeModules = {
  name: 'dialstack-svg-native-modules',
  resolveId(source: string, importer?: string) {
    const fromSvg = importer?.includes('react-native-svg') ?? false;
    if (
      (fromSvg && source.endsWith('/fabric/NativeSvgSoundModule')) ||
      source === '@react-native/assets-registry/registry'
    ) {
      return resolve(__dirname, './shims/svg-native-modules.ts');
    }
    return null;
  },
};

const config: StorybookConfig = {
  stories: ['../native/src/**/__stories__/*.stories.@(ts|tsx)'],
  addons: [],
  framework: {
    name: '@storybook/react-native-web-vite',
    options: {
      // Ships untranspiled Flow/ESM, so it has to go through the framework's
      // babel pass. Its own `.web` entry is picked up by platform resolution.
      modulesToTranspile: ['react-native-svg'],
      pluginReactOptions: { jsxRuntime: 'automatic' },
    },
  },
  viteFinal: (config) => {
    config.resolve = {
      ...config.resolve,
      alias: {
        ...(config.resolve?.alias ?? {}),
        // Longest specifier first, or the bare entry swallows the subpath.
        // Pin React to the hoisted copy. This config lives in sdk/, whose
        // sibling directory `react/` is the @dialstack/sdk-react package —
        // close enough to the bare specifier that the resolver hands back that
        // package's dist, which has no default export.
        react: resolve(__dirname, '../../node_modules/react'),
        'react-dom': resolve(__dirname, '../../node_modules/react-dom'),
        // Only /core is safe here: the bare barrel is the WEB component graph
        // (custom elements, @xyflow/react, CSS), which React Native never
        // imports and which does not belong in this instance.
        '@dialstack/sdk-react/core': resolve(__dirname, '../react/src/react/softphone/core/index.ts'),
        '@dialstack/sdk-js/pure': resolve(__dirname, '../js/src/pure.ts'),
        '@dialstack/sdk-js': resolve(__dirname, '../js/src/index.ts'),
        '@dialstack/sdk-webrtc': resolve(__dirname, '../webrtc/src/index.ts'),
        'react-native-incall-manager': resolve(__dirname, './shims/incall-manager.ts'),
        'react-native-webrtc': resolve(__dirname, './shims/webrtc.ts'),
      },
    };
    // The RN tree uses `import React from 'react'`, which Vite's pre-bundled
    // ESM React does not provide; interop restores the default export.
    // The @dialstack/* packages resolve to source above, so pre-bundling them
    // only creates a second copy — and the optimizer collided one of them with
    // React's own dep slot, leaving `import React` pointing at the SDK bundle.
    config.optimizeDeps = {
      ...config.optimizeDeps,
      exclude: [
        ...(config.optimizeDeps?.exclude ?? []),
        '@dialstack/sdk-react',
        '@dialstack/sdk-js',
        '@dialstack/sdk-webrtc',
      ],
      esbuildOptions: {
        ...(config.optimizeDeps?.esbuildOptions ?? {}),
        resolveExtensions: WEB_FIRST_EXTENSIONS,
      },
      rolldownOptions: {
        ...(config.optimizeDeps?.rolldownOptions ?? {}),
        resolve: {
          ...(config.optimizeDeps?.rolldownOptions?.resolve ?? {}),
          extensions: WEB_FIRST_EXTENSIONS,
        },
        plugins: [...[config.optimizeDeps?.rolldownOptions?.plugins ?? []].flat(), svgNativeModules],
      },
    };
    config.plugins = [...(config.plugins ?? []), svgNativeModules];
    config.define = { ...config.define, __DEV__: 'true' };
    return config;
  },
};

export default config;
