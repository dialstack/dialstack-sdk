import React from 'react';
import { render, waitFor } from '@testing-library/react';
// A value import, so the elements register; the type rides along.
import { defaultIcons, type DialStackInstance } from '@dialstack/sdk-js';
import { CallLogs } from '../CallLogs';
import { DialstackComponentsProvider } from '../DialstackComponentsProvider';

// The element starts its first load when attached, before any prop effect runs,
// so props that shape that request are applied ahead of attaching.
void defaultIcons;

describe('CallLogs', () => {
  function setup() {
    const list = jest.fn(async () => ({
      object: 'list',
      url: '/v1/calls',
      next_page_url: null,
      previous_page_url: null,
      data: [],
    }));
    const instance = { getAppearance: () => undefined, calls: { list }, fetchApi: jest.fn() };
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
    return { list, dialstack };
  }

  it('loads once, already filtered, for a deep link', async () => {
    const { list, dialstack } = setup();
    render(
      <DialstackComponentsProvider dialstack={dialstack}>
        <CallLogs filters={{ search: 'dana', direction: 'inbound' }} />
      </DialstackComponentsProvider>
    );

    await waitFor(() => expect(list).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'dana', direction: 'inbound' })
    );
  });

  it('covers all history from the first request when the toolbar is hidden', async () => {
    const { list, dialstack } = setup();
    render(
      <DialstackComponentsProvider dialstack={dialstack}>
        <CallLogs displayOptions={{ showFilters: false }} />
      </DialstackComponentsProvider>
    );

    await waitFor(() => expect(list).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ from_date: undefined }));
  });

  it('does not reload on a re-render with the same date range', async () => {
    const { list, dialstack } = setup();
    const range = { start: '2026-01-01T00:00:00Z' };
    const { rerender } = render(
      <DialstackComponentsProvider dialstack={dialstack}>
        <CallLogs dateRange={{ ...range }} />
      </DialstackComponentsProvider>
    );
    await waitFor(() => expect(list).toHaveBeenCalled());
    rerender(
      <DialstackComponentsProvider dialstack={dialstack}>
        <CallLogs dateRange={{ ...range }} />
      </DialstackComponentsProvider>
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(list).toHaveBeenCalledTimes(1);
  });
});
