import type { StorybookConfig } from '@storybook/react-vite';
import type { Plugin } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The react package's own exports map is the source of truth for which subpaths
// exist, so the alias list below cannot fall behind it.
const reactSubpaths: string[] = Object.keys(
  (
    JSON.parse(
      readFileSync(resolve(__dirname, '../react/package.json'), 'utf8')
    ) as { exports: Record<string, unknown> }
  ).exports
)
  .filter((key) => key.startsWith('./') && key !== './package.json')
  .map((key) => key.slice(2));

// Redirect .css imports to use Vite's ?inline query, which returns CSS as a
// default-exported string instead of injecting it into the page.  This matches
// the Rollup cssRawPlugin behavior so Storybook surfaces the same CSS handling
// bugs as the production bundle.
function cssRawPlugin(): Plugin {
  return {
    name: 'css-raw',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!source.endsWith('.css') || !importer || source.includes('html-proxy')) return;

      // For bare specifiers (@xyflow/react/dist/style.css), let Vite resolve
      // the real path first, then append ?inline.
      if (source.startsWith('@') || source.includes('node_modules')) {
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
        if (resolved) return resolved.id + '?inline';
        return;
      }

      // Local CSS: resolve relative to importer.
      return resolve(dirname(importer), source) + '?inline';
    },
  };
}

const config: StorybookConfig = {
  stories: [
    '../js/src/**/__stories__/*.stories.@(ts|tsx)',
    '../react/src/**/__stories__/*.stories.@(ts|tsx)',
  ],
  addons: [],
  framework: '@storybook/react-vite',
  viteFinal: (config) => {
    // Resolve the package specifiers to source so Storybook's
    // DialstackComponentsProvider shares the same React context as components —
    // two copies of that module would give two createContext calls and a provider
    // the stories could not see.
    //
    // Longest specifier first: '@dialstack/sdk-react/softphone' has to match
    // before the bare '@dialstack/sdk-react', or the bare entry swallows it.
    config.resolve = {
      ...config.resolve,
      alias: {
        ...(config.resolve?.alias ?? {}),
        // Every react subpath, derived from the exports map rather than listed, so a
        // new component entry cannot arrive without its alias. Without one, Vite
        // resolves the subpath through node_modules to the built dist while the
        // provider resolves to source — two createContext calls, and a story that
        // renders blank with no error. The comment above promised this and the map
        // did not have it.
        ...Object.fromEntries(
          reactSubpaths.map((sub) => [
            `@dialstack/sdk-react/${sub}`,
            resolve(__dirname, `../react/src/${sub}.ts`),
          ])
        ),
        '@dialstack/sdk-js/pure': resolve(__dirname, '../js/src/pure.ts'),
        '@dialstack/sdk-js': resolve(__dirname, '../js/src/index.ts'),
        '@dialstack/sdk-webrtc': resolve(__dirname, '../webrtc/src/index.ts'),
        '@dialstack/sdk-react': resolve(__dirname, '../react/src/index.ts'),
        // Internals the stories borrow from the browser package: story arg types
        // and the mock instance. The `#` form marks them as not public API.
        '#storybook-fixtures/types': resolve(__dirname, '../js/src/__storybook__/types.ts'),
        '#storybook-fixtures/mock-instance': resolve(
          __dirname,
          '../js/src/__mocks__/mock-instance.ts'
        ),
      },
    };
    config.define = {
      ...config.define,
      _NPM_PACKAGE_VERSION_: JSON.stringify('storybook-dev'),
    };
    config.plugins = [cssRawPlugin(), ...(config.plugins || [])];
    // Suppress "use client" directive warnings from @xyflow/react
    config.build = {
      ...config.build,
      rollupOptions: {
        ...config.build?.rollupOptions,
        onwarn(warning, warn) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) return;
          warn(warning);
        },
      },
    };
    return config;
  },
};

export default config;
