import React from 'react';
import { render, waitFor } from '@testing-library/react';
// A value import, so the elements register; the type rides along.
import { defaultIcons, type DialStackInstance } from '@dialstack/sdk-js';
import { AIAgent } from '../AIAgent';
import { CallHistory } from '../CallHistory';
import { CallLogs } from '../CallLogs';
import { DialstackComponentsProvider } from '../DialstackComponentsProvider';
import { PhoneNumberOrdering } from '../PhoneNumberOrdering';
import { PhoneNumbers } from '../PhoneNumbers';
import { Voicemails } from '../Voicemails';

void defaultIcons;

// Hosts re-render for reasons of their own (a call timer, a parent's state).
// Re-rendering a wrapper with the same props must leave its element alone:
// every element render rebuilds its shadow DOM, dropping focus and scroll, and
// a reload flashes the loading state.
describe('wrappers re-rendered with the same props', () => {
  function setup() {
    const emptyList = {
      object: 'list',
      url: '/v1/x',
      next_page_url: null,
      previous_page_url: null,
      data: [],
    };
    const fetchApi = jest.fn(async () => ({ ok: true, json: async () => emptyList }));
    const list = jest.fn(async () => emptyList);
    const instance = {
      getAppearance: () => undefined,
      fetchApi,
      fetchAllPages: jest.fn(async () => []),
      calls: { list },
      aiAgents: { retrieve: jest.fn(async () => ({ id: 'agt_1', name: 'Front desk' })) },
    };
    let element: HTMLElement | null = null;
    const dialstack = {
      create: jest.fn((tag: string) => {
        const el = document.createElement(`dialstack-${tag}`) as HTMLElement & {
          setInstance: (i: unknown) => void;
        };
        el.setInstance(instance);
        element = el;
        return el;
      }),
      update: jest.fn(),
      logout: jest.fn(),
      removeAppearanceTarget: jest.fn(),
    } as unknown as DialStackInstance;
    const loads = () => fetchApi.mock.calls.length + list.mock.calls.length;
    return { dialstack, loads, element: () => element };
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  // Props as the docs write them: option objects (`classes`, `formatting`)
  // and callbacks inline. AIAgent's form values and field list are kept stable;
  // they are data, not options an element can merge and compare.
  const initialValues = { name: 'Front desk' };
  const hideFields: ['scheduling'] = ['scheduling'];
  const searchTypes: ['area_code'] = ['area_code'];
  const cases: [string, () => React.ReactElement][] = [
    [
      'AIAgent',
      () => (
        <AIAgent
          mode="create"
          initialValues={initialValues}
          hideFields={hideFields}
          onCreateRequested={async () => ({ id: 'agt_1' })}
        />
      ),
    ],
    [
      'CallHistory',
      () => <CallHistory phoneNumber="+14155551234" limit={3} classes={{ base: 'rounded-lg' }} />,
    ],
    [
      'CallLogs',
      () => (
        <CallLogs
          limit={10}
          classes={{ base: 'rounded-lg' }}
          formatting={{ defaultCountry: 'US' }}
          onRowClick={() => {}}
        />
      ),
    ],
    [
      'Voicemails',
      () => (
        <Voicemails userId="user_1" classes={{ base: 'rounded-lg' }} onVoicemailSelect={() => {}} />
      ),
    ],
    [
      'PhoneNumbers',
      () => <PhoneNumbers limit={10} classes={{ base: 'rounded-lg' }} onRowClick={() => {}} />,
    ],
    [
      'PhoneNumberOrdering',
      () => <PhoneNumberOrdering searchTypes={searchTypes} classes={{ base: 'rounded-lg' }} />,
    ],
  ];

  it.each(cases)('%s neither re-renders nor reloads', async (_name, wrapper) => {
    const { dialstack, loads, element } = setup();
    const tree = () => (
      <DialstackComponentsProvider dialstack={dialstack}>{wrapper()}</DialstackComponentsProvider>
    );
    const { rerender } = render(tree());
    await waitFor(() => expect(element()).not.toBeNull());
    await settle();

    const el = element() as unknown as { render: () => void };
    const renders = jest.spyOn(el, 'render');
    const loadsBefore = loads();

    rerender(tree());
    rerender(tree());
    await settle();

    expect({ renders: renders.mock.calls.length, reloads: loads() - loadsBefore }).toEqual({
      renders: 0,
      reloads: 0,
    });
  });
});
