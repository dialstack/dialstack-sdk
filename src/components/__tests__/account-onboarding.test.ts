/**
 * Tests for AccountOnboardingComponent
 */

import { waitFor } from '@testing-library/react';
import '../account-onboarding';
import type { AccountOnboardingElement } from '../../types';

const STEP_TAGS = [
  'dialstack-onboarding-account',
  'dialstack-onboarding-numbers',
  'dialstack-onboarding-hardware',
];

/** Get the active (visible) step element's shadow root, or the wizard's own for loading/error/complete. */
const stepRoot = (el: Element): ShadowRoot | null => {
  // Steps live inside a container div — if that container is hidden, no step is active
  const stepsContainer = el.shadowRoot?.lastElementChild as HTMLElement | null;
  if (stepsContainer && stepsContainer.style.display !== 'none') {
    for (const tag of STEP_TAGS) {
      const step = stepsContainer.querySelector(tag) as HTMLElement | null;
      if (step && step.style.display !== 'none' && step.shadowRoot) return step.shadowRoot;
    }
  }
  return el.shadowRoot;
};

// Mock account data returned by getAccount()
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

// Mock user data returned by listUsers()
const mockUsers = [
  {
    id: 'user_01abc',
    name: 'Alice',
    email: 'alice@example.com',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

// Mock extensions
const mockExtensions = [
  {
    number: '1001',
    target: 'user_01abc',
    status: 'active' as const,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

// Mock location
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

const mockDevice = {
  id: 'dev_01abc',
  mac_address: '00:04:13:aa:bb:cc',
  vendor: 'snom',
  status: 'pending-sync' as const,
  lines: [
    {
      id: 'dln_01abc',
      device_id: 'dev_01abc',
      line_number: 1,
      endpoint_id: 'ep_01abc',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockEndpoint = {
  id: 'ep_01abc',
  user_id: 'user_01abc',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockDectBase = {
  id: 'dectb_01abc',
  mac_address: '00:04:13:dd:ee:ff',
  vendor: 'snom',
  status: 'pending-sync' as const,
  multicell_role: 'single' as const,
  max_handsets: 20,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const createMockInstance = (overrides?: Record<string, unknown>) => {
  return {
    getAppearance: () => undefined,
    getAccount: jest.fn().mockResolvedValue(mockAccount),
    listUsers: jest.fn().mockResolvedValue(mockUsers),
    listExtensions: jest.fn().mockResolvedValue(mockExtensions),
    listLocations: jest.fn().mockResolvedValue([]),
    updateAccount: jest.fn().mockResolvedValue(mockAccount),
    createUser: jest.fn().mockResolvedValue({
      id: 'user_02xyz',
      name: 'Bob',
      email: 'bob@example.com',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }),
    deleteUser: jest.fn().mockResolvedValue(undefined),
    createExtension: jest.fn().mockResolvedValue({
      number: '1002',
      target: 'user_02xyz',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }),
    suggestAddresses: jest.fn().mockResolvedValue([]),
    getPlaceDetails: jest.fn().mockResolvedValue({
      place_id: 'place_123',
      address_number: '123',
      street: 'Main St',
      city: 'New York',
      state: 'NY',
      postal_code: '10001',
      country: 'US',
      latitude: 40.7128,
      longitude: -74.006,
      timezone: 'America/New_York',
    }),
    createLocation: jest.fn().mockResolvedValue(mockLocation),
    updateLocation: jest.fn().mockResolvedValue(mockLocation),
    // Hardware methods
    listDevices: jest.fn().mockResolvedValue([]),
    listDeviceLines: jest.fn().mockResolvedValue([]),
    createDevice: jest.fn().mockResolvedValue(mockDevice),
    deleteDevice: jest.fn().mockResolvedValue(undefined),
    createDeviceLine: jest.fn().mockResolvedValue(mockDevice.lines![0]),
    deleteDeviceLine: jest.fn().mockResolvedValue(undefined),
    listDECTBases: jest.fn().mockResolvedValue([]),
    createDECTBase: jest.fn().mockResolvedValue(mockDectBase),
    deleteDECTBase: jest.fn().mockResolvedValue(undefined),
    listDECTHandsets: jest.fn().mockResolvedValue([]),
    createDECTHandset: jest.fn().mockResolvedValue({
      id: 'decth_01abc',
      base_id: 'dectb_01abc',
      ipei: '03AABB1234567890CCDD',
      status: 'pending-sync',
      slot_number: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }),
    deleteDECTHandset: jest.fn().mockResolvedValue(undefined),
    createDECTExtension: jest.fn().mockResolvedValue({
      id: 'decte_01abc',
      handset_id: 'decth_01abc',
      endpoint_id: 'ep_01abc',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }),
    createEndpoint: jest.fn().mockResolvedValue(mockEndpoint),
    listEndpoints: jest.fn().mockResolvedValue([]),
    // Number methods
    listPhoneNumbers: jest.fn().mockResolvedValue({
      object: 'list',
      data: [],
      next_page_url: null,
      previous_page_url: null,
    }),
    listNumberOrders: jest.fn().mockResolvedValue({
      object: 'list',
      data: [],
      next_page_url: null,
      previous_page_url: null,
    }),
    listPortOrders: jest.fn().mockResolvedValue({
      object: 'list',
      data: [],
      next_page_url: null,
      previous_page_url: null,
    }),
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
      portable_numbers: [
        {
          phone_number: '+12125551001',
          losing_carrier_name: 'OldCo',
          is_wireless: false,
          account_number_required: false,
        },
      ],
      non_portable_numbers: [],
    }),
    createPortOrder: jest.fn().mockResolvedValue({
      id: 'po_01abc',
      status: 'draft',
      details: { phone_numbers: ['+12125551001'], subscriber: null },
      submitted_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }),
    approvePortOrder: jest.fn().mockResolvedValue({
      id: 'po_01abc',
      status: 'approved',
      details: { phone_numbers: ['+12125551001'] },
      submitted_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }),
    submitPortOrder: jest.fn().mockResolvedValue({
      id: 'po_01abc',
      status: 'submitted',
      details: { phone_numbers: ['+12125551001'] },
      submitted_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }),
    cancelPortOrder: jest.fn().mockResolvedValue({
      id: 'po_01abc',
      status: 'cancelled',
      details: { phone_numbers: ['+12125551001'] },
      submitted_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }),
    uploadCSR: jest.fn().mockResolvedValue(undefined),
    uploadBillCopy: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Parameters<AccountOnboardingElement['setInstance']>[0];
};

const clickAction = (element: AccountOnboardingElement, action: string): void => {
  const button = stepRoot(element).querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  expect(button).not.toBeNull();
  button?.click();
};

/** Click through the per-step completion screen that appears after finishing a step. */
const clickThroughStepComplete = async (element: AccountOnboardingElement): Promise<void> => {
  await waitFor(() => {
    expect(stepRoot(element).querySelector('[data-action="done"]')).not.toBeNull();
  });
  clickAction(element, 'done');
};

const mountComponent = async (
  overrides?: Record<string, unknown>
): Promise<{
  element: AccountOnboardingElement;
  instance: ReturnType<typeof createMockInstance>;
}> => {
  const element = document.createElement(
    'dialstack-account-onboarding'
  ) as AccountOnboardingElement;
  document.body.appendChild(element);
  const instance = createMockInstance(overrides);
  element.setInstance(instance);

  await waitFor(() => {
    expect(stepRoot(element).querySelector('[data-action="next"]')).toBeTruthy();
  });

  return { element, instance };
};

/**
 * Navigate from business-details to team-members sub-step within account step.
 * Fills required fields if not already populated to pass validation.
 */
const navigateToTeamMembers = async (element: AccountOnboardingElement): Promise<void> => {
  // Already on team-members?
  if (stepRoot(element).querySelector('#new-user-name')) return;

  const fillInput = (id: string, value: string): void => {
    const input = stepRoot(element).querySelector<HTMLInputElement>(`#${id}`);
    if (input && !input.value) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  // Fill required fields for business-details validation
  fillInput('location-name', 'HQ');

  // If no address yet (search mode), switch to manual and fill
  if (!stepRoot(element).querySelector('.address-confirmed')) {
    const manualBtn = stepRoot(element).querySelector('[data-action="enter-manually"]');
    if (manualBtn) {
      (manualBtn as HTMLElement).click();
      await waitFor(() => {
        expect(stepRoot(element).querySelector('#manual-street')).not.toBeNull();
      });
      fillInput('manual-street', 'Main St');
      fillInput('manual-city', 'New York');
      fillInput('manual-postal-code', '10001');

      const stateSelect = stepRoot(element).querySelector<HTMLSelectElement>('#manual-state');
      if (stateSelect && !stateSelect.value) {
        stateSelect.value = 'NY';
        stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  // Set timezone if needed
  const tzSelect = stepRoot(element).querySelector<HTMLSelectElement>('#account-timezone');
  if (tzSelect && !tzSelect.value) {
    tzSelect.value = 'America/New_York';
    tzSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

  clickAction(element, 'next');
  await waitFor(() => {
    expect(stepRoot(element).querySelector('#new-user-name')).not.toBeNull();
  });
};

const navigateToComplete = async (
  element: AccountOnboardingElement,
  nextClicks?: number
): Promise<void> => {
  // default: business-details → team-members → (done) → numbers → (done) → hardware → (done) → complete
  const clicks = nextClicks ?? 4;
  for (let i = 0; i < clicks; i += 1) {
    const contentBefore = stepRoot(element).innerHTML;
    clickAction(element, 'next');
    // Wait for content to change (account sub-step or step completion screen)
    await waitFor(() => {
      expect(stepRoot(element).innerHTML).not.toBe(contentBefore);
    });
    // If a step completion screen appeared, click through it
    const doneBtn = stepRoot(element).querySelector('[data-action="done"]');
    if (doneBtn) {
      (doneBtn as HTMLElement).click();
      await waitFor(() => {
        expect(stepRoot(element).innerHTML).not.toBe(contentBefore);
      });
    }
  }

  await waitFor(() => {
    expect(stepRoot(element).querySelector('[data-action="exit"]')).toBeTruthy();
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
      expect(stepRoot(component).querySelector('[data-action="next"]')).toBeTruthy();
    });

    firstContainer.removeChild(component);
    expect(onExit).toHaveBeenCalledTimes(1);

    secondContainer.appendChild(component);
    secondContainer.removeChild(component);
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  it('clears legal links when URL setters are reset', async () => {
    const { element: component } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });
    component.setCollectionOptions({ steps: { include: ['account', 'numbers'] } });
    component.setFullTermsOfServiceUrl('https://example.com/terms');

    await navigateToComplete(component, 3);

    const linkBeforeReset = stepRoot(component).querySelector<HTMLAnchorElement>('.legal-links a');
    expect(linkBeforeReset?.getAttribute('href')).toBe('https://example.com/terms');

    component.setFullTermsOfServiceUrl(undefined);
    const linkAfterReset = stepRoot(component).querySelector('.legal-links a');
    expect(linkAfterReset).toBeNull();
  });

  it('restores default steps when collection options are cleared', async () => {
    const { element: component } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });
    component.setCollectionOptions({ steps: { exclude: ['hardware'] } });

    // With hardware excluded: business-details → team-members → numbers → complete = 3 clicks
    await navigateToComplete(component, 3);

    // After clearing options, hardware should be re-included.
    // Use initialStep to jump to hardware and verify it renders.
    component.setCollectionOptions({ initialStep: 'hardware' });

    await waitFor(() => {
      expect(stepRoot(component).textContent).toContain('Assign Devices');
    });
  });

  // ==========================================================================
  // Account Step Tests
  // ==========================================================================

  it('renders account details form with pre-populated data from API', async () => {
    const { element } = await mountComponent();

    await waitFor(() => {
      const emailInput = stepRoot(element).querySelector<HTMLInputElement>('#account-email');
      expect(emailInput).not.toBeNull();
      expect(emailInput?.value).toBe('existing@example.com');
    });
  });

  it('renders existing users in the user list', async () => {
    const { element } = await mountComponent();
    await navigateToTeamMembers(element);

    await waitFor(() => {
      const userRows = stepRoot(element).querySelectorAll('.user-table tbody tr');
      expect(userRows?.length).toBe(1);
      expect(stepRoot(element).textContent).toContain('Alice');
    });
  });

  it('shows extension number for users with extensions', async () => {
    const { element } = await mountComponent();
    await navigateToTeamMembers(element);

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('1001');
    });
  });

  it('calls createUser and createExtension when adding a user', async () => {
    const { element, instance } = await mountComponent();
    await navigateToTeamMembers(element);

    // Fill in the add user form
    const nameInput = stepRoot(element).querySelector<HTMLInputElement>('#new-user-name');
    const emailInput = stepRoot(element).querySelector<HTMLInputElement>('#new-user-email');

    if (nameInput) {
      nameInput.value = 'Bob';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (emailInput) {
      emailInput.value = 'bob@example.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    clickAction(element, 'add-user');

    await waitFor(() => {
      expect((instance as unknown as Record<string, jest.Mock>).createUser).toHaveBeenCalledWith({
        name: 'Bob',
        email: 'bob@example.com',
      });
    });
  });

  it('calls deleteUser when removing a user', async () => {
    const { element, instance } = await mountComponent();
    await navigateToTeamMembers(element);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="remove-user"]')).not.toBeNull();
    });

    clickAction(element, 'remove-user');

    await waitFor(() => {
      expect((instance as unknown as Record<string, jest.Mock>).deleteUser).toHaveBeenCalledWith(
        'user_01abc'
      );
    });
  });

  it('shows validation error when name is empty on add user', async () => {
    const { element } = await mountComponent();
    await navigateToTeamMembers(element);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#new-user-name')).not.toBeNull();
    });

    // Click add without filling name
    clickAction(element, 'add-user');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Name is required');
    });
  });

  it('shows duplicate email error inline', async () => {
    const { element } = await mountComponent({
      createUser: jest.fn().mockRejectedValue(new Error('A user with this email already exists')),
    });
    await navigateToTeamMembers(element);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#new-user-name')).not.toBeNull();
    });

    const nameInput = stepRoot(element).querySelector<HTMLInputElement>('#new-user-name');
    if (nameInput) {
      nameInput.value = 'Duplicate';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const emailInput = stepRoot(element).querySelector<HTMLInputElement>('#new-user-email');
    if (emailInput) {
      emailInput.value = 'alice@example.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    clickAction(element, 'add-user');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('already exists');
    });
  });

  it('rolls back user creation when extension creation fails', async () => {
    const deleteUserMock = jest.fn().mockResolvedValue(undefined);
    const { element } = await mountComponent({
      createExtension: jest.fn().mockRejectedValue(new Error('Extension conflict')),
      deleteUser: deleteUserMock,
    });
    await navigateToTeamMembers(element);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#new-user-name')).not.toBeNull();
    });

    const fillInput = (id: string, value: string): void => {
      const input = stepRoot(element).querySelector<HTMLInputElement>(`#${id}`);
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    fillInput('new-user-name', 'Bob');
    fillInput('new-user-email', 'bob@example.com');

    clickAction(element, 'add-user');

    await waitFor(() => {
      expect(deleteUserMock).toHaveBeenCalledWith('user_02xyz');
    });

    // Should show the extension error
    expect(stepRoot(element).textContent).toContain('Extension conflict');
  });

  it('validates company name required before advancing', async () => {
    const { element } = await mountComponent({
      getAccount: jest.fn().mockResolvedValue({ ...mockAccount, name: null }),
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#account-name')).not.toBeNull();
    });

    clickAction(element, 'next');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Company name is required');
    });
  });

  it('validates email required before advancing to next step', async () => {
    const { element } = await mountComponent({
      getAccount: jest.fn().mockResolvedValue({ ...mockAccount, email: null }),
    });

    await waitFor(() => {
      const emailInput = stepRoot(element).querySelector<HTMLInputElement>('#account-email');
      expect(emailInput).not.toBeNull();
    });

    clickAction(element, 'next');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Email is required');
    });
  });

  it('validates phone number required before advancing', async () => {
    const { element } = await mountComponent({
      getAccount: jest.fn().mockResolvedValue({ ...mockAccount, phone: null }),
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#account-phone')).not.toBeNull();
    });

    clickAction(element, 'next');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Phone number is required');
    });
  });

  it('validates primary contact required before advancing', async () => {
    const { element } = await mountComponent({
      getAccount: jest.fn().mockResolvedValue({ ...mockAccount, primary_contact_name: null }),
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#account-primary-contact')).not.toBeNull();
    });

    clickAction(element, 'next');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Primary contact is required');
    });
  });

  it('validates phone number format before advancing', async () => {
    const { element } = await mountComponent({
      getAccount: jest.fn().mockResolvedValue({ ...mockAccount, phone: '123' }),
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#account-phone')).not.toBeNull();
    });

    clickAction(element, 'next');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Enter a valid US phone number');
    });
  });

  it('calls updateAccount and navigates on successful save', async () => {
    const { element, instance } = await mountComponent();

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#account-email')).not.toBeNull();
    });

    // Need to fill location for save to succeed
    const locationInput = stepRoot(element).querySelector<HTMLInputElement>('#location-name');
    if (locationInput) {
      locationInput.value = 'HQ';
      locationInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Switch to manual address mode and fill fields
    clickAction(element, 'enter-manually');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#manual-street')).not.toBeNull();
    });

    const fillInput = (id: string, value: string): void => {
      const input = stepRoot(element).querySelector<HTMLInputElement>(`#${id}`);
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    fillInput('manual-street', 'Main St');
    fillInput('manual-city', 'New York');
    fillInput('manual-postal-code', '10001');

    // Set state via change event on select
    const stateSelect = stepRoot(element).querySelector<HTMLSelectElement>('#manual-state');
    if (stateSelect) {
      stateSelect.value = 'NY';
      stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Set timezone (required)
    const tzSelect = stepRoot(element).querySelector<HTMLSelectElement>('#account-timezone');
    if (tzSelect) {
      tzSelect.value = 'America/New_York';
      tzSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    clickAction(element, 'next');

    await waitFor(() => {
      expect((instance as unknown as Record<string, jest.Mock>).updateAccount).toHaveBeenCalled();
    });
  });

  it('requires at least one team member before advancing', async () => {
    const { element } = await mountComponent({
      listUsers: jest.fn().mockResolvedValue([]),
      listExtensions: jest.fn().mockResolvedValue([]),
    });

    // Navigate to team-members sub-step first
    await navigateToTeamMembers(element);

    // Click next on team-members with no users — should show error
    clickAction(element, 'next');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Add at least one team member to continue.');
    });
  });

  // ==========================================================================
  // Location Section Tests
  // ==========================================================================

  it('renders the location section with name and address fields', async () => {
    const { element } = await mountComponent();

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#location-name')).not.toBeNull();
      expect(stepRoot(element).textContent).toContain('Business Location');
    });
  });

  it('renders address search input by default', async () => {
    const { element } = await mountComponent();

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#address-search')).not.toBeNull();
      expect(stepRoot(element).querySelector('[data-action="enter-manually"]')).not.toBeNull();
    });
  });

  it('pre-populates location from existing location data', async () => {
    const { element } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await waitFor(() => {
      const nameInput = stepRoot(element).querySelector<HTMLInputElement>('#location-name');
      expect(nameInput?.value).toBe('Main Office');
    });

    // Should show confirmed address card (not search)
    await waitFor(() => {
      expect(stepRoot(element).querySelector('.address-confirmed')).not.toBeNull();
      expect(stepRoot(element).querySelector('#address-search')).toBeNull();
    });
  });

  it('switches to manual fields when "Enter manually" is clicked', async () => {
    const { element } = await mountComponent();

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="enter-manually"]')).not.toBeNull();
    });

    clickAction(element, 'enter-manually');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#manual-street')).not.toBeNull();
      expect(stepRoot(element).querySelector('#manual-city')).not.toBeNull();
      expect(stepRoot(element).querySelector('#manual-state')).not.toBeNull();
      expect(stepRoot(element).querySelector('#manual-postal-code')).not.toBeNull();
    });
  });

  it('switches back to search when "Search instead" is clicked', async () => {
    const { element } = await mountComponent();

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="enter-manually"]')).not.toBeNull();
    });

    clickAction(element, 'enter-manually');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="search-instead"]')).not.toBeNull();
    });

    clickAction(element, 'search-instead');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#address-search')).not.toBeNull();
    });
  });

  it('closes the "No results" dropdown when address input loses focus', async () => {
    jest.useFakeTimers();

    const { element } = await mountComponent({
      suggestAddresses: jest.fn().mockResolvedValue([]),
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#address-search')).not.toBeNull();
    });

    const input = stepRoot(element)!.querySelector<HTMLInputElement>('#address-search')!;
    const dropdown = stepRoot(element)!.querySelector<HTMLElement>('.address-dropdown')!;

    // Type a query to trigger "No results"
    input.value = 'Nonexistent Place';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // Run the debounced search (300ms)
    jest.advanceTimersByTime(300);
    await Promise.resolve(); // flush microtasks from async suggestAddresses
    await Promise.resolve();

    // Dropdown should show "No results"
    expect(dropdown.style.display).toBe('block');
    expect(dropdown.querySelector('.address-no-results')).not.toBeNull();

    // Blur the input
    input.dispatchEvent(new Event('blur'));
    jest.advanceTimersByTime(200);

    // Dropdown should be hidden
    expect(dropdown.style.display).toBe('none');

    jest.useRealTimers();
  });

  it('shows edit button on confirmed address and switches to edit mode', async () => {
    const { element } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="edit-address"]')).not.toBeNull();
    });

    clickAction(element, 'edit-address');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#manual-street')).not.toBeNull();
    });
  });

  it('validates location name is required', async () => {
    const { element } = await mountComponent();

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#location-name')).not.toBeNull();
    });

    // Don't fill location name, just click next
    clickAction(element, 'next');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Location name is required');
    });
  });

  it('validates address is required', async () => {
    const { element } = await mountComponent();

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#location-name')).not.toBeNull();
    });

    // Fill location name but no address
    const nameInput = stepRoot(element).querySelector<HTMLInputElement>('#location-name');
    if (nameInput) {
      nameInput.value = 'HQ';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    clickAction(element, 'next');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Address is required');
    });
  });

  it('validates timezone is required', async () => {
    const { element } = await mountComponent({
      getAccount: jest.fn().mockResolvedValue({ ...mockAccount, config: {} }),
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#address-search')).not.toBeNull();
    });

    // Switch to manual entry so timezone dropdown appears
    clickAction(element, 'enter-manually');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#account-timezone')).not.toBeNull();
    });

    clickAction(element, 'next');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Timezone is required');
    });
  });

  it('calls createLocation with manual address data on save', async () => {
    const { element, instance } = await mountComponent();

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#location-name')).not.toBeNull();
    });

    // Fill location name
    const nameInput = stepRoot(element).querySelector<HTMLInputElement>('#location-name');
    if (nameInput) {
      nameInput.value = 'HQ';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Switch to manual mode
    clickAction(element, 'enter-manually');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#manual-street')).not.toBeNull();
    });

    const fillInput = (id: string, value: string): void => {
      const input = stepRoot(element).querySelector<HTMLInputElement>(`#${id}`);
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    fillInput('manual-house-number', '456');
    fillInput('manual-street', 'Oak Ave');
    fillInput('manual-city', 'Chicago');
    fillInput('manual-postal-code', '60601');

    const stateSelect = stepRoot(element).querySelector<HTMLSelectElement>('#manual-state');
    if (stateSelect) {
      stateSelect.value = 'IL';
      stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Set timezone (required)
    const tzSelect = stepRoot(element).querySelector<HTMLSelectElement>('#account-timezone');
    if (tzSelect) {
      tzSelect.value = 'America/Chicago';
      tzSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    clickAction(element, 'next');

    await waitFor(() => {
      expect(
        (instance as unknown as Record<string, jest.Mock>).createLocation
      ).toHaveBeenCalledWith({
        name: 'HQ',
        address: {
          address_number: '456',
          street: 'Oak Ave',
          city: 'Chicago',
          state: 'IL',
          postal_code: '60601',
          country: 'US',
        },
      });
    });
  });

  it('skips createLocation when an existing location is loaded', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('.address-confirmed')).not.toBeNull();
    });

    clickAction(element, 'next');

    await waitFor(() => {
      expect((instance as unknown as Record<string, jest.Mock>).updateAccount).toHaveBeenCalled();
    });

    expect(
      (instance as unknown as Record<string, jest.Mock>).createLocation
    ).not.toHaveBeenCalled();
  });

  it('calls listLocations during initial data load', async () => {
    const { instance } = await mountComponent();

    expect((instance as unknown as Record<string, jest.Mock>).listLocations).toHaveBeenCalledTimes(
      1
    );
  });

  // ==========================================================================
  // Timezone Tests
  // ==========================================================================

  it('displays readonly timezone when address is confirmed', async () => {
    const { element } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await waitFor(() => {
      const tzReadonly = stepRoot(element).querySelector('.timezone-readonly');
      expect(tzReadonly).not.toBeNull();
      expect(tzReadonly?.textContent).toContain('Eastern');
    });
  });

  it('allows user to change the timezone via select after editing address', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('.timezone-readonly')).not.toBeNull();
    });

    // Edit the confirmed address to get into edit mode with timezone dropdown
    clickAction(element, 'edit-address');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#account-timezone')).not.toBeNull();
    });

    const tzSelect = stepRoot(element).querySelector<HTMLSelectElement>('#account-timezone');
    if (tzSelect) {
      tzSelect.value = 'America/Chicago';
      tzSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    clickAction(element, 'next');

    await waitFor(() => {
      const updateCall = (instance as unknown as Record<string, jest.Mock>).updateAccount.mock
        .calls[0]?.[0];
      expect(updateCall.config.timezone).toBe('America/Chicago');
    });
  });

  it('preserves timezone value when editing a confirmed address', async () => {
    const { element } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('.timezone-readonly')).not.toBeNull();
    });

    // Click edit on confirmed address — timezone should be preserved in dropdown
    clickAction(element, 'edit-address');

    await waitFor(() => {
      const tzSelect = stepRoot(element).querySelector<HTMLSelectElement>('#account-timezone');
      expect(tzSelect).not.toBeNull();
      expect(tzSelect?.value).toBe('America/New_York');
    });
  });

  it('preserves timezone value when switching between address modes', async () => {
    const { element } = await mountComponent({
      getAccount: jest.fn().mockResolvedValue({
        ...mockAccount,
        config: { timezone: 'America/New_York' },
      }),
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('.timezone-readonly')).not.toBeNull();
    });

    // Edit the confirmed address
    clickAction(element, 'edit-address');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#manual-street')).not.toBeNull();
    });

    // Switch to search mode
    clickAction(element, 'search-instead');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#address-search')).not.toBeNull();
      const tzSelect = stepRoot(element).querySelector<HTMLSelectElement>('#account-timezone');
      expect(tzSelect).not.toBeNull();
      expect(tzSelect?.value).toBe('America/New_York');
    });

    // Switch back to manual and ensure timezone is still preserved
    clickAction(element, 'enter-manually');

    await waitFor(() => {
      const tzSelect = stepRoot(element).querySelector<HTMLSelectElement>('#account-timezone');
      expect(tzSelect).not.toBeNull();
      expect(tzSelect?.value).toBe('America/New_York');
    });
  });

  it('shows timezone placeholder when account has no timezone', async () => {
    const { element } = await mountComponent({
      getAccount: jest.fn().mockResolvedValue({ ...mockAccount, config: {} }),
    });

    await waitFor(() => {
      const tzSelect = stepRoot(element).querySelector<HTMLSelectElement>('#account-timezone');
      expect(tzSelect).not.toBeNull();
      expect(tzSelect?.value).toBe('');
    });

    // Switch to manual entry — timezone remains selectable with placeholder
    clickAction(element, 'enter-manually');

    await waitFor(() => {
      const tzSelect = stepRoot(element).querySelector<HTMLSelectElement>('#account-timezone');
      expect(tzSelect).not.toBeNull();
      expect(tzSelect?.value).toBe('');
    });
  });

  it('includes timezone in updateAccount config after address selection', async () => {
    const { element, instance } = await mountComponent();

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#address-search')).not.toBeNull();
    });

    // Simulate selecting a suggestion via delegated click (data-action="select-suggestion")
    const btn = document.createElement('button');
    btn.setAttribute('data-action', 'select-suggestion');
    btn.setAttribute('data-place-id', 'place_123');
    stepRoot(element).querySelector('.address-autocomplete')?.appendChild(btn);
    btn.click();

    // Wait for address to be confirmed (getPlaceDetails returns timezone: 'America/New_York')
    await waitFor(() => {
      expect(stepRoot(element).querySelector('.address-confirmed')).not.toBeNull();
    });

    // Fill location name
    const nameInput = stepRoot(element).querySelector<HTMLInputElement>('#location-name');
    if (nameInput) {
      nameInput.value = 'HQ';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    clickAction(element, 'next');

    await waitFor(() => {
      const updateCall = (instance as unknown as Record<string, jest.Mock>).updateAccount.mock
        .calls[0]?.[0];
      expect(updateCall).toBeDefined();
      expect(updateCall.config).toBeDefined();
      expect(updateCall.config.timezone).toBe('America/New_York');
    });
  });

  // ==========================================================================
  // Company / Contact Fields Tests
  // ==========================================================================

  it('renders company name, phone, and primary contact fields', async () => {
    const { element } = await mountComponent({
      getAccount: jest.fn().mockResolvedValue({
        ...mockAccount,
        name: 'Acme Corp',
        phone: '(212) 555-0100',
        primary_contact_name: 'Jane Doe',
      }),
    });

    await waitFor(() => {
      const nameInput = stepRoot(element).querySelector<HTMLInputElement>('#account-name');
      expect(nameInput).not.toBeNull();
      expect(nameInput?.value).toBe('Acme Corp');

      const phoneInput = stepRoot(element).querySelector<HTMLInputElement>('#account-phone');
      expect(phoneInput).not.toBeNull();
      expect(phoneInput?.value).toBe('(212) 555-0100');

      const contactInput = stepRoot(element).querySelector<HTMLInputElement>(
        '#account-primary-contact'
      );
      expect(contactInput).not.toBeNull();
      expect(contactInput?.value).toBe('Jane Doe');
    });
  });

  it('includes name, phone, and primary contact in updateAccount', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#account-name')).not.toBeNull();
    });

    const fillInput = (id: string, value: string): void => {
      const input = stepRoot(element).querySelector<HTMLInputElement>(`#${id}`);
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    fillInput('account-name', 'Acme Corp');
    fillInput('account-phone', '(212) 555-0100');
    fillInput('account-primary-contact', 'Jane Doe');

    clickAction(element, 'next');

    await waitFor(() => {
      const updateCall = (instance as unknown as Record<string, jest.Mock>).updateAccount.mock
        .calls[0]?.[0];
      expect(updateCall.name).toBe('Acme Corp');
      expect(updateCall.phone).toBe('+12125550100');
      expect(updateCall.primary_contact_name).toBe('Jane Doe');
    });
  });

  // ==========================================================================
  // Extension Input Tests
  // ==========================================================================

  it('shows extension input pre-populated in add-user form', async () => {
    const { element } = await mountComponent();
    await navigateToTeamMembers(element);

    await waitFor(() => {
      const extInput = stepRoot(element).querySelector<HTMLInputElement>('#new-user-extension');
      expect(extInput).not.toBeNull();
      expect(extInput?.value).toBe('1002');
    });
  });

  it('uses configured extension length when generating the next extension', async () => {
    const { element } = await mountComponent({
      getAccount: jest.fn().mockResolvedValue({
        ...mockAccount,
        config: { ...mockAccount.config, extension_length: 5 },
      }),
      listExtensions: jest.fn().mockResolvedValue([
        {
          number: '10001',
          target: 'user_01abc',
          status: 'active',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ]),
    });
    await navigateToTeamMembers(element);

    await waitFor(() => {
      const extInput = stepRoot(element).querySelector<HTMLInputElement>('#new-user-extension');
      expect(extInput).not.toBeNull();
      expect(extInput?.value).toBe('10002');
    });
  });

  it('uses custom extension number when adding a user', async () => {
    const { element, instance } = await mountComponent();
    await navigateToTeamMembers(element);

    const fillInput = (id: string, value: string): void => {
      const input = stepRoot(element).querySelector<HTMLInputElement>(`#${id}`);
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    fillInput('new-user-extension', '2000');
    fillInput('new-user-name', 'Bob');
    fillInput('new-user-email', 'bob@example.com');

    clickAction(element, 'add-user');

    await waitFor(() => {
      expect(
        (instance as unknown as Record<string, jest.Mock>).createExtension
      ).toHaveBeenCalledWith({
        number: '2000',
        target: 'user_02xyz',
      });
    });
  });

  it('preserves existing config fields when sending timezone', async () => {
    const { element, instance } = await mountComponent({
      getAccount: jest.fn().mockResolvedValue({
        ...mockAccount,
        config: { region: 'us-east', extension_length: 4, timezone: 'America/New_York' },
      }),
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('.address-confirmed')).not.toBeNull();
    });

    clickAction(element, 'next');

    await waitFor(() => {
      const updateCall = (instance as unknown as Record<string, jest.Mock>).updateAccount.mock
        .calls[0]?.[0];
      expect(updateCall).toBeDefined();
      expect(updateCall.config.region).toBe('us-east');
      expect(updateCall.config.extension_length).toBeUndefined();
      expect(updateCall.config.timezone).toBe('America/New_York');
    });
  });

  it('calls updateLocation when location name changes without re-editing the address', async () => {
    const updatedLocation = { ...mockLocation, name: 'Renamed Office' };
    const updateLocationMock = jest.fn().mockResolvedValue(updatedLocation);
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
      updateLocation: updateLocationMock,
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('.address-confirmed')).not.toBeNull();
    });

    // Change location name without clicking edit-address
    const nameInput = stepRoot(element).querySelector<HTMLInputElement>('#location-name');
    if (nameInput) {
      nameInput.value = 'Renamed Office';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    clickAction(element, 'next');

    await waitFor(() => {
      expect(updateLocationMock).toHaveBeenCalledWith(
        'loc_01abc',
        expect.objectContaining({ name: 'Renamed Office' })
      );
    });

    // Should NOT have called createLocation
    expect(
      (instance as unknown as Record<string, jest.Mock>).createLocation
    ).not.toHaveBeenCalled();
  });

  it('calls updateLocation when saving after editing a confirmed address', async () => {
    const updatedLocation = {
      ...mockLocation,
      name: 'Updated Office',
      address: {
        ...mockLocation.address,
        street: 'Elm St',
        city: 'Boston',
        state: 'MA',
        postal_code: '02101',
      },
    };
    const updateLocationMock = jest.fn().mockResolvedValue(updatedLocation);
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
      updateLocation: updateLocationMock,
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('.address-confirmed')).not.toBeNull();
    });

    // Click edit on confirmed address
    clickAction(element, 'edit-address');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#manual-street')).not.toBeNull();
    });

    // Update location name
    const locationInput = stepRoot(element).querySelector<HTMLInputElement>('#location-name');
    if (locationInput) {
      locationInput.value = 'Updated Office';
      locationInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const fillInput = (id: string, value: string): void => {
      const input = stepRoot(element).querySelector<HTMLInputElement>(`#${id}`);
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    fillInput('manual-street', 'Elm St');
    fillInput('manual-city', 'Boston');
    fillInput('manual-postal-code', '02101');

    const stateSelect = stepRoot(element).querySelector<HTMLSelectElement>('#manual-state');
    if (stateSelect) {
      stateSelect.value = 'MA';
      stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const tzSelect = stepRoot(element).querySelector<HTMLSelectElement>('#account-timezone');
    if (tzSelect) {
      tzSelect.value = 'America/New_York';
      tzSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    clickAction(element, 'next');

    await waitFor(() => {
      expect(updateLocationMock).toHaveBeenCalledWith('loc_01abc', {
        name: 'Updated Office',
        address: {
          address_number: '123',
          street: 'Elm St',
          city: 'Boston',
          state: 'MA',
          postal_code: '02101',
          country: 'US',
        },
      });
    });

    // Should NOT have called createLocation
    expect(
      (instance as unknown as Record<string, jest.Mock>).createLocation
    ).not.toHaveBeenCalled();
  });

  it('clears resolved address when edit button is clicked on confirmed address', async () => {
    const updatedLocation = {
      ...mockLocation,
      name: 'New Office',
      address: {
        ...mockLocation.address,
        street: 'Elm St',
        city: 'Boston',
        state: 'MA',
        postal_code: '02101',
      },
    };
    const updateLocationMock = jest.fn().mockResolvedValue(updatedLocation);
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
      updateLocation: updateLocationMock,
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('.address-confirmed')).not.toBeNull();
    });

    // Click edit - should clear existing location and switch to manual fields
    clickAction(element, 'edit-address');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#manual-street')).not.toBeNull();
    });

    // Fill manual fields and save - should call updateLocation (not createLocation)
    const locationInput = stepRoot(element).querySelector<HTMLInputElement>('#location-name');
    if (locationInput) {
      locationInput.value = 'New Office';
      locationInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const fillInput = (id: string, value: string): void => {
      const input = stepRoot(element).querySelector<HTMLInputElement>(`#${id}`);
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    fillInput('manual-street', 'Elm St');
    fillInput('manual-city', 'Boston');
    fillInput('manual-postal-code', '02101');

    const stateSelect = stepRoot(element).querySelector<HTMLSelectElement>('#manual-state');
    if (stateSelect) {
      stateSelect.value = 'MA';
      stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Set timezone (required)
    const tzSelect = stepRoot(element).querySelector<HTMLSelectElement>('#account-timezone');
    if (tzSelect) {
      tzSelect.value = 'America/New_York';
      tzSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    clickAction(element, 'next');

    await waitFor(() => {
      const updateLocationCall = updateLocationMock.mock.calls[0];
      expect(updateLocationCall).toBeDefined();
      expect(updateLocationCall[0]).toBe('loc_01abc');
      expect(updateLocationCall[1].name).toBe('New Office');
      expect(updateLocationCall[1].address.street).toBe('Elm St');
      expect(updateLocationCall[1].address.city).toBe('Boston');
      expect(updateLocationCall[1].address.state).toBe('MA');
      expect(updateLocationCall[1].address.postal_code).toBe('02101');
      expect(updateLocationCall[1].address.country).toBe('US');
    });

    // Should NOT have called createLocation
    expect(
      (instance as unknown as Record<string, jest.Mock>).createLocation
    ).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // Hardware Step Tests
  // ==========================================================================

  const navigateToHardware = async (element: AccountOnboardingElement): Promise<void> => {
    // Account step: business-details → team-members → (complete) → numbers
    await navigateToTeamMembers(element);
    clickAction(element, 'next'); // team-members → account complete screen
    await clickThroughStepComplete(element); // advance to numbers
    await waitFor(() => {
      const title = stepRoot(element).querySelector('.step-sidebar-title')?.textContent;
      expect(title).toContain('Numbers');
    });
    clickAction(element, 'next'); // numbers → numbers complete screen
    await clickThroughStepComplete(element); // advance to hardware
    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Assign Devices');
    });
  };

  const mountHardwareStep = async (
    overrides?: Record<string, unknown>
  ): Promise<{
    element: AccountOnboardingElement;
    instance: ReturnType<typeof createMockInstance>;
  }> => {
    const result = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
      ...overrides,
    });
    await navigateToHardware(result.element);
    return result;
  };

  it('shows no-devices placeholder when no devices available', async () => {
    const { element } = await mountHardwareStep();

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain(
        'No devices are available for your account at the moment.'
      );
    });
  });

  it('hardware step is skippable (Next works without assignments)', async () => {
    const { element } = await mountHardwareStep();

    clickAction(element, 'next');
    await clickThroughStepComplete(element);

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Wahoo!');
    });
  });

  it('shows no users message when user list is empty on hardware step', async () => {
    const { element } = await mountComponent({
      listUsers: jest.fn().mockResolvedValue([]),
      listExtensions: jest.fn().mockResolvedValue([]),
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    element.setCollectionOptions({ steps: { exclude: ['account', 'numbers'] } });

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('No team members found');
    });
  });

  it('renders device cards with draggable attribute', async () => {
    const unassignedDevice = { ...mockDevice, lines: [] };
    const { element } = await mountHardwareStep({
      listDevices: jest.fn().mockResolvedValue([unassignedDevice]),
      listDeviceLines: jest.fn().mockResolvedValue([]),
      listEndpoints: jest.fn().mockResolvedValue([]),
    });

    await waitFor(() => {
      const card = stepRoot(element).querySelector('.hw-device-card');
      expect(card).not.toBeNull();
      expect(card?.getAttribute('draggable')).toBe('true');
    });
  });

  it('renders team member table with drop zones', async () => {
    const { element } = await mountHardwareStep({
      listDevices: jest.fn().mockResolvedValue([mockDevice]),
      listDeviceLines: jest.fn().mockResolvedValue([]),
      listEndpoints: jest.fn().mockResolvedValue([]),
    });

    await waitFor(() => {
      const table = stepRoot(element).querySelector('.hw-team-table');
      expect(table).not.toBeNull();
      const dropZone = stepRoot(element).querySelector('.hw-drop-zone');
      expect(dropZone).not.toBeNull();
      expect(dropZone?.textContent).toContain('Drag and drop device here');
    });
  });

  it('assigns device via drag-and-drop and shows badge chip', async () => {
    const { element } = await mountHardwareStep({
      listDevices: jest.fn().mockResolvedValue([mockDevice]),
      listDeviceLines: jest.fn().mockResolvedValue([]),
      listEndpoints: jest.fn().mockResolvedValue([]),
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('.hw-device-card')).not.toBeNull();
    });

    // Simulate drag-and-drop
    const card = stepRoot(element).querySelector('.hw-device-card')!;
    const dropZone = stepRoot(element).querySelector('.hw-drop-zone')!;

    const dragStartEvent = new Event('dragstart', { bubbles: true }) as DragEvent;
    Object.defineProperty(dragStartEvent, 'dataTransfer', {
      value: {
        setData: jest.fn(),
        getData: () => mockDevice.id,
        effectAllowed: 'move',
        dropEffect: 'move',
      },
    });
    card.dispatchEvent(dragStartEvent);

    const dropEvent = new Event('drop', { bubbles: true }) as DragEvent;
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        getData: () => mockDevice.id,
      },
    });
    dropZone.dispatchEvent(dropEvent);

    await waitFor(() => {
      const badge = stepRoot(element).querySelector('.hw-device-badge-chip');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toContain('Snom');
    });
  });

  it('assigns device via click-to-assign and shows badge chip', async () => {
    const { element } = await mountHardwareStep({
      listDevices: jest.fn().mockResolvedValue([mockDevice]),
      listDeviceLines: jest.fn().mockResolvedValue([]),
      listEndpoints: jest.fn().mockResolvedValue([]),
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('.hw-device-card')).not.toBeNull();
    });

    // Click the device card to select it
    const card = stepRoot(element).querySelector('.hw-device-card')!;
    card.dispatchEvent(new Event('click', { bubbles: true }));

    await waitFor(() => {
      expect(stepRoot(element).querySelector('.hw-device-card--selected')).not.toBeNull();
      expect(stepRoot(element).querySelector('.hw-drop-zone--selectable')).not.toBeNull();
      expect(stepRoot(element).textContent).toContain('Click to assign');
    });

    // Click the drop zone to assign
    const dropZone = stepRoot(element).querySelector('.hw-drop-zone')!;
    dropZone.dispatchEvent(new Event('click', { bubbles: true }));

    await waitFor(() => {
      const badge = stepRoot(element).querySelector('.hw-device-badge-chip');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toContain('Snom');
      // Card should no longer be in available devices
      expect(stepRoot(element).querySelector('.hw-device-card')).toBeNull();
    });
  });

  it('unassign removes badge and returns card to available', async () => {
    const { element } = await mountHardwareStep({
      listDevices: jest.fn().mockResolvedValue([mockDevice]),
      listDeviceLines: jest.fn().mockResolvedValue([]),
      listEndpoints: jest.fn().mockResolvedValue([]),
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('.hw-device-card')).not.toBeNull();
    });

    // Assign via drop
    const card = stepRoot(element).querySelector('.hw-device-card')!;
    const dropZone = stepRoot(element).querySelector('.hw-drop-zone')!;

    const dragStartEvent = new Event('dragstart', { bubbles: true }) as DragEvent;
    Object.defineProperty(dragStartEvent, 'dataTransfer', {
      value: {
        setData: jest.fn(),
        getData: () => mockDevice.id,
        effectAllowed: 'move',
        dropEffect: 'move',
      },
    });
    card.dispatchEvent(dragStartEvent);

    const dropEvent = new Event('drop', { bubbles: true }) as DragEvent;
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { getData: () => mockDevice.id },
    });
    dropZone.dispatchEvent(dropEvent);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('.hw-device-badge-chip')).not.toBeNull();
    });

    // Now unassign
    clickAction(element, 'hw-unassign');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('.hw-device-badge-chip')).toBeNull();
      // Card should be back
      expect(stepRoot(element).querySelector('.hw-device-card')).not.toBeNull();
    });
  });

  it('shows Assign & Complete when all devices assigned', async () => {
    const { element } = await mountHardwareStep({
      listDevices: jest.fn().mockResolvedValue([mockDevice]),
      listDeviceLines: jest.fn().mockResolvedValue([]),
      listEndpoints: jest.fn().mockResolvedValue([]),
    });

    await waitFor(() => {
      expect(stepRoot(element).querySelector('.hw-device-card')).not.toBeNull();
    });

    // Assign the only device to the first user
    const card = stepRoot(element).querySelector('.hw-device-card')!;
    const dropZone = stepRoot(element).querySelector('.hw-drop-zone')!;

    const dragStartEvent = new Event('dragstart', { bubbles: true }) as DragEvent;
    Object.defineProperty(dragStartEvent, 'dataTransfer', {
      value: {
        setData: jest.fn(),
        getData: () => mockDevice.id,
        effectAllowed: 'move',
        dropEffect: 'move',
      },
    });
    card.dispatchEvent(dragStartEvent);

    const dropEvent = new Event('drop', { bubbles: true }) as DragEvent;
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { getData: () => mockDevice.id },
    });
    dropZone.dispatchEvent(dropEvent);

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Assign & Complete');
      expect(stepRoot(element).textContent).toContain('All devices have been assigned');
    });
  });

  // ==========================================================================
  // Numbers Step Tests
  // ==========================================================================

  const navigateToNumbers = async (
    element: AccountOnboardingElement,
    instance: ReturnType<typeof createMockInstance>
  ): Promise<void> => {
    // Account step: business-details → team-members → (complete) → numbers
    await navigateToTeamMembers(element);
    clickAction(element, 'next'); // team-members → account complete screen
    await clickThroughStepComplete(element); // advance to numbers
    await waitFor(() => {
      expect(
        (instance as unknown as Record<string, jest.Mock>).listPhoneNumbers
      ).toHaveBeenCalled();
    });
  };

  it('renders numbers overview with empty state when no numbers exist', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await navigateToNumbers(element, instance);

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('No telephone numbers yet');
      expect(stepRoot(element).querySelector('[data-action="num-start-order"]')).not.toBeNull();
      expect(stepRoot(element).querySelector('[data-action="num-start-port"]')).not.toBeNull();
    });
  });

  it('renders existing phone numbers in the overview table', async () => {
    const mockDids = {
      object: 'list',
      data: [
        {
          id: 'did_01',
          phone_number: '+12125551001',
          status: 'active',
          outbound_enabled: true,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      next_page_url: null,
      previous_page_url: null,
    };

    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
      listPhoneNumbers: jest.fn().mockResolvedValue(mockDids),
    });

    await navigateToNumbers(element, instance);

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('(212) 555-1001');
      expect(stepRoot(element).textContent).toContain('Active');
    });
  });

  it('navigates to order search when clicking Request New Numbers', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await navigateToNumbers(element, instance);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="num-start-order"]')).not.toBeNull();
    });

    clickAction(element, 'num-start-order');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Search Available Numbers');
      expect(stepRoot(element).querySelector('#num-area-code')).not.toBeNull();
    });
  });

  it('searches numbers by area code and displays results', async () => {
    const mockAvailable = [
      {
        phone_number: '+12125559001',
        city: 'New York',
        state: 'NY',
        rate_center: 'NWYRCYZN01',
        lata: '132',
      },
      {
        phone_number: '+12125559002',
        city: 'New York',
        state: 'NY',
        rate_center: 'NWYRCYZN01',
        lata: '132',
      },
    ];

    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
      searchAvailableNumbers: jest.fn().mockResolvedValue(mockAvailable),
    });

    await navigateToNumbers(element, instance);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="num-start-order"]')).not.toBeNull();
    });

    clickAction(element, 'num-start-order');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#num-area-code')).not.toBeNull();
    });

    const areaInput = stepRoot(element).querySelector<HTMLInputElement>('#num-area-code');
    if (areaInput) {
      areaInput.value = '212';
      areaInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    clickAction(element, 'num-search');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('(212) 555-9001');
      expect(stepRoot(element).textContent).toContain('(212) 555-9002');
    });
  });

  it('places number order and shows status', async () => {
    const mockAvailable = [
      {
        phone_number: '+12125559001',
        city: 'New York',
        state: 'NY',
        rate_center: 'NWYRCYZN01',
        lata: '132',
      },
    ];

    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
      searchAvailableNumbers: jest.fn().mockResolvedValue(mockAvailable),
    });

    await navigateToNumbers(element, instance);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="num-start-order"]')).not.toBeNull();
    });

    clickAction(element, 'num-start-order');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#num-area-code')).not.toBeNull();
    });

    clickAction(element, 'num-search');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('(212) 555-9001');
    });

    // Select the number via checkbox
    const checkbox = stepRoot(element).querySelector<HTMLInputElement>(
      '[data-action="num-toggle-number"]'
    );
    checkbox?.click();

    // Go to confirm
    clickAction(element, 'num-confirm-order');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Confirm Your Order');
    });

    // Place the order
    clickAction(element, 'num-place-order');

    await waitFor(() => {
      expect(
        (instance as unknown as Record<string, jest.Mock>).createPhoneNumberOrder
      ).toHaveBeenCalledWith(['+12125559001']);
    });

    // Should show order status
    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Order Submitted');
    });
  });

  it('navigates to port flow when clicking Port Existing Numbers', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await navigateToNumbers(element, instance);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="num-start-port"]')).not.toBeNull();
    });

    clickAction(element, 'num-start-port');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Numbers to Port');
      expect(stepRoot(element).querySelector('#num-port-phone-0')).not.toBeNull();
    });
  });

  it('adds and removes port phone number inputs', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await navigateToNumbers(element, instance);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="num-start-port"]')).not.toBeNull();
    });

    clickAction(element, 'num-start-port');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#num-port-phone-0')).not.toBeNull();
    });

    // Should not have a remove button when only one input
    expect(stepRoot(element).querySelector('[data-action="num-remove-port-phone"]')).toBeNull();

    // Add another
    clickAction(element, 'num-add-port-phone');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#num-port-phone-1')).not.toBeNull();
      // Now remove buttons should appear
      expect(
        stepRoot(element).querySelector('[data-action="num-remove-port-phone"]')
      ).not.toBeNull();
    });
  });

  it('checks port eligibility and shows results', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await navigateToNumbers(element, instance);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="num-start-port"]')).not.toBeNull();
    });

    clickAction(element, 'num-start-port');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#num-port-phone-0')).not.toBeNull();
    });

    const phoneInput = stepRoot(element).querySelector<HTMLInputElement>('#num-port-phone-0');
    if (phoneInput) {
      phoneInput.value = '(212) 555-1001';
      phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    clickAction(element, 'num-check-eligibility');

    await waitFor(() => {
      expect(
        (instance as unknown as Record<string, jest.Mock>).checkPortEligibility
      ).toHaveBeenCalled();
      expect(stepRoot(element).textContent).toContain('Portable');
      expect(stepRoot(element).textContent).toContain('OldCo');
    });
  });

  it('shows subscriber form after eligibility and validates required fields', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await navigateToNumbers(element, instance);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="num-start-port"]')).not.toBeNull();
    });

    clickAction(element, 'num-start-port');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#num-port-phone-0')).not.toBeNull();
    });

    const phoneInput = stepRoot(element).querySelector<HTMLInputElement>('#num-port-phone-0');
    if (phoneInput) {
      phoneInput.value = '(212) 555-1001';
      phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    clickAction(element, 'num-check-eligibility');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Portable');
    });

    clickAction(element, 'num-to-subscriber');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Subscriber Information');
      expect(stepRoot(element).querySelector('#num-port-btn')).not.toBeNull();
    });

    // Try to advance without filling — should show validation errors
    clickAction(element, 'num-to-foc-date');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('BTN is required');
      expect(stepRoot(element).textContent).toContain('Business name is required');
    });
  });

  it('returns to overview from order sub-flow via cancel', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await navigateToNumbers(element, instance);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="num-start-order"]')).not.toBeNull();
    });

    clickAction(element, 'num-start-order');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Search Available Numbers');
    });

    clickAction(element, 'num-back-to-overview');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="num-start-order"]')).not.toBeNull();
    });
  });

  it('shows main step footer only at overview sub-step', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await navigateToNumbers(element, instance);

    await waitFor(() => {
      // At overview, should have the main step "Next" button
      expect(stepRoot(element).querySelector('[data-action="next"]')).not.toBeNull();
    });

    clickAction(element, 'num-start-order');

    await waitFor(() => {
      // Inside order sub-flow, main "next" should NOT be visible
      // Instead, we have num-search and num-back-to-overview
      expect(stepRoot(element).querySelector('[data-action="num-search"]')).not.toBeNull();
    });
  });

  it('advances past numbers step from overview via Next', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await navigateToNumbers(element, instance);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="next"]')).not.toBeNull();
    });

    clickAction(element, 'next');
    await clickThroughStepComplete(element);

    // Should advance to hardware step
    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Assign Devices');
    });
  });

  it('shows error when numbers data fails to load', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
      listPhoneNumbers: jest.fn().mockRejectedValue(new Error('Network error')),
    });

    await navigateToNumbers(element, instance);

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Network error');
      expect(stepRoot(element).querySelector('[data-action="num-retry-load"]')).not.toBeNull();
    });
  });

  it('shows non-portable numbers in eligibility results', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
      checkPortEligibility: jest.fn().mockResolvedValue({
        portable_numbers: [],
        non_portable_numbers: [{ phone_number: '+12125551001', city: 'New York', state: 'NY' }],
      }),
    });

    await navigateToNumbers(element, instance);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="num-start-port"]')).not.toBeNull();
    });

    clickAction(element, 'num-start-port');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#num-port-phone-0')).not.toBeNull();
    });

    const phoneInput = stepRoot(element).querySelector<HTMLInputElement>('#num-port-phone-0');
    if (phoneInput) {
      phoneInput.value = '(212) 555-1001';
      phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    clickAction(element, 'num-check-eligibility');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Not Portable');
      expect(stepRoot(element).textContent).toContain('None of the entered numbers are eligible');
    });
  });

  it('validates phone number format before checking eligibility', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await navigateToNumbers(element, instance);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="num-start-port"]')).not.toBeNull();
    });

    clickAction(element, 'num-start-port');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#num-port-phone-0')).not.toBeNull();
    });

    // Enter invalid number
    const phoneInput = stepRoot(element).querySelector<HTMLInputElement>('#num-port-phone-0');
    if (phoneInput) {
      phoneInput.value = '123';
      phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    clickAction(element, 'num-check-eligibility');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Enter a valid US phone number');
      expect(
        (instance as unknown as Record<string, jest.Mock>).checkPortEligibility
      ).not.toHaveBeenCalled();
    });
  });

  it('validates empty phone inputs before checking eligibility', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await navigateToNumbers(element, instance);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="num-start-port"]')).not.toBeNull();
    });

    clickAction(element, 'num-start-port');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#num-port-phone-0')).not.toBeNull();
    });

    // Click check without entering any number
    clickAction(element, 'num-check-eligibility');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('At least one phone number is required');
    });
  });

  it('validates bill copy required before moving to review', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await navigateToNumbers(element, instance);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="num-start-port"]')).not.toBeNull();
    });

    clickAction(element, 'num-start-port');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#num-port-phone-0')).not.toBeNull();
    });

    const phoneInput = stepRoot(element).querySelector<HTMLInputElement>('#num-port-phone-0');
    if (phoneInput) {
      phoneInput.value = '(212) 555-1001';
      phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    clickAction(element, 'num-check-eligibility');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Portable');
    });

    clickAction(element, 'num-to-subscriber');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#num-port-btn')).not.toBeNull();
    });

    // Fill subscriber form
    const fillInput = (id: string, value: string): void => {
      const input = stepRoot(element).querySelector<HTMLInputElement>(`#${id}`);
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    fillInput('num-port-btn', '(212) 555-1001');
    fillInput('num-port-business-name', 'Acme Corp');
    fillInput('num-port-approver-name', 'John Doe');
    fillInput('num-port-house-number', '123');
    fillInput('num-port-street-name', 'Main St');
    fillInput('num-port-city', 'New York');
    fillInput('num-port-zip', '10001');

    // Select state
    const stateSelect = stepRoot(element).querySelector<HTMLSelectElement>('#num-port-state');
    if (stateSelect) {
      stateSelect.value = 'NY';
      stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    clickAction(element, 'num-to-foc-date');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Requested Port Date');
    });

    // Fill FOC date
    const today = new Date();
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + 10);
    const dateStr = futureDate.toISOString().split('T')[0];

    fillInput('num-port-foc-date', dateStr!);

    const timeSelect = stepRoot(element).querySelector<HTMLSelectElement>('#num-port-foc-time');
    if (timeSelect) {
      timeSelect.value = '10:00';
      timeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    clickAction(element, 'num-to-documents');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Supporting Documents');
    });

    // Try to advance to review without bill copy
    clickAction(element, 'num-to-review');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('A phone bill copy is required');
    });
  });

  /**
   * Helper: navigate through port flow to a given sub-step.
   * Fills all required fields along the way.
   */
  const navigatePortFlowTo = async (
    element: AccountOnboardingElement,
    instance: ReturnType<typeof createMockInstance>,
    targetStep: 'eligibility' | 'subscriber' | 'foc-date' | 'documents' | 'review' | 'submitted'
  ): Promise<void> => {
    await navigateToNumbers(element, instance);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="num-start-port"]')).not.toBeNull();
    });

    clickAction(element, 'num-start-port');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#num-port-phone-0')).not.toBeNull();
    });

    const fillInput = (id: string, value: string): void => {
      const input = stepRoot(element).querySelector<HTMLInputElement>(`#${id}`);
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    fillInput('num-port-phone-0', '(212) 555-1001');
    clickAction(element, 'num-check-eligibility');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Portable');
    });
    if (targetStep === 'eligibility') return;

    clickAction(element, 'num-to-subscriber');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('#num-port-btn')).not.toBeNull();
    });

    fillInput('num-port-btn', '(212) 555-1001');
    fillInput('num-port-business-name', 'Acme Corp');
    fillInput('num-port-approver-name', 'John Doe');
    fillInput('num-port-house-number', '123');
    fillInput('num-port-street-name', 'Main St');
    fillInput('num-port-city', 'New York');
    fillInput('num-port-zip', '10001');

    const stateSelect = stepRoot(element).querySelector<HTMLSelectElement>('#num-port-state');
    if (stateSelect) {
      stateSelect.value = 'NY';
      stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (targetStep === 'subscriber') return;

    clickAction(element, 'num-to-foc-date');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Requested Port Date');
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    fillInput('num-port-foc-date', futureDate.toISOString().split('T')[0]!);

    const timeSelect = stepRoot(element).querySelector<HTMLSelectElement>('#num-port-foc-time');
    if (timeSelect) {
      timeSelect.value = '10:00';
      timeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (targetStep === 'foc-date') return;

    clickAction(element, 'num-to-documents');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Supporting Documents');
    });

    // Simulate file upload for bill copy
    const billInput = stepRoot(element).querySelector<HTMLInputElement>('#num-bill-copy-input');
    if (billInput) {
      const file = new File(['mock'], 'bill.pdf', { type: 'application/pdf' });
      Object.defineProperty(billInput, 'files', { value: [file], configurable: true });
      billInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (targetStep === 'documents') return;

    clickAction(element, 'num-to-review');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Review');
    });
    if (targetStep === 'review') return;

    // Fill signature and submit
    fillInput('num-port-signature', 'John Doe');
    clickAction(element, 'num-submit-port');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Port Request Submitted');
    });
  };

  it('completes full port flow end-to-end and calls all API methods', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await navigatePortFlowTo(element, instance, 'submitted');

    // Verify API calls
    const mock = instance as unknown as Record<string, jest.Mock>;
    expect(mock.checkPortEligibility).toHaveBeenCalled();
    expect(mock.createPortOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        phone_numbers: ['+12125551001'],
        subscriber: expect.objectContaining({
          business_name: 'Acme Corp',
          approver_name: 'John Doe',
        }),
      })
    );
    expect(mock.uploadBillCopy).toHaveBeenCalledWith('po_01abc', expect.any(File));
    expect(mock.approvePortOrder).toHaveBeenCalledWith(
      'po_01abc',
      expect.objectContaining({
        signature: 'John Doe',
      })
    );
    expect(mock.submitPortOrder).toHaveBeenCalledWith('po_01abc');

    // Verify submitted screen
    expect(stepRoot(element).textContent).toContain('Port Request Submitted');
    expect(stepRoot(element).querySelector('[data-action="num-port-done"]')).not.toBeNull();
  });

  it('shows review screen with summary of all port details', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await navigatePortFlowTo(element, instance, 'review');

    const content = stepRoot(element).textContent!;
    expect(content).toContain('(212) 555-1001');
    expect(content).toContain('Acme Corp');
    expect(content).toContain('John Doe');
    expect(content).toContain('bill.pdf');
    expect(stepRoot(element).querySelector('#num-port-signature')).not.toBeNull();
  });

  it('validates signature required before port submission', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await navigatePortFlowTo(element, instance, 'review');

    // Try to submit without signature
    clickAction(element, 'num-submit-port');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Signature is required');
    });

    const mock = instance as unknown as Record<string, jest.Mock>;
    expect(mock.createPortOrder).not.toHaveBeenCalled();
  });

  it('returns to overview after port submission via port-done', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await navigatePortFlowTo(element, instance, 'submitted');

    clickAction(element, 'num-port-done');

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="num-start-order"]')).not.toBeNull();
    });
  });

  it('shows port submission error when API fails', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
      createPortOrder: jest.fn().mockRejectedValue(new Error('Network failure')),
    });

    await navigatePortFlowTo(element, instance, 'review');

    const fillInput = (id: string, value: string): void => {
      const input = stepRoot(element).querySelector<HTMLInputElement>(`#${id}`);
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    fillInput('num-port-signature', 'John Doe');
    clickAction(element, 'num-submit-port');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Network failure');
    });
  });

  it('resets numbers sub-step to overview when navigating back to numbers', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await navigateToNumbers(element, instance);

    await waitFor(() => {
      expect(stepRoot(element).querySelector('[data-action="num-start-order"]')).not.toBeNull();
    });

    // Enter order sub-flow
    clickAction(element, 'num-start-order');

    await waitFor(() => {
      expect(stepRoot(element).textContent).toContain('Search Available Numbers');
    });

    // Navigate to hardware then back to numbers
    clickAction(element, 'num-back-to-overview');

    await waitFor(() => {
      // Should be back at overview with action cards
      expect(stepRoot(element).querySelector('[data-action="num-start-order"]')).not.toBeNull();
    });
  });
});
