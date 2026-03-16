/**
 * Tests for resetToFirstSubStep via enterReviewMode on step elements.
 * Verifies that account and numbers steps reset to their first substep
 * when re-entering review mode (e.g. navigating back to a completed step).
 */

import { waitFor } from '@testing-library/react';
import '../account-onboarding/step-account';
import '../account-onboarding/step-numbers';
import type { OnboardingStepBase } from '../account-onboarding/step-base';

type StepElement = OnboardingStepBase;

const mockAccount = {
  id: 'acct_01abc',
  email: 'existing@example.com',
  name: 'Acme Corp',
  phone: '(212) 555-0100',
  primary_contact_name: 'Jane Doe',
  config: {
    region: 'us-east',
    extension_length: 4,
    timezone: 'America/New_York',
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockUsers = [
  {
    id: 'user_01abc',
    name: 'Alice',
    email: 'alice@example.com',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const mockExtensions = [
  {
    number: '1001',
    target: 'user_01abc',
    status: 'active' as const,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const mockLocation = {
  id: 'loc_01abc',
  name: 'Main Office',
  address: {
    address_number: '123',
    street: 'Main St',
    city: 'New York',
    state: 'NY',
    postal_code: '10001',
    country: 'US',
    formatted_address: '123 Main St, New York, NY 10001',
  },
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const emptyList = {
  object: 'list',
  data: [],
  next_page_url: null,
  previous_page_url: null,
};

const createBaseMocks = (overrides?: Record<string, unknown>) => {
  return {
    getAppearance: () => undefined,
    getAccount: jest.fn().mockResolvedValue(mockAccount),
    listUsers: jest.fn().mockResolvedValue(mockUsers),
    listExtensions: jest.fn().mockResolvedValue(mockExtensions),
    listLocations: jest.fn().mockResolvedValue([mockLocation]),
    updateAccount: jest.fn().mockResolvedValue(mockAccount),
    listPhoneNumbers: jest.fn().mockResolvedValue(emptyList),
    listNumberOrders: jest.fn().mockResolvedValue(emptyList),
    listPortOrders: jest.fn().mockResolvedValue(emptyList),
    fetchAllPages: jest
      .fn()
      .mockImplementation(
        async (
          fetchFn: (opts: {
            limit: number;
          }) => Promise<{ data: unknown[]; next_page_url: string | null }>
        ) => {
          const response = await fetchFn({ limit: 100 });
          return response.data;
        }
      ),
    ...overrides,
  } as unknown as Parameters<StepElement['setInstance']>[0];
};

const stepRoot = (el: Element): ShadowRoot => el.shadowRoot!;

const clickAction = (el: Element, action: string): void => {
  const button = stepRoot(el)?.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  expect(button).not.toBeNull();
  button?.click();
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Account step resetToFirstSubStep', () => {
  const mountAccount = async (overrides?: Record<string, unknown>): Promise<StepElement> => {
    const element = document.createElement('dialstack-onboarding-account') as StepElement;
    document.body.appendChild(element);
    element.setInstance(createBaseMocks(overrides));

    await waitFor(() => {
      // business-details substep has a location-name input
      expect(stepRoot(element)?.querySelector('#location-name')).not.toBeNull();
    });

    return element;
  };

  it('resets to business-details after enterReviewMode from team-members', async () => {
    const element = await mountAccount();

    // Navigate to team-members substep
    clickAction(element, 'next');
    await waitFor(() => {
      expect(stepRoot(element)?.querySelector('#new-user-name')).not.toBeNull();
    });

    // Mark step complete then enter review mode (simulates re-entering a completed step)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (element as any).isComplete = true;
    element.enterReviewMode();
    await element.refreshData();

    // Should be back on business-details
    await waitFor(() => {
      expect(stepRoot(element)?.querySelector('#location-name')).not.toBeNull();
    });
    expect(stepRoot(element)?.querySelector('#new-user-name')).toBeNull();
  });
});

describe('Numbers step resetToFirstSubStep', () => {
  const mountNumbers = async (overrides?: Record<string, unknown>): Promise<StepElement> => {
    const element = document.createElement('dialstack-onboarding-numbers') as StepElement;
    document.body.appendChild(element);
    element.setInstance(createBaseMocks(overrides));

    await waitFor(() => {
      const text = stepRoot(element)?.textContent ?? '';
      expect(text).not.toContain('Loading');
      expect(
        stepRoot(element)?.querySelector('[data-action="next"]') ||
          stepRoot(element)?.querySelector('[data-action]')
      ).toBeTruthy();
    });

    return element;
  };

  it('resets to overview after enterReviewMode from primary-did', async () => {
    const element = await mountNumbers();

    // Navigate from overview to primary-did
    clickAction(element, 'next');
    await waitFor(() => {
      expect(stepRoot(element)?.querySelector('.primary-did-section')).not.toBeNull();
    });

    // Mark step complete then enter review mode
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (element as any).isComplete = true;
    element.enterReviewMode();
    await element.refreshData();

    // Should be back on overview (has order/port action cards)
    await waitFor(() => {
      expect(stepRoot(element)?.querySelector('[data-action="num-start-order"]')).not.toBeNull();
    });
  });
});
