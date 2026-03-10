import type { StorybookConfig } from '@storybook/react-vite';
import type { Plugin } from 'vite';
import { resolve, dirname } from 'node:path';

// Redirect local .css imports to use Vite's ?inline query, which returns
// CSS as a default-exported string instead of injecting it into the page.
// This matches the Rollup cssRawPlugin behavior for shadow DOM components.
function cssRawPlugin(): Plugin {
  return {
    name: 'css-raw',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source.endsWith('.css') && importer && !source.includes('node_modules')) {
        return resolve(dirname(importer), source) + '?inline';
      }
    },
  };
}

const config: StorybookConfig = {
  stories: ['../src/**/__stories__/*.stories.@(ts|tsx)'],
  addons: [],
  framework: '@storybook/react-vite',
  viteFinal: (config) => {
    config.define = {
      ...config.define,
      _NPM_PACKAGE_VERSION_: JSON.stringify('storybook-dev'),
    };
    config.plugins = [cssRawPlugin(), ...(config.plugins || [])];
    return config;
  },
};

export default config;
