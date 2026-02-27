/**
 * Tests for AccountOnboardingComponent
 */

import { waitFor } from '@testing-library/react';
import '../account-onboarding';
import type { AccountOnboardingElement } from '../../types';

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
    ...overrides,
  } as unknown as Parameters<AccountOnboardingElement['setInstance']>[0];
};

const clickAction = (element: AccountOnboardingElement, action: string): void => {
  const button = element.shadowRoot?.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  expect(button).not.toBeNull();
  button?.click();
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
    expect(element.shadowRoot?.querySelector('[data-action="next"]')).toBeTruthy();
  });

  return { element, instance };
};

const navigateToComplete = async (
  element: AccountOnboardingElement,
  nextClicks = 3
): Promise<void> => {
  for (let i = 0; i < nextClicks; i += 1) {
    const stepBefore = element.shadowRoot?.querySelector('.step-item.active')?.textContent?.trim();
    clickAction(element, 'next');
    // Wait for step to advance (account step has async save)
    await waitFor(() => {
      const currentActive = element.shadowRoot
        ?.querySelector('.step-item.active')
        ?.textContent?.trim();
      expect(currentActive).not.toBe(stepBefore);
    });
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
    const { element: component } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });
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
    const { element: component } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });
    component.setCollectionOptions({ steps: { exclude: ['hardware'] } });

    await navigateToComplete(component, 2);
    expect(component.shadowRoot?.textContent).not.toContain('Hardware');

    component.setCollectionOptions(undefined);
    expect(component.shadowRoot?.textContent).toContain('Hardware');
  });

  // ==========================================================================
  // Account Step Tests
  // ==========================================================================

  it('renders account details form with pre-populated data from API', async () => {
    const { element } = await mountComponent();

    await waitFor(() => {
      const emailInput = element.shadowRoot?.querySelector<HTMLInputElement>('#account-email');
      expect(emailInput).not.toBeNull();
      expect(emailInput?.value).toBe('existing@example.com');
    });
  });

  it('renders existing users in the user list', async () => {
    const { element } = await mountComponent();

    await waitFor(() => {
      const userItems = element.shadowRoot?.querySelectorAll('.user-item');
      expect(userItems?.length).toBe(1);
      expect(element.shadowRoot?.textContent).toContain('Alice');
    });
  });

  it('shows extension number for users with extensions', async () => {
    const { element } = await mountComponent();

    await waitFor(() => {
      expect(element.shadowRoot?.textContent).toContain('1001');
    });
  });

  it('calls createUser and createExtension when adding a user', async () => {
    const { element, instance } = await mountComponent();

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#new-user-name')).not.toBeNull();
    });

    // Fill in the add user form
    const nameInput = element.shadowRoot?.querySelector<HTMLInputElement>('#new-user-name');
    const emailInput = element.shadowRoot?.querySelector<HTMLInputElement>('#new-user-email');

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

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('[data-action="remove-user"]')).not.toBeNull();
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

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#new-user-name')).not.toBeNull();
    });

    // Click add without filling name
    clickAction(element, 'add-user');

    await waitFor(() => {
      expect(element.shadowRoot?.textContent).toContain('Name is required');
    });
  });

  it('shows duplicate email error inline', async () => {
    const { element } = await mountComponent({
      createUser: jest.fn().mockRejectedValue(new Error('A user with this email already exists')),
    });

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#new-user-name')).not.toBeNull();
    });

    const nameInput = element.shadowRoot?.querySelector<HTMLInputElement>('#new-user-name');
    if (nameInput) {
      nameInput.value = 'Duplicate';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const emailInput = element.shadowRoot?.querySelector<HTMLInputElement>('#new-user-email');
    if (emailInput) {
      emailInput.value = 'alice@example.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    clickAction(element, 'add-user');

    await waitFor(() => {
      expect(element.shadowRoot?.textContent).toContain('already exists');
    });
  });

  it('rolls back user creation when extension creation fails', async () => {
    const deleteUserMock = jest.fn().mockResolvedValue(undefined);
    const { element } = await mountComponent({
      createExtension: jest.fn().mockRejectedValue(new Error('Extension conflict')),
      deleteUser: deleteUserMock,
    });

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#new-user-name')).not.toBeNull();
    });

    const fillInput = (id: string, value: string): void => {
      const input = element.shadowRoot?.querySelector<HTMLInputElement>(`#${id}`);
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
    expect(element.shadowRoot?.textContent).toContain('Extension conflict');
  });

  it('validates company name required before advancing', async () => {
    const { element } = await mountComponent({
      getAccount: jest.fn().mockResolvedValue({ ...mockAccount, name: null }),
    });

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#account-name')).not.toBeNull();
    });

    clickAction(element, 'next');

    await waitFor(() => {
      expect(element.shadowRoot?.textContent).toContain('Company name is required');
    });
  });

  it('validates email required before advancing to next step', async () => {
    const { element } = await mountComponent({
      getAccount: jest.fn().mockResolvedValue({ ...mockAccount, email: null }),
    });

    await waitFor(() => {
      const emailInput = element.shadowRoot?.querySelector<HTMLInputElement>('#account-email');
      expect(emailInput).not.toBeNull();
    });

    clickAction(element, 'next');

    await waitFor(() => {
      expect(element.shadowRoot?.textContent).toContain('Email is required');
    });
  });

  it('validates phone number required before advancing', async () => {
    const { element } = await mountComponent({
      getAccount: jest.fn().mockResolvedValue({ ...mockAccount, phone: null }),
    });

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#account-phone')).not.toBeNull();
    });

    clickAction(element, 'next');

    await waitFor(() => {
      expect(element.shadowRoot?.textContent).toContain('Phone number is required');
    });
  });

  it('validates primary contact required before advancing', async () => {
    const { element } = await mountComponent({
      getAccount: jest.fn().mockResolvedValue({ ...mockAccount, primary_contact_name: null }),
    });

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#account-primary-contact')).not.toBeNull();
    });

    clickAction(element, 'next');

    await waitFor(() => {
      expect(element.shadowRoot?.textContent).toContain('Primary contact is required');
    });
  });

  it('validates phone number format before advancing', async () => {
    const { element } = await mountComponent({
      getAccount: jest.fn().mockResolvedValue({ ...mockAccount, phone: '123' }),
    });

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#account-phone')).not.toBeNull();
    });

    clickAction(element, 'next');

    await waitFor(() => {
      expect(element.shadowRoot?.textContent).toContain('Enter a valid US phone number');
    });
  });

  it('calls updateAccount and navigates on successful save', async () => {
    const { element, instance } = await mountComponent();

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#account-email')).not.toBeNull();
    });

    // Need to fill location for save to succeed
    const locationInput = element.shadowRoot?.querySelector<HTMLInputElement>('#location-name');
    if (locationInput) {
      locationInput.value = 'HQ';
      locationInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Switch to manual address mode and fill fields
    clickAction(element, 'enter-manually');

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#manual-street')).not.toBeNull();
    });

    const fillInput = (id: string, value: string): void => {
      const input = element.shadowRoot?.querySelector<HTMLInputElement>(`#${id}`);
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    fillInput('manual-street', 'Main St');
    fillInput('manual-city', 'New York');
    fillInput('manual-postal-code', '10001');

    // Set state via change event on select
    const stateSelect = element.shadowRoot?.querySelector<HTMLSelectElement>('#manual-state');
    if (stateSelect) {
      stateSelect.value = 'NY';
      stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Set timezone (required)
    const tzSelect = element.shadowRoot?.querySelector<HTMLSelectElement>('#account-timezone');
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
    const { element, instance } = await mountComponent({
      listUsers: jest.fn().mockResolvedValue([]),
      listExtensions: jest.fn().mockResolvedValue([]),
    });

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#location-name')).not.toBeNull();
    });

    const locationInput = element.shadowRoot?.querySelector<HTMLInputElement>('#location-name');
    if (locationInput) {
      locationInput.value = 'HQ';
      locationInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    clickAction(element, 'enter-manually');

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#manual-street')).not.toBeNull();
    });

    const fillInput = (id: string, value: string): void => {
      const input = element.shadowRoot?.querySelector<HTMLInputElement>(`#${id}`);
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    fillInput('manual-street', 'Main St');
    fillInput('manual-city', 'New York');
    fillInput('manual-postal-code', '10001');

    const stateSelect = element.shadowRoot?.querySelector<HTMLSelectElement>('#manual-state');
    if (stateSelect) {
      stateSelect.value = 'NY';
      stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    clickAction(element, 'next');

    await waitFor(() => {
      expect(element.shadowRoot?.textContent).toContain(
        'Add at least one team member to continue.'
      );
    });

    expect((instance as unknown as Record<string, jest.Mock>).updateAccount).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // Location Section Tests
  // ==========================================================================

  it('renders the location section with name and address fields', async () => {
    const { element } = await mountComponent();

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#location-name')).not.toBeNull();
      expect(element.shadowRoot?.textContent).toContain('Business Location');
    });
  });

  it('renders address search input by default', async () => {
    const { element } = await mountComponent();

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#address-search')).not.toBeNull();
      expect(element.shadowRoot?.querySelector('[data-action="enter-manually"]')).not.toBeNull();
    });
  });

  it('pre-populates location from existing location data', async () => {
    const { element } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await waitFor(() => {
      const nameInput = element.shadowRoot?.querySelector<HTMLInputElement>('#location-name');
      expect(nameInput?.value).toBe('Main Office');
    });

    // Should show confirmed address card (not search)
    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('.address-confirmed')).not.toBeNull();
      expect(element.shadowRoot?.querySelector('#address-search')).toBeNull();
    });
  });

  it('switches to manual fields when "Enter manually" is clicked', async () => {
    const { element } = await mountComponent();

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('[data-action="enter-manually"]')).not.toBeNull();
    });

    clickAction(element, 'enter-manually');

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#manual-street')).not.toBeNull();
      expect(element.shadowRoot?.querySelector('#manual-city')).not.toBeNull();
      expect(element.shadowRoot?.querySelector('#manual-state')).not.toBeNull();
      expect(element.shadowRoot?.querySelector('#manual-postal-code')).not.toBeNull();
    });
  });

  it('switches back to search when "Search instead" is clicked', async () => {
    const { element } = await mountComponent();

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('[data-action="enter-manually"]')).not.toBeNull();
    });

    clickAction(element, 'enter-manually');

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('[data-action="search-instead"]')).not.toBeNull();
    });

    clickAction(element, 'search-instead');

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#address-search')).not.toBeNull();
    });
  });

  it('closes the "No results" dropdown when address input loses focus', async () => {
    jest.useFakeTimers();

    const { element } = await mountComponent({
      suggestAddresses: jest.fn().mockResolvedValue([]),
    });

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#address-search')).not.toBeNull();
    });

    const input = element.shadowRoot!.querySelector<HTMLInputElement>('#address-search')!;
    const dropdown = element.shadowRoot!.querySelector<HTMLElement>('.address-dropdown')!;

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
      expect(element.shadowRoot?.querySelector('[data-action="edit-address"]')).not.toBeNull();
    });

    clickAction(element, 'edit-address');

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#manual-street')).not.toBeNull();
    });
  });

  it('validates location name is required', async () => {
    const { element } = await mountComponent();

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#location-name')).not.toBeNull();
    });

    // Don't fill location name, just click next
    clickAction(element, 'next');

    await waitFor(() => {
      expect(element.shadowRoot?.textContent).toContain('Location name is required');
    });
  });

  it('validates address is required', async () => {
    const { element } = await mountComponent();

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#location-name')).not.toBeNull();
    });

    // Fill location name but no address
    const nameInput = element.shadowRoot?.querySelector<HTMLInputElement>('#location-name');
    if (nameInput) {
      nameInput.value = 'HQ';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    clickAction(element, 'next');

    await waitFor(() => {
      expect(element.shadowRoot?.textContent).toContain('Address is required');
    });
  });

  it('validates timezone is required', async () => {
    const { element } = await mountComponent({
      getAccount: jest.fn().mockResolvedValue({ ...mockAccount, config: {} }),
    });

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#address-search')).not.toBeNull();
    });

    // Switch to manual entry so timezone dropdown appears
    clickAction(element, 'enter-manually');

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#account-timezone')).not.toBeNull();
    });

    clickAction(element, 'next');

    await waitFor(() => {
      expect(element.shadowRoot?.textContent).toContain('Timezone is required');
    });
  });

  it('calls createLocation with manual address data on save', async () => {
    const { element, instance } = await mountComponent();

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#location-name')).not.toBeNull();
    });

    // Fill location name
    const nameInput = element.shadowRoot?.querySelector<HTMLInputElement>('#location-name');
    if (nameInput) {
      nameInput.value = 'HQ';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Switch to manual mode
    clickAction(element, 'enter-manually');

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#manual-street')).not.toBeNull();
    });

    const fillInput = (id: string, value: string): void => {
      const input = element.shadowRoot?.querySelector<HTMLInputElement>(`#${id}`);
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    fillInput('manual-house-number', '456');
    fillInput('manual-street', 'Oak Ave');
    fillInput('manual-city', 'Chicago');
    fillInput('manual-postal-code', '60601');

    const stateSelect = element.shadowRoot?.querySelector<HTMLSelectElement>('#manual-state');
    if (stateSelect) {
      stateSelect.value = 'IL';
      stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Set timezone (required)
    const tzSelect = element.shadowRoot?.querySelector<HTMLSelectElement>('#account-timezone');
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
      expect(element.shadowRoot?.querySelector('.address-confirmed')).not.toBeNull();
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
      const tzReadonly = element.shadowRoot?.querySelector('.timezone-readonly');
      expect(tzReadonly).not.toBeNull();
      expect(tzReadonly?.textContent).toContain('Eastern');
    });
  });

  it('allows user to change the timezone via select after editing address', async () => {
    const { element, instance } = await mountComponent({
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
    });

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('.timezone-readonly')).not.toBeNull();
    });

    // Edit the confirmed address to get into edit mode with timezone dropdown
    clickAction(element, 'edit-address');

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#account-timezone')).not.toBeNull();
    });

    const tzSelect = element.shadowRoot?.querySelector<HTMLSelectElement>('#account-timezone');
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
      expect(element.shadowRoot?.querySelector('.timezone-readonly')).not.toBeNull();
    });

    // Click edit on confirmed address — timezone should be preserved in dropdown
    clickAction(element, 'edit-address');

    await waitFor(() => {
      const tzSelect = element.shadowRoot?.querySelector<HTMLSelectElement>('#account-timezone');
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
      expect(element.shadowRoot?.querySelector('.timezone-readonly')).not.toBeNull();
    });

    // Edit the confirmed address
    clickAction(element, 'edit-address');

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#manual-street')).not.toBeNull();
    });

    // Switch to search mode
    clickAction(element, 'search-instead');

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#address-search')).not.toBeNull();
      const tzSelect = element.shadowRoot?.querySelector<HTMLSelectElement>('#account-timezone');
      expect(tzSelect).not.toBeNull();
      expect(tzSelect?.value).toBe('America/New_York');
    });

    // Switch back to manual and ensure timezone is still preserved
    clickAction(element, 'enter-manually');

    await waitFor(() => {
      const tzSelect = element.shadowRoot?.querySelector<HTMLSelectElement>('#account-timezone');
      expect(tzSelect).not.toBeNull();
      expect(tzSelect?.value).toBe('America/New_York');
    });
  });

  it('shows timezone placeholder when account has no timezone', async () => {
    const { element } = await mountComponent({
      getAccount: jest.fn().mockResolvedValue({ ...mockAccount, config: {} }),
    });

    await waitFor(() => {
      const tzSelect = element.shadowRoot?.querySelector<HTMLSelectElement>('#account-timezone');
      expect(tzSelect).not.toBeNull();
      expect(tzSelect?.value).toBe('');
    });

    // Switch to manual entry — timezone remains selectable with placeholder
    clickAction(element, 'enter-manually');

    await waitFor(() => {
      const tzSelect = element.shadowRoot?.querySelector<HTMLSelectElement>('#account-timezone');
      expect(tzSelect).not.toBeNull();
      expect(tzSelect?.value).toBe('');
    });
  });

  it('includes timezone in updateAccount config after address selection', async () => {
    const { element, instance } = await mountComponent();

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#address-search')).not.toBeNull();
    });

    // Simulate selecting a suggestion via delegated click (data-action="select-suggestion")
    const btn = document.createElement('button');
    btn.setAttribute('data-action', 'select-suggestion');
    btn.setAttribute('data-place-id', 'place_123');
    element.shadowRoot?.querySelector('.address-autocomplete')?.appendChild(btn);
    btn.click();

    // Wait for address to be confirmed (getPlaceDetails returns timezone: 'America/New_York')
    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('.address-confirmed')).not.toBeNull();
    });

    // Fill location name
    const nameInput = element.shadowRoot?.querySelector<HTMLInputElement>('#location-name');
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
      const nameInput = element.shadowRoot?.querySelector<HTMLInputElement>('#account-name');
      expect(nameInput).not.toBeNull();
      expect(nameInput?.value).toBe('Acme Corp');

      const phoneInput = element.shadowRoot?.querySelector<HTMLInputElement>('#account-phone');
      expect(phoneInput).not.toBeNull();
      expect(phoneInput?.value).toBe('(212) 555-0100');

      const contactInput = element.shadowRoot?.querySelector<HTMLInputElement>(
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
      expect(element.shadowRoot?.querySelector('#account-name')).not.toBeNull();
    });

    const fillInput = (id: string, value: string): void => {
      const input = element.shadowRoot?.querySelector<HTMLInputElement>(`#${id}`);
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

    await waitFor(() => {
      const extInput = element.shadowRoot?.querySelector<HTMLInputElement>('#new-user-extension');
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

    await waitFor(() => {
      const extInput = element.shadowRoot?.querySelector<HTMLInputElement>('#new-user-extension');
      expect(extInput).not.toBeNull();
      expect(extInput?.value).toBe('10002');
    });
  });

  it('uses custom extension number when adding a user', async () => {
    const { element, instance } = await mountComponent();

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#new-user-extension')).not.toBeNull();
    });

    const fillInput = (id: string, value: string): void => {
      const input = element.shadowRoot?.querySelector<HTMLInputElement>(`#${id}`);
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
      expect(element.shadowRoot?.querySelector('.address-confirmed')).not.toBeNull();
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
      expect(element.shadowRoot?.querySelector('.address-confirmed')).not.toBeNull();
    });

    // Change location name without clicking edit-address
    const nameInput = element.shadowRoot?.querySelector<HTMLInputElement>('#location-name');
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
      expect(element.shadowRoot?.querySelector('.address-confirmed')).not.toBeNull();
    });

    // Click edit on confirmed address
    clickAction(element, 'edit-address');

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#manual-street')).not.toBeNull();
    });

    // Update location name
    const locationInput = element.shadowRoot?.querySelector<HTMLInputElement>('#location-name');
    if (locationInput) {
      locationInput.value = 'Updated Office';
      locationInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const fillInput = (id: string, value: string): void => {
      const input = element.shadowRoot?.querySelector<HTMLInputElement>(`#${id}`);
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    fillInput('manual-street', 'Elm St');
    fillInput('manual-city', 'Boston');
    fillInput('manual-postal-code', '02101');

    const stateSelect = element.shadowRoot?.querySelector<HTMLSelectElement>('#manual-state');
    if (stateSelect) {
      stateSelect.value = 'MA';
      stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const tzSelect = element.shadowRoot?.querySelector<HTMLSelectElement>('#account-timezone');
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
      expect(element.shadowRoot?.querySelector('.address-confirmed')).not.toBeNull();
    });

    // Click edit - should clear existing location and switch to manual fields
    clickAction(element, 'edit-address');

    await waitFor(() => {
      expect(element.shadowRoot?.querySelector('#manual-street')).not.toBeNull();
    });

    // Fill manual fields and save - should call updateLocation (not createLocation)
    const locationInput = element.shadowRoot?.querySelector<HTMLInputElement>('#location-name');
    if (locationInput) {
      locationInput.value = 'New Office';
      locationInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const fillInput = (id: string, value: string): void => {
      const input = element.shadowRoot?.querySelector<HTMLInputElement>(`#${id}`);
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    fillInput('manual-street', 'Elm St');
    fillInput('manual-city', 'Boston');
    fillInput('manual-postal-code', '02101');

    const stateSelect = element.shadowRoot?.querySelector<HTMLSelectElement>('#manual-state');
    if (stateSelect) {
      stateSelect.value = 'MA';
      stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Set timezone (required)
    const tzSelect = element.shadowRoot?.querySelector<HTMLSelectElement>('#account-timezone');
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
});
