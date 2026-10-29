import React from 'react';
import { render, waitFor } from '@testing-library/react';
// A value import, so the elements register; the type rides along.
import { defaultIcons, type DialStackInstance } from '@dialstack/sdk-js';
import { AIAgent } from '../AIAgent';
import { DialstackComponentsProvider } from '../DialstackComponentsProvider';

void defaultIcons;

describe('AIAgent', () => {
  function setup() {
    const instance = {
      getAppearance: () => undefined,
      aiAgents: { retrieve: jest.fn(async () => ({ id: 'agt_1', name: 'Stored name' })) },
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

  // initialValues only applies in host mode, and the wrapper re-applies it only
  // when it changes, so the switch to host mode has to bring it in.
  it('shows initialValues when onSaveRequested is added after mount', async () => {
    const { dialstack, element } = setup();
    const initialValues = { name: 'Host name' };
    const tree = (onSaveRequested?: () => Promise<void>) => (
      <DialstackComponentsProvider dialstack={dialstack}>
        <AIAgent agentId="agt_1" initialValues={initialValues} onSaveRequested={onSaveRequested} />
      </DialstackComponentsProvider>
    );
    const nameInput = () =>
      element()?.shadowRoot?.querySelector<HTMLInputElement>('[data-field="name"]');

    const { rerender } = render(tree());
    await waitFor(() => expect(nameInput()?.value).toBe('Stored name'));

    rerender(tree(async () => {}));

    await waitFor(() => expect(nameInput()?.value).toBe('Host name'));
  });
});
