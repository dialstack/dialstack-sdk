import type { StorybookConfig } from '@storybook/react-vite';
import type { Plugin } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  stories: ['../src/**/__stories__/*.stories.@(ts|tsx)'],
  addons: [],
  framework: '@storybook/react-vite',
  viteFinal: (config) => {
    // Resolve @dialstack/sdk/* imports to source files so Storybook's
    // DialstackComponentsProvider shares the same React context as components.
    config.resolve = {
      ...config.resolve,
      alias: {
        ...(config.resolve?.alias ?? {}),
        '@dialstack/sdk/react': resolve(__dirname, '../src/react.ts'),
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
