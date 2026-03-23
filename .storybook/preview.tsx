import React from 'react';
import type { Preview } from '@storybook/react';
import { DialstackComponentsProvider } from '../src/react/DialstackComponentsProvider';
import { createMockInstance } from '../src/__mocks__/mock-instance';
import type { Theme, DIDItem } from '../src/types';

// Register all Web Components so React wrappers (which call dialstack.create()) can use them
import '../src/components/call-logs';
import '../src/components/voicemails';
import '../src/components/call-history';
import '../src/components/phone-numbers';
import '../src/components/phone-number-ordering';

/**
 * Wraps an instance with a logging proxy that traces every API method call.
 * Logs: [API] componentType | methodName(args) → result
 */
function withApiLogging<T extends object>(instance: T, label: string): T {
  return new Proxy(instance, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function' || typeof prop !== 'string') return value;
      // Skip non-API methods
      if (['getAppearance', 'getClientSecret', 'create', 'update', 'on', 'off'].includes(prop))
        return value;
      return (...args: unknown[]) => {
        const t0 = performance.now();
        const result = value.apply(target, args);
        if (result && typeof result.then === 'function') {
          return result.then((res: unknown) => {
            const ms = (performance.now() - t0).toFixed(0);
            console.log(
              `%c[API] ${label}%c ${prop}%c (${ms}ms)`,
              'color:#6772E5;font-weight:bold',
              'color:#333;font-weight:bold',
              'color:#999',
              args.length ? args : ''
            );
            return res;
          });
        }
        return result;
      };
    },
  });
}

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
      const dids = context.args.dids as DIDItem[] | undefined;
      const rawInstance = createMockInstance({ theme }, { empty, dids });
      const storyTitle = context.title ?? 'unknown';
      const label = storyTitle.startsWith('Web Components') ? 'WC' : 'React';
      const instance = withApiLogging(rawInstance, label);

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
