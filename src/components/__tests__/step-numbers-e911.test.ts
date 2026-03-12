/**
 * Tests for E911 auto-provisioning on the Numbers step completion screen.
 * E911 provisioning runs when the numbers step completes (not on the final "Wahoo!" screen).
 */

import { waitFor } from '@testing-library/react';
import '../account-onboarding/step-numbers';
import type { OnboardingStepBase } from '../account-onboarding/step-base';

type NumbersElement = OnboardingStepBase;

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

const mockDID = {
  id: 'did_01abc',
  phone_number: '+12125551001',
  status: 'active' as const,
  caller_id_name: 'ACME Corp',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// DID matching the account phone (212) 555-0100 -> +12125550100
const mockAccountDID = {
  id: 'did_02acct',
  phone_number: '+12125550100',
  status: 'active' as const,
  caller_id_name: 'ACME Corp',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const emptyList = {
  object: 'list',
  data: [],
  next_page_url: null,
  previous_page_url: null,
};

const createMockInstance = (overrides?: Record<string, unknown>) => {
  return {
    getAppearance: () => undefined,
    getAccount: jest.fn().mockResolvedValue(mockAccount),
    listUsers: jest.fn().mockResolvedValue(mockUsers),
    listExtensions: jest.fn().mockResolvedValue(mockExtensions),
    listLocations: jest.fn().mockResolvedValue([]),
    updateAccount: jest.fn().mockResolvedValue(mockAccount),
    updateLocation: jest.fn().mockResolvedValue(mockLocation),
    validateLocationE911: jest.fn().mockResolvedValue({ adjusted: false, address: {} }),
    provisionLocationE911: jest.fn().mockResolvedValue({
      ...mockLocation,
      e911_status: 'pending',
      primary_did_id: 'did_01abc',
    }),
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
    searchAvailableNumbers: jest.fn().mockResolvedValue([]),
    createPhoneNumberOrder: jest.fn().mockResolvedValue({
      id: 'no_01abc',
      order_type: 'purchase',
      status: 'complete',
      phone_numbers: ['+12125551001'],
      completed_numbers: ['+12125551001'],
      failed_numbers: [],
      error_message: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }),
    getPhoneNumberOrder: jest.fn().mockResolvedValue({
      id: 'no_01abc',
      order_type: 'purchase',
      status: 'complete',
      phone_numbers: ['+12125551001'],
      completed_numbers: ['+12125551001'],
      failed_numbers: [],
      error_message: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }),
    checkPortEligibility: jest.fn().mockResolvedValue({
      portable_numbers: [],
      non_portable_numbers: [],
    }),
    createPortOrder: jest.fn().mockResolvedValue({
      id: 'po_01abc',
      status: 'draft',
      details: { phone_numbers: [] },
      submitted_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }),
    updateCallerID: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Parameters<NumbersElement['setInstance']>[0];
};

const stepRoot = (el: Element): ShadowRoot => el.shadowRoot!;

const clickAction = (el: Element, action: string): void => {
  const button = stepRoot(el)?.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  expect(button).not.toBeNull();
  button?.click();
};

const mountNumbers = async (
  overrides?: Record<string, unknown>
): Promise<{
  element: NumbersElement;
  instance: ReturnType<typeof createMockInstance>;
}> => {
  const element = document.createElement('dialstack-onboarding-numbers') as NumbersElement;
  document.body.appendChild(element);
  const instance = createMockInstance(overrides);
  element.setInstance(instance);

  // Wait for loading to finish (numbers overview should render)
  await waitFor(() => {
    expect(
      stepRoot(element)?.querySelector('[data-action="next"]') ||
        stepRoot(element)?.querySelector('[data-action]')
    ).toBeTruthy();
    const text = stepRoot(element)?.textContent ?? '';
    expect(text).not.toContain('Loading');
  });

  return { element, instance };
};

/**
 * Navigate the numbers step to completion by clicking next through sub-steps.
 * Flow: overview -> primary-did -> (caller-id if DIDs exist) -> complete.
 * At each stage, wait for the next action to become available before clicking.
 */
const completeNumbersStep = async (element: NumbersElement): Promise<void> => {
  // Keep clicking next until we reach the step-complete screen
  const maxClicks = 10;
  for (let i = 0; i < maxClicks; i++) {
    // Check if we're at the step-complete screen
    if (stepRoot(element)?.querySelector('[data-action="done"]')) return;

    // Try skip button first (caller-id skip)
    const skipBtn = stepRoot(element)?.querySelector<HTMLButtonElement>(
      '[data-action="num-cid-skip"]'
    );
    if (skipBtn) {
      skipBtn.click();
      await waitFor(() => {
        expect(stepRoot(element)?.querySelector('[data-action="done"]')).toBeTruthy();
      });
      return;
    }

    // Click next
    const nextBtn = stepRoot(element)?.querySelector<HTMLButtonElement>('[data-action="next"]');
    if (!nextBtn) break;
    nextBtn.click();

    // Wait for UI to update
    await waitFor(() => {
      // Something should change
      expect(
        stepRoot(element)?.querySelector('[data-action="next"]') ||
          stepRoot(element)?.querySelector('[data-action="done"]') ||
          stepRoot(element)?.querySelector('[data-action="num-cid-skip"]')
      ).toBeTruthy();
    });
  }

  // Final wait for step-complete
  await waitFor(() => {
    expect(stepRoot(element)?.querySelector('[data-action="done"]')).toBeTruthy();
  });
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Numbers Step E911 Auto-Provisioning', () => {
  it('shows loading spinner during E911 provisioning', async () => {
    // Make E911 provisioning hang by returning a never-resolving promise for listLocations
    let resolveLocations: (value: unknown) => void;
    const locationsPromise = new Promise((resolve) => {
      resolveLocations = resolve;
    });

    const { element } = await mountNumbers({
      listLocations: jest.fn().mockReturnValue(locationsPromise),
      listPhoneNumbers: jest.fn().mockResolvedValue({
        ...emptyList,
        data: [mockAccountDID],
      }),
    });

    completeNumbersStep(element);

    // Should show loading state while E911 is running
    await waitFor(() => {
      const text = stepRoot(element)?.textContent ?? '';
      expect(text).toContain('E911');
    });

    // Cleanup
    resolveLocations!([mockLocation]);
  });

  it('shows success panel when provisioning succeeds (simple case)', async () => {
    const provisionedLocation = {
      ...mockLocation,
      primary_did_id: 'did_02acct',
      e911_status: 'pending' as const,
    };

    const { element, instance } = await mountNumbers({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
      listPhoneNumbers: jest.fn().mockResolvedValue({
        ...emptyList,
        data: [mockDID, mockAccountDID],
      }),
      updateLocation: jest.fn().mockResolvedValue(provisionedLocation),
      validateLocationE911: jest.fn().mockResolvedValue({
        adjusted: false,
        address: { house_number: '123', street_name: 'Main', city: 'New York' },
      }),
      provisionLocationE911: jest.fn().mockResolvedValue(provisionedLocation),
    });

    await completeNumbersStep(element);

    await waitFor(() => {
      const text = stepRoot(element)?.textContent ?? '';
      expect(text).toContain('assigned as primary number for');
    });

    expect(instance.updateLocation).toHaveBeenCalledWith('loc_01abc', {
      primary_did_id: 'did_02acct',
    });
    expect(instance.validateLocationE911).toHaveBeenCalledWith('loc_01abc');
    expect(instance.provisionLocationE911).toHaveBeenCalledWith('loc_01abc');
  });

  it('shows warning banner when provisioning hits complex case (multiple locations)', async () => {
    const secondLocation = {
      ...mockLocation,
      id: 'loc_02xyz',
      name: 'Branch Office',
    };

    const { element, instance } = await mountNumbers({
      listLocations: jest.fn().mockResolvedValue([mockLocation, secondLocation]),
      listPhoneNumbers: jest.fn().mockResolvedValue({
        ...emptyList,
        data: [mockDID],
      }),
    });

    await completeNumbersStep(element);

    await waitFor(() => {
      const text = stepRoot(element)?.textContent ?? '';
      expect(text).toContain('E911 emergency services have not been fully configured');
    });

    expect(instance.validateLocationE911).not.toHaveBeenCalled();
    expect(instance.provisionLocationE911).not.toHaveBeenCalled();
  });

  it('shows warning banner when no DID matches account phone and user selects none', async () => {
    const nonMatching1 = { ...mockDID, id: 'did_nm1', phone_number: '+13105550101' };
    const nonMatching2 = { ...mockDID, id: 'did_nm2', phone_number: '+13105550102' };

    const { element, instance } = await mountNumbers({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
      listPhoneNumbers: jest.fn().mockResolvedValue({
        ...emptyList,
        data: [nonMatching1, nonMatching2],
      }),
    });

    await completeNumbersStep(element);

    await waitFor(() => {
      const text = stepRoot(element)?.textContent ?? '';
      expect(text).toContain('E911 emergency services have not been fully configured');
    });

    expect(instance.updateLocation).not.toHaveBeenCalled();
    expect(instance.validateLocationE911).not.toHaveBeenCalled();
    expect(instance.provisionLocationE911).not.toHaveBeenCalled();
  });

  it('shows warning banner on provisioning API error', async () => {
    const { element, instance } = await mountNumbers({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
      listPhoneNumbers: jest.fn().mockResolvedValue({
        ...emptyList,
        data: [mockAccountDID],
      }),
      validateLocationE911: jest.fn().mockRejectedValue(new Error('Validation failed')),
    });

    await completeNumbersStep(element);

    await waitFor(() => {
      const text = stepRoot(element)?.textContent ?? '';
      expect(text).toContain('E911 emergency services have not been fully configured');
    });

    expect(instance.provisionLocationE911).not.toHaveBeenCalled();
  });

  it('"Done" button always present regardless of E911 state', async () => {
    const { element } = await mountNumbers({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
      listPhoneNumbers: jest.fn().mockResolvedValue({
        ...emptyList,
        data: [mockAccountDID],
      }),
      validateLocationE911: jest.fn().mockRejectedValue(new Error('Validation failed')),
    });

    await completeNumbersStep(element);

    // Done button should always be there
    await waitFor(() => {
      expect(stepRoot(element)?.querySelector('[data-action="done"]')).toBeTruthy();
    });
  });

  it('uses selectedPrimaryDIDId when available', async () => {
    const provisionedLocation = {
      ...mockLocation,
      primary_did_id: 'did_01abc',
      e911_status: 'pending' as const,
    };

    const { element, instance } = await mountNumbers({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
      listPhoneNumbers: jest.fn().mockResolvedValue({
        ...emptyList,
        data: [mockDID, mockAccountDID],
      }),
      updateLocation: jest.fn().mockResolvedValue(provisionedLocation),
      validateLocationE911: jest.fn().mockResolvedValue({
        adjusted: false,
        address: { house_number: '123', street_name: 'Main', city: 'New York' },
      }),
      provisionLocationE911: jest.fn().mockResolvedValue(provisionedLocation),
    });

    // Navigate to primary-did sub-step
    clickAction(element, 'next'); // overview -> primary-did

    await waitFor(() => {
      expect(stepRoot(element)?.querySelector('.primary-did-section')).not.toBeNull();
    });

    await waitFor(() => {
      const radios = stepRoot(element)?.querySelectorAll('input[name="primary-did"]');
      expect(radios?.length).toBeGreaterThan(0);
    });

    // Select non-account DID manually
    const otherRadio = stepRoot(element)?.querySelector<HTMLInputElement>(
      `input[name="primary-did"][value="did_01abc"]`
    );
    otherRadio!.checked = true;
    otherRadio!.dispatchEvent(new Event('change', { bubbles: true }));

    // Navigate to step complete (primary-did -> caller-id skip -> complete)
    clickAction(element, 'next'); // primary-did -> caller-id

    await waitFor(() => {
      // Wait for caller-id screen
      expect(
        stepRoot(element)?.querySelector('[data-action="num-cid-skip"]') ||
          stepRoot(element)?.querySelector('[data-action="next"]')
      ).toBeTruthy();
    });

    // Skip caller-id
    const skipBtn = stepRoot(element)?.querySelector<HTMLButtonElement>(
      '[data-action="num-cid-skip"]'
    );
    if (skipBtn) {
      skipBtn.click();
    } else {
      clickAction(element, 'next');
    }

    // Wait for step-complete with E911 result
    await waitFor(() => {
      const text = stepRoot(element)?.textContent ?? '';
      expect(text).toContain('assigned as primary number for');
    });

    // Should have used the manually selected DID
    expect(instance.updateLocation).toHaveBeenCalledWith('loc_01abc', {
      primary_did_id: 'did_01abc',
    });
  });

  it('falls back to account phone matching when no DID pre-selected', async () => {
    const provisionedLocation = {
      ...mockLocation,
      primary_did_id: 'did_02acct',
      e911_status: 'pending' as const,
    };

    const { element, instance } = await mountNumbers({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
      listPhoneNumbers: jest.fn().mockResolvedValue({
        ...emptyList,
        data: [mockAccountDID],
      }),
      updateLocation: jest.fn().mockResolvedValue(provisionedLocation),
      validateLocationE911: jest.fn().mockResolvedValue({
        adjusted: false,
        address: { house_number: '123', street_name: 'Main', city: 'New York' },
      }),
      provisionLocationE911: jest.fn().mockResolvedValue(provisionedLocation),
    });

    await completeNumbersStep(element);

    await waitFor(() => {
      const text = stepRoot(element)?.textContent ?? '';
      expect(text).toContain('assigned as primary number for');
    });

    // Should have used the account phone matched DID
    expect(instance.updateLocation).toHaveBeenCalledWith('loc_01abc', {
      primary_did_id: 'did_02acct',
    });
  });

  it('no E911 panel when no active DIDs (idle state)', async () => {
    const { element, instance } = await mountNumbers({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
      listPhoneNumbers: jest.fn().mockResolvedValue(emptyList),
    });

    await completeNumbersStep(element);

    // Done button should be present
    await waitFor(() => {
      expect(stepRoot(element)?.querySelector('[data-action="done"]')).toBeTruthy();
    });

    const text = stepRoot(element)?.textContent ?? '';
    expect(text).not.toContain('emergency services');
    expect(instance.validateLocationE911).not.toHaveBeenCalled();
    expect(instance.provisionLocationE911).not.toHaveBeenCalled();
  });

  it('retries E911 provisioning when primary DID assigned but E911 failed', async () => {
    const locationWithDIDButFailed = {
      ...mockLocation,
      primary_did_id: 'did_01abc',
      e911_status: 'failed' as const,
    };
    const provisionedLocation = {
      ...mockLocation,
      primary_did_id: 'did_01abc',
      e911_status: 'pending' as const,
    };

    const { element, instance } = await mountNumbers({
      listLocations: jest.fn().mockResolvedValue([locationWithDIDButFailed]),
      listPhoneNumbers: jest.fn().mockResolvedValue({
        ...emptyList,
        data: [mockDID],
      }),
      validateLocationE911: jest.fn().mockResolvedValue({
        adjusted: false,
        address: { house_number: '123', street_name: 'Main', city: 'New York' },
      }),
      provisionLocationE911: jest.fn().mockResolvedValue(provisionedLocation),
    });

    await completeNumbersStep(element);

    await waitFor(() => {
      const text = stepRoot(element)?.textContent ?? '';
      expect(text).toContain('E911');
    });

    // Should NOT call updateLocation (DID already assigned)
    expect(instance.updateLocation).not.toHaveBeenCalled();
    // Should retry validation and provisioning
    expect(instance.validateLocationE911).toHaveBeenCalledWith('loc_01abc');
    expect(instance.provisionLocationE911).toHaveBeenCalledWith('loc_01abc');
  });

  it('shows address standardized disclosure when adjusted', async () => {
    const provisionedLocation = {
      ...mockLocation,
      primary_did_id: 'did_02acct',
      e911_status: 'provisioned' as const,
    };

    const { element } = await mountNumbers({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
      listPhoneNumbers: jest.fn().mockResolvedValue({
        ...emptyList,
        data: [mockAccountDID],
      }),
      updateLocation: jest.fn().mockResolvedValue(provisionedLocation),
      validateLocationE911: jest.fn().mockResolvedValue({
        adjusted: true,
        address: { house_number: '123', street_name: 'Main', city: 'New York' },
      }),
      provisionLocationE911: jest.fn().mockResolvedValue(provisionedLocation),
    });

    await completeNumbersStep(element);

    await waitFor(() => {
      const text = stepRoot(element)?.textContent ?? '';
      expect(text).toContain('address was standardized');
    });
  });

  it('aborts E911 provisioning when component is destroyed mid-flight', async () => {
    // listLocations blocks until we resolve — gives time to destroy mid-flow
    let resolveLocations!: (v: unknown[]) => void;
    const locationsPromise = new Promise<unknown[]>((r) => {
      resolveLocations = r;
    });

    const { element, instance } = await mountNumbers({
      listLocations: jest.fn().mockReturnValue(locationsPromise),
      listPhoneNumbers: jest.fn().mockResolvedValue({
        ...emptyList,
        data: [mockDID],
      }),
    });

    await completeNumbersStep(element);

    // E911 flow started — listLocations is pending. Destroy the component.
    (element as unknown as { destroy: () => void }).destroy();

    // Now resolve listLocations — the flow should abort, not call write APIs
    resolveLocations([mockLocation]);
    await new Promise((r) => setTimeout(r, 50));

    expect(instance.updateLocation).not.toHaveBeenCalled();
    expect(instance.validateLocationE911).not.toHaveBeenCalled();
    expect(instance.provisionLocationE911).not.toHaveBeenCalled();
    // Shadow root stays empty after destroy
    expect(element.shadowRoot?.innerHTML ?? '').toBe('');
  });

  it('aborts E911 provisioning when component is detached from DOM', async () => {
    let resolveLocations!: (v: unknown[]) => void;
    const locationsPromise = new Promise<unknown[]>((r) => {
      resolveLocations = r;
    });

    const { element, instance } = await mountNumbers({
      listLocations: jest.fn().mockReturnValue(locationsPromise),
      listPhoneNumbers: jest.fn().mockResolvedValue({
        ...emptyList,
        data: [mockDID],
      }),
    });

    await completeNumbersStep(element);

    // Detach the element (triggers disconnectedCallback → cleanupStep → generation bump)
    element.parentNode?.removeChild(element);

    // Resolve pending listLocations — should be cancelled by generation mismatch
    resolveLocations([mockLocation]);
    await new Promise((r) => setTimeout(r, 50));

    expect(instance.updateLocation).not.toHaveBeenCalled();
    expect(instance.validateLocationE911).not.toHaveBeenCalled();
    expect(instance.provisionLocationE911).not.toHaveBeenCalled();
  });
});
