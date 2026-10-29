import React from 'react';
import { render, waitFor } from '@testing-library/react';
// A value import, so the elements register; the type rides along.
import { defaultIcons, type DialStackInstance } from '@dialstack/sdk-js';
import { CallHistory } from '../CallHistory';
import { DialstackComponentsProvider } from '../DialstackComponentsProvider';

void defaultIcons;

describe('CallHistory', () => {
  function setup() {
    const fetchApi = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        object: 'list',
        url: '/v1/calls',
        next_page_url: null,
        previous_page_url: null,
        data: [],
      }),
    }));
    const instance = { getAppearance: () => undefined, fetchApi };
    const dialstack = {
      create: jest.fn((tag: string) => {
        const el = document.createElement(`dialstack-${tag}`) as HTMLElement & {
          setInstance: (i: unknown) => void;
        };
        el.setInstance(instance);
        return el;
      }),
      update: jest.fn(),
      logout: jest.fn(),
      removeAppearanceTarget: jest.fn(),
    } as unknown as DialStackInstance;
    return { fetchApi, dialstack };
  }

  // A host re-rendering on a timer (a softphone's call clock) must not make
  // the list drop back to its loading skeleton every tick.
  it('does not reload on a re-render with the same props', async () => {
    const { fetchApi, dialstack } = setup();
    const tree = () => (
      <DialstackComponentsProvider dialstack={dialstack}>
        <CallHistory phoneNumber="+14155551234" limit={3} classes={{ base: 'rounded-lg' }} />
      </DialstackComponentsProvider>
    );
    const { rerender } = render(tree());
    await waitFor(() => expect(fetchApi).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    const loads = fetchApi.mock.calls.length;

    rerender(tree());
    rerender(tree());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fetchApi).toHaveBeenCalledTimes(loads);
  });

  it('reloads when the phone number changes', async () => {
    const { fetchApi, dialstack } = setup();
    const { rerender } = render(
      <DialstackComponentsProvider dialstack={dialstack}>
        <CallHistory phoneNumber="+14155551234" />
      </DialstackComponentsProvider>
    );
    await waitFor(() => expect(fetchApi).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));

    rerender(
      <DialstackComponentsProvider dialstack={dialstack}>
        <CallHistory phoneNumber="+14155559999" />
      </DialstackComponentsProvider>
    );

    await waitFor(() =>
      expect(fetchApi).toHaveBeenCalledWith(expect.stringContaining('%2B14155559999'))
    );
  });
});
