/**
 * Tests for AccountOnboarding React wrapper
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { DialstackComponentsProvider } from '../DialstackComponentsProvider';
import { AccountOnboarding } from '../AccountOnboarding';
import '../../components/account-onboarding';
import type { DialStackInstance, AccountOnboardingElement } from '../../types';

const createMockDialstack = (): DialStackInstance => {
  const create = jest.fn((tagName: string) => {
    const element = document.createElement(`dialstack-${tagName}`) as AccountOnboardingElement;
    const instance = { getAppearance: () => undefined } as unknown as Parameters<
      AccountOnboardingElement['setInstance']
    >[0];
    element.setInstance(instance);
    return element;
  });

  return {
    create: create as DialStackInstance['create'],
    update: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
  };
};

const clickAction = (element: AccountOnboardingElement, action: string): void => {
  const button = element.shadowRoot?.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  expect(button).not.toBeNull();
  button?.click();
};

describe('AccountOnboarding (React wrapper)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('clears optional props when they are removed on rerender', async () => {
    const dialstack = createMockDialstack();

    const { container, rerender } = render(
      <DialstackComponentsProvider dialstack={dialstack}>
        <AccountOnboarding
          collectionOptions={{ steps: { exclude: ['hardware'] } }}
          fullTermsOfServiceUrl="https://example.com/terms"
        />
      </DialstackComponentsProvider>
    );

    const element = container.querySelector(
      'dialstack-account-onboarding'
    ) as AccountOnboardingElement | null;
    expect(element).not.toBeNull();

    await waitFor(() => {
      expect(element?.shadowRoot?.querySelector('[data-action="next"]')).toBeTruthy();
    });

    clickAction(element!, 'next');
    clickAction(element!, 'next');

    await waitFor(() => {
      expect(element?.shadowRoot?.querySelector('[data-action="exit"]')).toBeTruthy();
    });

    expect(element?.shadowRoot?.textContent).not.toContain('Hardware');
    const termsBefore = element?.shadowRoot?.querySelector<HTMLAnchorElement>('.legal-links a');
    expect(termsBefore?.getAttribute('href')).toBe('https://example.com/terms');

    rerender(
      <DialstackComponentsProvider dialstack={dialstack}>
        <AccountOnboarding />
      </DialstackComponentsProvider>
    );

    await waitFor(() => {
      const termsAfter = element?.shadowRoot?.querySelector('.legal-links a');
      expect(termsAfter).toBeNull();
      expect(element?.shadowRoot?.textContent).toContain('Hardware');
    });
  });
});
