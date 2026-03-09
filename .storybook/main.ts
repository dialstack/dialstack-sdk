import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/__stories__/*.stories.@(ts|tsx)'],
  addons: [],
  framework: '@storybook/react-vite',
  viteFinal: (config) => {
    config.define = {
      ...config.define,
      _NPM_PACKAGE_VERSION_: JSON.stringify('storybook-dev'),
    };
    return config;
  },
};

export default config;
