/**
 * Tests for AccountOnboardingComponent
 */

import { waitFor } from '@testing-library/react';
import '../account-onboarding';
import type { AccountOnboardingElement } from '../../types';

const createMockInstance = (): Parameters<AccountOnboardingElement['setInstance']>[0] =>
  ({ getAppearance: () => undefined }) as unknown as Parameters<
    AccountOnboardingElement['setInstance']
  >[0];

const clickAction = (element: AccountOnboardingElement, action: string): void => {
  const button = element.shadowRoot?.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  expect(button).not.toBeNull();
  button?.click();
};

const mountComponent = async (): Promise<AccountOnboardingElement> => {
  const element = document.createElement(
    'dialstack-account-onboarding'
  ) as AccountOnboardingElement;
  document.body.appendChild(element);
  element.setInstance(createMockInstance());

  await waitFor(() => {
    expect(element.shadowRoot?.querySelector('[data-action="next"]')).toBeTruthy();
  });

  return element;
};

const navigateToComplete = async (
  element: AccountOnboardingElement,
  nextClicks = 3
): Promise<void> => {
  for (let i = 0; i < nextClicks; i += 1) {
    clickAction(element, 'next');
  }

  await waitFor(() => {
    expect(element.shadowRoot?.querySelector('[data-action="exit"]')).toBeTruthy();
  });
};

describe('AccountOnboardingComponent', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('fires onExit once per mount lifecycle (including remount)', async () => {
    const onExit = jest.fn();
    const component = document.createElement(
      'dialstack-account-onboarding'
    ) as AccountOnboardingElement;
    const firstContainer = document.createElement('div');
    const secondContainer = document.createElement('div');
    document.body.appendChild(firstContainer);
    document.body.appendChild(secondContainer);

    firstContainer.appendChild(component);
    component.setInstance(createMockInstance());
    component.setOnExit(onExit);
    await waitFor(() => {
      expect(component.shadowRoot?.querySelector('[data-action="next"]')).toBeTruthy();
    });

    firstContainer.removeChild(component);
    expect(onExit).toHaveBeenCalledTimes(1);

    secondContainer.appendChild(component);
    secondContainer.removeChild(component);
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  it('clears legal links when URL setters are reset', async () => {
    const component = await mountComponent();
    component.setCollectionOptions({ steps: { include: ['account', 'numbers'] } });
    component.setFullTermsOfServiceUrl('https://example.com/terms');

    await navigateToComplete(component, 2);

    const linkBeforeReset =
      component.shadowRoot?.querySelector<HTMLAnchorElement>('.legal-links a');
    expect(linkBeforeReset?.getAttribute('href')).toBe('https://example.com/terms');

    component.setFullTermsOfServiceUrl(undefined);
    const linkAfterReset = component.shadowRoot?.querySelector('.legal-links a');
    expect(linkAfterReset).toBeNull();
  });

  it('restores default steps when collection options are cleared', async () => {
    const component = await mountComponent();
    component.setCollectionOptions({ steps: { exclude: ['hardware'] } });

    await navigateToComplete(component, 2);
    expect(component.shadowRoot?.textContent).not.toContain('Hardware');

    component.setCollectionOptions(undefined);
    expect(component.shadowRoot?.textContent).toContain('Hardware');
  });
});
