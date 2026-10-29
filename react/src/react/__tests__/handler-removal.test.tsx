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

// A host that stops passing a handler means "stop calling me". Leaving the old
// one on the element keeps firing a callback the host has let go of.
describe('removing a handler prop', () => {
  function setup() {
    const emptyList = {
      object: 'list',
      url: '/v1/x',
      next_page_url: null,
      previous_page_url: null,
      data: [],
    };
    const instance = {
      getAppearance: () => undefined,
      fetchApi: jest.fn(async () => ({ ok: true, json: async () => emptyList })),
      fetchAllPages: jest.fn(async () => []),
      calls: { list: jest.fn(async () => emptyList) },
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
    return { dialstack, element: () => element };
  }

  const handler = () => {};
  // [wrapper, the element field its handler lands in, the wrapper with and
  // without that handler]
  const cases: [string, string, (h?: () => void) => React.ReactElement][] = [
    [
      'CallHistory',
      '_onLoadError',
      (h) => <CallHistory phoneNumber="+14155551234" onLoadError={h} />,
    ],
    ['CallLogs', '_onRowClick', (h) => <CallLogs onRowClick={h} />],
    ['PhoneNumbers', '_onRowClick', (h) => <PhoneNumbers onRowClick={h} />],
    ['PhoneNumberOrdering', '_onOrderComplete', (h) => <PhoneNumberOrdering onOrderComplete={h} />],
    [
      'Voicemails',
      '_onVoicemailSelect',
      (h) => <Voicemails userId="user_1" onVoicemailSelect={h} />,
    ],
    [
      'AIAgent',
      'onRotateSecretRequested',
      (h) => <AIAgent agentId="agt_1" onRotateSecretRequested={h} />,
    ],
  ];

  it.each(cases)('%s clears %s on the element', async (_name, field, wrapper) => {
    const { dialstack, element } = setup();
    const tree = (h?: () => void) => (
      <DialstackComponentsProvider dialstack={dialstack}>{wrapper(h)}</DialstackComponentsProvider>
    );
    const { rerender } = render(tree(handler));
    await waitFor(() =>
      expect((element() as unknown as Record<string, unknown>)?.[field]).toBe(handler)
    );

    rerender(tree(undefined));

    await waitFor(() =>
      expect((element() as unknown as Record<string, unknown>)[field]).toBeUndefined()
    );
  });
});
