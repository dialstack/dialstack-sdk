/**
 * Tests for the BusinessDetails React onboarding sub-step.
 *
 * Ported from WC reference tests in account-onboarding.test.ts (account step section).
 */

import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { BusinessDetails } from '../steps/account/BusinessDetails';
import type { AccountConfig } from '../../../types';
import {
  renderWithOnboarding,
  mockAccount,
  mockLocation,
  type RenderOnboardingOptions,
} from '../__test-helpers__/onboarding';

/**
 * Query helper: the component uses <label> + <input> as siblings (no htmlFor),
 * so testing-library's getByLabelText doesn't work. This finds the input/select
 * that is a sibling of a label matching the given text.
 */
function getFieldByLabel(
  container: HTMLElement,
  labelText: string
): HTMLInputElement | HTMLSelectElement {
  const labels = container.querySelectorAll('label');
  for (const label of labels) {
    if (label.textContent?.trim() === labelText) {
      const input = label.parentElement?.querySelector('input, select');
      if (input) return input as HTMLInputElement | HTMLSelectElement;
    }
  }
  throw new Error(`No input found for label "${labelText}"`);
}

describe('BusinessDetails', () => {
  const onAdvance = jest.fn();

  beforeEach(() => {
    onAdvance.mockReset();
  });

  // Helper: render and wait for the form to appear (loading spinner gone)
  async function renderBD(
    overrides: Record<string, unknown> & { __accountConfig?: AccountConfig } = {}
  ) {
    const { __accountConfig, ...instanceOverrides } = overrides;
    const opts: RenderOnboardingOptions = { instanceOverrides };
    if (__accountConfig) opts.accountConfig = __accountConfig;
    const result = await renderWithOnboarding(<BusinessDetails onAdvance={onAdvance} />, opts);
    await waitFor(() => {
      expect(screen.getByText('Business Details')).toBeTruthy();
    });
    return result;
  }

  function clickNext() {
    const nextBtn = screen.getByRole('button', { name: /next|saving/i });
    fireEvent.click(nextBtn);
  }

  /** Build a locations namespace override with sensible defaults. */
  function locationsNS(overrides: Record<string, unknown> = {}) {
    return {
      locations: {
        list: jest.fn().mockResolvedValue([mockLocation]),
        create: jest.fn().mockResolvedValue({
          id: 'loc_new',
          name: 'New',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        retrieve: jest.fn().mockResolvedValue(mockLocation),
        update: jest.fn().mockResolvedValue(mockLocation),
        validateE911: jest.fn().mockResolvedValue({ valid: true }),
        provisionE911: jest.fn().mockResolvedValue(mockLocation),
        ...overrides,
      },
    };
  }

  /** Build an account namespace override with sensible defaults. */
  function accountNS(overrides: Record<string, unknown> = {}) {
    return {
      account: {
        retrieve: jest.fn().mockResolvedValue(mockAccount),
        update: jest.fn().mockResolvedValue(mockAccount),
        ...overrides,
      },
    };
  }

  // ==========================================================================
  // Pre-population tests
  // ==========================================================================

  it('renders with pre-populated email from API', async () => {
    const { container } = await renderBD();

    const emailInput = getFieldByLabel(container, 'Primary Contact Email') as HTMLInputElement;
    expect(emailInput.value).toBe('existing@example.com');
  });

  it('renders with pre-populated company name from API', async () => {
    const { container } = await renderBD();

    const nameInput = getFieldByLabel(container, 'Company Name') as HTMLInputElement;
    expect(nameInput.value).toBe('Acme Corp');
  });

  it('renders with pre-populated phone from API', async () => {
    const { container } = await renderBD();

    const phoneInput = getFieldByLabel(
      container,
      'Primary Contact Phone Number'
    ) as HTMLInputElement;
    expect(phoneInput.value).toBe('(212) 555-0100');
  });

  it('renders with pre-populated primary contact from API', async () => {
    const { container } = await renderBD();

    const contactInput = getFieldByLabel(container, 'Primary Contact') as HTMLInputElement;
    expect(contactInput.value).toBe('Jane Doe');
  });

  it('pre-populates location name from existing location data', async () => {
    const { container } = await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([mockLocation]) }),
    });

    const nameInput = getFieldByLabel(container, 'Location Name') as HTMLInputElement;
    expect(nameInput.value).toBe('Main Office');
  });

  it('shows confirmed address card when existing location is loaded', async () => {
    const { container } = await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([mockLocation]) }),
    });

    expect(container.querySelector('.address-confirmed')).not.toBeNull();
  });

  // ==========================================================================
  // Validation tests
  // ==========================================================================

  it('validates company name required', async () => {
    await renderBD({
      ...accountNS({ retrieve: jest.fn().mockResolvedValue({ ...mockAccount, name: null }) }),
    });

    clickNext();

    await waitFor(() => {
      expect(screen.getByText('Company name is required')).toBeTruthy();
    });
  });

  it('validates email required', async () => {
    await renderBD({
      ...accountNS({ retrieve: jest.fn().mockResolvedValue({ ...mockAccount, email: null }) }),
    });

    clickNext();

    await waitFor(() => {
      expect(screen.getByText('Primary contact email is required')).toBeTruthy();
    });
  });

  it('validates phone number required', async () => {
    await renderBD({
      ...accountNS({ retrieve: jest.fn().mockResolvedValue({ ...mockAccount, phone: null }) }),
    });

    clickNext();

    await waitFor(() => {
      expect(screen.getByText('Primary contact phone number is required')).toBeTruthy();
    });
  });

  it('validates primary contact required', async () => {
    await renderBD({
      ...accountNS({
        retrieve: jest.fn().mockResolvedValue({ ...mockAccount, primary_contact_name: null }),
      }),
    });

    clickNext();

    await waitFor(() => {
      expect(screen.getByText('Primary contact is required')).toBeTruthy();
    });
  });

  it('validates phone number format', async () => {
    await renderBD({
      ...accountNS({ retrieve: jest.fn().mockResolvedValue({ ...mockAccount, phone: '123' }) }),
    });

    clickNext();

    await waitFor(() => {
      expect(screen.getByText('Enter a valid US phone number')).toBeTruthy();
    });
  });

  it('validates location name required', async () => {
    const { container } = await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([]) }),
    });

    // Clear the pre-populated location name
    fireEvent.change(getFieldByLabel(container, 'Location Name'), { target: { value: '' } });

    clickNext();

    await waitFor(() => {
      expect(screen.getByText('Location name is required')).toBeTruthy();
    });
  });

  it('validates address required when location name is filled but no address', async () => {
    const { container } = await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([]) }),
    });

    fireEvent.change(getFieldByLabel(container, 'Location Name'), { target: { value: 'HQ' } });

    clickNext();

    await waitFor(() => {
      expect(screen.getByText('Address is required')).toBeTruthy();
    });
  });

  it('validates timezone required when no timezone is set', async () => {
    await renderBD({
      ...accountNS({ retrieve: jest.fn().mockResolvedValue({ ...mockAccount, config: {} }) }),
      ...locationsNS({ list: jest.fn().mockResolvedValue([]) }),
      __accountConfig: { region: 'us-east', extension_length: 4 } as AccountConfig,
    });

    clickNext();

    await waitFor(() => {
      expect(screen.getByText('Timezone is required')).toBeTruthy();
    });
  });

  // ==========================================================================
  // Save / updateAccount tests
  // ==========================================================================

  it('calls updateAccount on successful save', async () => {
    const { instance } = await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([mockLocation]) }),
    });

    clickNext();

    await waitFor(() => {
      expect(instance.account.update).toHaveBeenCalled();
    });
  });

  it('includes all fields in updateAccount call', async () => {
    const { instance } = await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([mockLocation]) }),
    });

    clickNext();

    await waitFor(() => {
      const call = (instance.account.update as jest.Mock).mock.calls[0]?.[0];
      expect(call.name).toBe('Acme Corp');
      expect(call.email).toBe('existing@example.com');
      expect(call.phone).toBe('+12125550100');
      expect(call.primary_contact_name).toBe('Jane Doe');
    });
  });

  it('preserves existing config fields when saving', async () => {
    const { instance } = await renderBD({
      ...accountNS({
        retrieve: jest.fn().mockResolvedValue({
          ...mockAccount,
          config: { region: 'us-east', extension_length: 4, timezone: 'America/New_York' },
        }),
      }),
      ...locationsNS({ list: jest.fn().mockResolvedValue([mockLocation]) }),
    });

    clickNext();

    await waitFor(() => {
      const call = (instance.account.update as jest.Mock).mock.calls[0]?.[0];
      expect(call.config.region).toBe('us-east');
      expect(call.config.extension_length).toBe(4);
      expect(call.config.timezone).toBe('America/New_York');
    });
  });

  it('calls onAdvance with email after successful save', async () => {
    await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([mockLocation]) }),
    });

    clickNext();

    await waitFor(() => {
      expect(onAdvance).toHaveBeenCalledWith('existing@example.com');
    });
  });

  it('completes the business-details sub-step in progressStore', async () => {
    const { progressStore } = await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([mockLocation]) }),
    });

    clickNext();

    await waitFor(() => {
      expect(progressStore.getCompletedSubSteps('account').has('business-details')).toBe(true);
    });
  });

  // ==========================================================================
  // Address: search vs manual mode
  // ==========================================================================

  it('renders address search input by default (no existing location)', async () => {
    await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([]) }),
    });

    expect(screen.getByPlaceholderText('Start typing an address...')).toBeTruthy();
    expect(screen.getByText('Enter manually')).toBeTruthy();
  });

  it('switches to manual fields when "Enter manually" is clicked', async () => {
    const { container } = await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([]) }),
    });

    fireEvent.click(screen.getByText('Enter manually'));

    await waitFor(() => {
      expect(getFieldByLabel(container, 'Street')).toBeTruthy();
      expect(getFieldByLabel(container, 'City')).toBeTruthy();
      expect(getFieldByLabel(container, 'State')).toBeTruthy();
      expect(getFieldByLabel(container, 'ZIP')).toBeTruthy();
    });
  });

  it('switches back to search when "Search instead" is clicked', async () => {
    await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([]) }),
    });

    fireEvent.click(screen.getByText('Enter manually'));

    await waitFor(() => {
      expect(screen.getByText('Search instead')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Search instead'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Start typing an address...')).toBeTruthy();
    });
  });

  it('shows edit button on confirmed address', async () => {
    await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([mockLocation]) }),
    });

    expect(screen.getByText('Edit')).toBeTruthy();
  });

  it('switches to edit mode when Edit is clicked on confirmed address', async () => {
    const { container } = await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([mockLocation]) }),
    });

    fireEvent.click(screen.getByText('Edit'));

    await waitFor(() => {
      expect(getFieldByLabel(container, 'Street')).toBeTruthy();
    });
  });

  // ==========================================================================
  // createLocation / updateLocation tests
  // ==========================================================================

  it('calls createLocation with manual address data on save', async () => {
    const { container, instance } = await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([]) }),
    });

    // Fill location name
    fireEvent.change(getFieldByLabel(container, 'Location Name'), { target: { value: 'HQ' } });

    // Switch to manual
    fireEvent.click(screen.getByText('Enter manually'));

    await waitFor(() => {
      expect(getFieldByLabel(container, 'Street')).toBeTruthy();
    });

    // Fill manual address
    fireEvent.change(getFieldByLabel(container, '#'), { target: { value: '456' } });
    fireEvent.change(getFieldByLabel(container, 'Street'), { target: { value: 'Oak Ave' } });
    fireEvent.change(getFieldByLabel(container, 'City'), { target: { value: 'Chicago' } });
    fireEvent.change(getFieldByLabel(container, 'ZIP'), { target: { value: '60601' } });
    fireEvent.change(getFieldByLabel(container, 'State'), { target: { value: 'IL' } });

    // Set timezone
    fireEvent.change(getFieldByLabel(container, 'Timezone'), {
      target: { value: 'America/Chicago' },
    });

    clickNext();

    await waitFor(() => {
      expect(instance.locations.create).toHaveBeenCalledWith({
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
    const { instance } = await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([mockLocation]) }),
    });

    clickNext();

    await waitFor(() => {
      expect(instance.account.update).toHaveBeenCalled();
    });

    expect(instance.locations.create).not.toHaveBeenCalled();
  });

  it('calls updateLocation when location name changes on existing location', async () => {
    const updateLocationMock = jest
      .fn()
      .mockResolvedValue({ ...mockLocation, name: 'Renamed Office' });
    const { container, instance } = await renderBD({
      ...locationsNS({
        list: jest.fn().mockResolvedValue([mockLocation]),
        update: updateLocationMock,
      }),
    });

    // Change location name
    fireEvent.change(getFieldByLabel(container, 'Location Name'), {
      target: { value: 'Renamed Office' },
    });

    clickNext();

    await waitFor(() => {
      expect(updateLocationMock).toHaveBeenCalledWith(
        'loc_01abc',
        expect.objectContaining({ name: 'Renamed Office' })
      );
    });

    expect(instance.locations.create).not.toHaveBeenCalled();
  });

  it('calls updateLocation after editing a confirmed address', async () => {
    const updateLocationMock = jest.fn().mockResolvedValue({
      ...mockLocation,
      name: 'Updated Office',
      address: {
        ...mockLocation.address,
        street: 'Elm St',
        city: 'Boston',
        state: 'MA',
        postal_code: '02101',
      },
    });
    const { container } = await renderBD({
      ...locationsNS({
        list: jest.fn().mockResolvedValue([mockLocation]),
        update: updateLocationMock,
      }),
    });

    // Click edit on confirmed address
    fireEvent.click(screen.getByText('Edit'));

    await waitFor(() => {
      expect(getFieldByLabel(container, 'Street')).toBeTruthy();
    });

    // Update fields
    fireEvent.change(getFieldByLabel(container, 'Location Name'), {
      target: { value: 'Updated Office' },
    });
    fireEvent.change(getFieldByLabel(container, 'Street'), { target: { value: 'Elm St' } });
    fireEvent.change(getFieldByLabel(container, 'City'), { target: { value: 'Boston' } });
    fireEvent.change(getFieldByLabel(container, 'ZIP'), { target: { value: '02101' } });
    fireEvent.change(getFieldByLabel(container, 'State'), { target: { value: 'MA' } });
    fireEvent.change(getFieldByLabel(container, 'Timezone'), {
      target: { value: 'America/New_York' },
    });

    clickNext();

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
  });

  it('uses updateLocation (not createLocation) when editing confirmed address', async () => {
    const updateLocationMock = jest.fn().mockResolvedValue(mockLocation);
    const { container, instance } = await renderBD({
      ...locationsNS({
        list: jest.fn().mockResolvedValue([mockLocation]),
        update: updateLocationMock,
      }),
    });

    // Click edit
    fireEvent.click(screen.getByText('Edit'));

    await waitFor(() => {
      expect(getFieldByLabel(container, 'Street')).toBeTruthy();
    });

    // Fill required fields and save
    fireEvent.change(getFieldByLabel(container, 'Street'), { target: { value: 'Elm St' } });
    fireEvent.change(getFieldByLabel(container, 'City'), { target: { value: 'Boston' } });
    fireEvent.change(getFieldByLabel(container, 'ZIP'), { target: { value: '02101' } });
    fireEvent.change(getFieldByLabel(container, 'State'), { target: { value: 'MA' } });
    fireEvent.change(getFieldByLabel(container, 'Timezone'), {
      target: { value: 'America/New_York' },
    });

    clickNext();

    await waitFor(() => {
      expect(updateLocationMock).toHaveBeenCalled();
    });

    expect(instance.locations.create).not.toHaveBeenCalled();
  });

  it('reads locations from shared context (no direct listLocations call)', async () => {
    const { instance } = await renderBD();

    // BusinessDetails reads locations from OnboardingContext (pre-fetched at portal level),
    // so it should NOT call listLocations directly.
    expect(instance.locations.list).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // Timezone tests
  // ==========================================================================

  it('displays readonly timezone when address is confirmed', async () => {
    await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([mockLocation]) }),
    });

    expect(screen.getByText(/Eastern/)).toBeTruthy();
  });

  it('shows timezone dropdown after editing a confirmed address', async () => {
    const { container } = await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([mockLocation]) }),
    });

    fireEvent.click(screen.getByText('Edit'));

    await waitFor(() => {
      const tzSelect = getFieldByLabel(container, 'Timezone');
      expect(tzSelect.tagName).toBe('SELECT');
    });
  });

  it('preserves timezone value when editing a confirmed address', async () => {
    const { container } = await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([mockLocation]) }),
    });

    fireEvent.click(screen.getByText('Edit'));

    await waitFor(() => {
      const tzSelect = getFieldByLabel(container, 'Timezone') as HTMLSelectElement;
      expect(tzSelect.value).toBe('America/New_York');
    });
  });

  it('allows changing timezone via select after editing address', async () => {
    const { container, instance } = await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([mockLocation]) }),
    });

    fireEvent.click(screen.getByText('Edit'));

    await waitFor(() => {
      expect(getFieldByLabel(container, 'Timezone')).toBeTruthy();
    });

    fireEvent.change(getFieldByLabel(container, 'Timezone'), {
      target: { value: 'America/Chicago' },
    });

    // Fill required manual fields
    fireEvent.change(getFieldByLabel(container, 'Street'), { target: { value: 'Elm St' } });
    fireEvent.change(getFieldByLabel(container, 'City'), { target: { value: 'Boston' } });
    fireEvent.change(getFieldByLabel(container, 'ZIP'), { target: { value: '02101' } });
    fireEvent.change(getFieldByLabel(container, 'State'), { target: { value: 'MA' } });

    clickNext();

    await waitFor(() => {
      const call = (instance.account.update as jest.Mock).mock.calls[0]?.[0];
      expect(call.config.timezone).toBe('America/Chicago');
    });
  });

  it('preserves timezone when switching between address modes', async () => {
    const { container } = await renderBD({
      ...accountNS({
        retrieve: jest.fn().mockResolvedValue({
          ...mockAccount,
          config: { timezone: 'America/New_York' },
        }),
      }),
      ...locationsNS({ list: jest.fn().mockResolvedValue([mockLocation]) }),
    });

    // Edit confirmed address
    fireEvent.click(screen.getByText('Edit'));

    await waitFor(() => {
      expect(getFieldByLabel(container, 'Street')).toBeTruthy();
    });

    // Switch to search
    fireEvent.click(screen.getByText('Search instead'));

    await waitFor(() => {
      const tzSelect = getFieldByLabel(container, 'Timezone') as HTMLSelectElement;
      expect(tzSelect.value).toBe('America/New_York');
    });

    // Switch back to manual
    fireEvent.click(screen.getByText('Enter manually'));

    await waitFor(() => {
      const tzSelect = getFieldByLabel(container, 'Timezone') as HTMLSelectElement;
      expect(tzSelect.value).toBe('America/New_York');
    });
  });

  it('shows timezone placeholder when account has no timezone', async () => {
    const { container } = await renderBD({
      ...accountNS({ retrieve: jest.fn().mockResolvedValue({ ...mockAccount, config: {} }) }),
      ...locationsNS({ list: jest.fn().mockResolvedValue([]) }),
      __accountConfig: { region: 'us-east', extension_length: 4 } as AccountConfig,
    });

    const tzSelect = getFieldByLabel(container, 'Timezone') as HTMLSelectElement;
    expect(tzSelect.value).toBe('');
  });

  // ==========================================================================
  // Error handling
  // ==========================================================================

  it('shows save error when updateAccount fails', async () => {
    await renderBD({
      ...locationsNS({ list: jest.fn().mockResolvedValue([mockLocation]) }),
      ...accountNS({ update: jest.fn().mockRejectedValue(new Error('Network error')) }),
    });

    clickNext();

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy();
    });
  });

  // ==========================================================================
  // Phone formatting
  // ==========================================================================

  it('formats phone number on input', async () => {
    const { container } = await renderBD({
      ...accountNS({ retrieve: jest.fn().mockResolvedValue({ ...mockAccount, phone: null }) }),
    });

    const phoneInput = getFieldByLabel(
      container,
      'Primary Contact Phone Number'
    ) as HTMLInputElement;
    fireEvent.change(phoneInput, { target: { value: '2125550100' } });

    // The component strips non-digits and formats via AsYouType
    expect(phoneInput.value).not.toBe('');
  });
});
