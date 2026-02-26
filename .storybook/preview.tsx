import React from 'react';
import type { Preview } from '@storybook/react';
import { DialstackComponentsProvider } from '../src/react/DialstackComponentsProvider';
import { createMockInstance } from '../src/__mocks__/mock-instance';
import type { Theme } from '../src/types';

// Register all Web Components so React wrappers (which call dialstack.create()) can use them
import '../src/components/call-logs';
import '../src/components/voicemails';
import '../src/components/call-history';
import '../src/components/phone-numbers';
import '../src/components/phone-number-ordering';
import '../src/components/account-onboarding';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  argTypes: {
    theme: {
      control: 'select',
      options: ['light', 'dark'],
      description: 'Color theme',
    },
    layoutVariant: {
      control: 'select',
      options: ['default', 'compact', 'comfortable'],
      description: 'Layout density',
    },
  },
  args: {
    theme: 'light',
    layoutVariant: 'default',
  },
  decorators: [
    (Story, context) => {
      const theme = (context.args.theme as Theme) ?? 'light';
      const empty = (context.args._empty as boolean) ?? false;
      const instance = createMockInstance({ theme }, { empty });

      return (
        <DialstackComponentsProvider dialstack={instance}>
          <div
            style={{
              padding: '24px',
              background: theme === 'dark' ? '#1a1a1a' : '#ffffff',
              minHeight: '200px',
            }}
          >
            <Story />
          </div>
        </DialstackComponentsProvider>
      );
    },
  ],
};

export default preview;
