/**
 * Tests for NumbersStep React component.
 *
 * Ported from the WC reference tests in
 * sdk/src/components/__tests__/account-onboarding.test.ts (lines 1870–3450).
 */

import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { NumbersStep } from '../steps/numbers/NumbersStep';
import {
  renderWithOnboarding,
  mockDID,
  mockMatchingDID,
  mockLocation,
  type RenderOnboardingResult,
  type RenderOnboardingOptions,
} from '../__test-helpers__/onboarding';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

/** DID matching the account phone (212) 555-0100 -> +12125550100 */
const mockAccountDID = {
  ...mockMatchingDID,
  id: 'did_02acct',
  caller_id_name: 'ACME Corp',
};

const emptyPage = {
  object: 'list' as const,
  data: [],
  next_page_url: null,
  previous_page_url: null,
};

const didPage = (data: unknown[]) => ({
  object: 'list' as const,
  data,
  next_page_url: null,
  previous_page_url: null,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default locations namespace for NumbersStep tests. */
function defaultLocationsNS(overrides: Record<string, unknown> = {}) {
  return {
    locations: {
      list: jest.fn().mockResolvedValue([mockLocation]),
      create: jest.fn().mockResolvedValue({
        id: 'loc_new',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      retrieve: jest.fn().mockResolvedValue(mockLocation),
      update: jest.fn().mockResolvedValue(mockLocation),
      validateE911: jest.fn().mockResolvedValue({ adjusted: false, address: {} }),
      provisionE911: jest.fn().mockResolvedValue({
        ...mockLocation,
        e911_status: 'pending',
        primary_did_id: 'did_01abc',
      }),
      ...overrides,
    },
  };
}

/** Default phoneNumberOrders namespace. */
function defaultPhoneNumberOrdersNS(overrides: Record<string, unknown> = {}) {
  return {
    phoneNumberOrders: {
      create: jest.fn().mockResolvedValue({
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
      retrieve: jest.fn().mockResolvedValue({
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
      list: jest.fn().mockResolvedValue({
        object: 'list',
        data: [],
        next_page_url: null,
        previous_page_url: null,
      }),
      ...overrides,
    },
  };
}

/** Default portOrders namespace. */
function defaultPortOrdersNS(overrides: Record<string, unknown> = {}) {
  return {
    portOrders: {
      checkEligibility: jest.fn().mockResolvedValue({
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
      create: jest.fn().mockResolvedValue({
        id: 'po_01abc',
        status: 'draft',
        details: { phone_numbers: ['+12125551001'], subscriber: null },
        submitted_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }),
      approve: jest.fn().mockResolvedValue({
        id: 'po_01abc',
        status: 'approved',
        details: { phone_numbers: ['+12125551001'] },
        submitted_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }),
      submit: jest.fn().mockResolvedValue({
        id: 'po_01abc',
        status: 'submitted',
        details: { phone_numbers: ['+12125551001'] },
        submitted_at: '2026-01-01T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
      }),
      cancel: jest.fn().mockResolvedValue(undefined),
      retrieve: jest.fn().mockResolvedValue({}),
      list: jest.fn().mockResolvedValue({
        object: 'list',
        data: [],
        next_page_url: null,
        previous_page_url: null,
      }),
      uploadCSR: jest.fn().mockResolvedValue(undefined),
      uploadBillCopy: jest.fn().mockResolvedValue(undefined),
      downloadCSR: jest.fn().mockResolvedValue(new Blob()),
      downloadBillCopy: jest.fn().mockResolvedValue(new Blob()),
      ...overrides,
    },
  };
}

/** Default availablePhoneNumbers namespace. */
function defaultAvailablePhoneNumbersNS(overrides: Record<string, unknown> = {}) {
  return {
    availablePhoneNumbers: {
      search: jest.fn().mockResolvedValue([]),
      ...overrides,
    },
  };
}

/** Default phoneNumbers namespace. */
function phoneNumbersNS(overrides: Record<string, unknown> = {}) {
  return {
    phoneNumbers: {
      retrieve: jest.fn().mockResolvedValue(mockDID),
      list: jest.fn().mockResolvedValue({
        object: 'list',
        data: [mockDID],
        next_page_url: null,
        previous_page_url: null,
      }),
      update: jest.fn().mockResolvedValue(mockDID),
      updateRoute: jest.fn().mockResolvedValue(mockDID),
      ...overrides,
    },
  };
}

/** Render NumbersStep with given instance overrides. */
async function renderNumbers(
  overrides: RenderOnboardingOptions['instanceOverrides'] = {}
): Promise<RenderOnboardingResult> {
  return await renderWithOnboarding(<NumbersStep />, {
    instanceOverrides: {
      ...defaultLocationsNS(),
      ...defaultPhoneNumberOrdersNS(),
      ...defaultPortOrdersNS(),
      ...defaultAvailablePhoneNumbersNS(),
      ...overrides,
    },
  });
}

/** Wait for the overview to finish loading numbers. */
async function waitForOverview() {
  // The component starts with isLoadingNumbers=true (spinner), then loads content.
  // Wait for either the action cards to render (normal) or an error alert.
  await waitFor(() => {
    const hasActionCards = document.querySelector('.num-action-card') !== null;
    const hasError = document.querySelector('.inline-alert.error') !== null;
    expect(hasActionCards || hasError).toBe(true);
  });
}

/** Click the overview Next button to advance directly to caller ID. */
async function advanceToPrimaryDID(_instance: RenderOnboardingResult['instance']) {
  await waitForOverview();
  fireEvent.click(screen.getByRole('button', { name: /Next/i }));
  await waitFor(() => {
    expect(document.querySelector('.num-cid-section')).not.toBeNull();
  });
}

/** Caller ID is now the first post-overview configuration screen. */
async function advanceToCallerId() {
  await waitFor(() => {
    expect(document.querySelector('.num-cid-section')).not.toBeNull();
  });
}

/** Advance from caller-id to directory-listing. Clicks Next on caller-id. */
async function advanceToDirectoryListing() {
  fireEvent.click(screen.getByRole('button', { name: /Next/i }));
  await waitFor(() => {
    expect(document.body.textContent).toContain('Directory Listing');
  });
}

/** Click an action card by matching its title text. */
function clickActionCard(titleSubstring: string) {
  const cards = document.querySelectorAll('.num-action-card');
  const card = Array.from(cards).find((c) => c.textContent?.includes(titleSubstring));
  expect(card).not.toBeNull();
  fireEvent.click(card!);
}

/** Navigate to the port-numbers sub-step. */
async function navigateToPort() {
  await waitForOverview();
  clickActionCard('Port Existing');
  await waitFor(() => {
    expect(document.querySelector('.num-port-rows input[type="tel"]')).not.toBeNull();
  });
}

/** Navigate to the order-search sub-step. */
async function navigateToOrder() {
  await waitForOverview();
  clickActionCard('Request New');
  await waitFor(() => {
    expect(document.body.textContent).toContain('Search Available Numbers');
  });
}

/** Rows currently rendered in the port-numbers step. */
function portRows(): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('.num-port-rows input[type="tel"]')
  );
}

/**
 * Put a list into the step the way a person would: paste it into the first row
 * and let it fan out.
 */
function enterPortNumbers(text: string) {
  const [first] = portRows();
  if (!first) throw new Error('port numbers rows not rendered');
  const clipboardData = {
    getData: () => text,
  } as unknown as DataTransfer;
  fireEvent.paste(first, { clipboardData });
  // A single value produces no fan-out, so it is typed instead.
  if (portRows().length <= 1 && !text.includes('\n') && !text.includes(',')) {
    fireEvent.change(first, { target: { value: text } });
    fireEvent.blur(first);
  }
}

/** Fill a text input by its placeholder text. */
function fillByPlaceholder(placeholder: string, value: string) {
  const input = screen.getByPlaceholderText(placeholder);
  fireEvent.change(input, { target: { value } });
}

/** Navigate through the full port flow to a target sub-step. */
async function navigatePortFlowTo(
  instance: RenderOnboardingResult['instance'],
  target: 'eligibility' | 'subscriber' | 'foc-date' | 'documents' | 'review' | 'submitted'
) {
  await navigateToPort();

  // Enter phone number
  enterPortNumbers('(212) 555-1001');

  // Check eligibility
  fireEvent.click(screen.getByRole('button', { name: /Check Eligibility/i }));
  await waitFor(() => {
    expect(document.body.textContent).toContain('Portable');
  });
  if (target === 'eligibility') return;

  // To subscriber
  fireEvent.click(screen.getByRole('button', { name: /Continue with Portable/i }));
  await waitFor(() => {
    expect(document.body.textContent).toContain('Subscriber Information');
  });

  // Fill subscriber form
  fillByPlaceholder('(555) 123-4567', '(212) 555-1001');
  fillByPlaceholder('Acme Corp', 'Acme Corp');
  fillByPlaceholder('John Doe', 'John Doe');
  fillByPlaceholder('123', '123');
  fillByPlaceholder('Main St', 'Main St');

  // City field in subscriber — use the specific one in the address grid
  const cityInputs = screen.getAllByPlaceholderText('New York');
  fireEvent.change(cityInputs[cityInputs.length - 1]!, { target: { value: 'New York' } });

  const zipInputs = screen.getAllByPlaceholderText('10001');
  fireEvent.change(zipInputs[zipInputs.length - 1]!, { target: { value: '10001' } });

  // Select state
  const stateSelects = document.querySelectorAll<HTMLSelectElement>('select');
  const stateSelect = Array.from(stateSelects).find((s) =>
    Array.from(s.options).some((o) => o.value === 'NY')
  );
  if (stateSelect) fireEvent.change(stateSelect, { target: { value: 'NY' } });

  if (target === 'subscriber') return;

  // Advance to FOC date
  const nextButtons = screen.getAllByRole('button', { name: /Next/i });
  fireEvent.click(nextButtons[nextButtons.length - 1]!);
  await waitFor(() => {
    expect(document.body.textContent).toContain('Requested Port Date');
  });

  // Fill FOC date
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 10);
  const dateStr = futureDate.toISOString().split('T')[0]!;
  const dateInput = document.querySelector<HTMLInputElement>('input[type="date"]')!;
  fireEvent.change(dateInput, { target: { value: dateStr } });

  // Select time
  const timeSelect = document.querySelector<HTMLSelectElement>('select')!;
  fireEvent.change(timeSelect, { target: { value: '10:00' } });

  if (target === 'foc-date') return;

  // Advance to documents
  const nextBtns2 = screen.getAllByRole('button', { name: /Next/i });
  fireEvent.click(nextBtns2[nextBtns2.length - 1]!);
  await waitFor(() => {
    expect(document.body.textContent).toContain('Supporting Documents');
  });

  // Upload bill copy
  const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
  const billInput = fileInputs[0]!;
  const file = new File(['mock'], 'bill.pdf', { type: 'application/pdf' });
  Object.defineProperty(billInput, 'files', { value: [file], configurable: true });
  fireEvent.change(billInput);

  if (target === 'documents') return;

  // Advance to review
  const nextBtns3 = screen.getAllByRole('button', { name: /Next/i });
  fireEvent.click(nextBtns3[nextBtns3.length - 1]!);
  await waitFor(() => {
    expect(document.body.textContent).toContain('Review');
  });

  if (target === 'review') return;

  // Fill signature and submit
  fillByPlaceholder('Type your full legal name', 'John Doe');
  fireEvent.click(screen.getByRole('button', { name: /Approve & Submit/i }));
  await waitFor(() => {
    expect(document.body.textContent).toContain('Port Request Submitted');
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NumbersStep', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==========================================================================
  // Overview + Navigation
  // ==========================================================================

  describe('Overview + Navigation', () => {
    it('renders overview with empty state when no numbers exist', async () => {
      await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(emptyPage) }),
      });
      await waitForOverview();
      expect(document.body.textContent).toContain('No telephone numbers yet');
      expect(document.querySelector('.num-action-card')).not.toBeNull();
    });

    it('renders existing phone numbers in the overview table', async () => {
      await renderNumbers({
        ...phoneNumbersNS({
          list: jest.fn().mockResolvedValue(
            didPage([
              {
                id: 'did_01',
                phone_number: '+12125551001',
                status: 'active',
                outbound_enabled: true,
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
              },
            ])
          ),
        }),
      });

      await waitFor(() => {
        expect(document.body.textContent).toContain('(212) 555-1001');
        expect(document.body.textContent).toContain('Active');
      });
    });

    it('shows main step footer only at overview sub-step', async () => {
      await renderNumbers();
      await waitForOverview();
      // At overview, the Next button should be present
      expect(screen.getByRole('button', { name: /Next/i })).toBeTruthy();

      // Navigate into order sub-flow
      await navigateToOrder();
      // Main "Next" with arrow should not be the primary action; Search button is instead
      expect(screen.getByRole('button', { name: /Search$/i })).toBeTruthy();
    });

    it('advances from overview directly to caller ID', async () => {
      const result = await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(didPage([mockDID])) }),
      });

      await advanceToPrimaryDID(result.instance);

      expect(document.querySelector('.primary-did-section')).toBeNull();
      expect(document.querySelector('.num-cid-section')).not.toBeNull();
    });

    it('shows error when numbers data fails to load', async () => {
      await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockRejectedValue(new Error('Network error')) }),
      });

      await waitFor(() => {
        expect(document.body.textContent).toContain('Network error');
        expect(screen.getByRole('button', { name: /Retry/i })).toBeTruthy();
      });
    });
  });

  // ==========================================================================
  // Primary DID retirement
  // ==========================================================================

  describe('Primary DID retirement', () => {
    it('goes directly from overview to caller ID without writing a location DID', async () => {
      const updateLocation = jest.fn();
      const result = await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(didPage([mockDID])) }),
        locations: { update: updateLocation },
      });

      await advanceToPrimaryDID(result.instance);

      expect(document.querySelector('.primary-did-section')).toBeNull();
      expect(document.querySelector('.num-cid-section')).not.toBeNull();
      expect(updateLocation).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Caller ID
  // ==========================================================================

  describe('Caller ID', () => {
    it('renders caller ID cards for each active DID', async () => {
      const didWithoutCnam = { ...mockDID, caller_id_name: null };
      const result = await renderNumbers({
        ...phoneNumbersNS({
          list: jest.fn().mockResolvedValue(didPage([didWithoutCnam, mockAccountDID])),
        }),
      });

      await advanceToPrimaryDID(result.instance);
      await advanceToCallerId();

      const cards = document.querySelectorAll('.num-phone-card--cid');
      expect(cards.length).toBe(2);
    });

    it('pre-fills and marks submitted for DIDs with existing caller_id_name', async () => {
      const result = await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(didPage([mockDID])) }), // has caller_id_name
      });

      await advanceToPrimaryDID(result.instance);
      await advanceToCallerId();

      // The input should be pre-filled
      const inputs = document.querySelectorAll<HTMLInputElement>('.num-cid-input');
      expect(inputs.length).toBe(1);
      expect(inputs[0]!.value).toBe('ACME Corp');

      // Status should show submitted checkmark
      expect(document.querySelector('.num-cid-status-submitted')).not.toBeNull();
    });

    it('blocks at overview when no active DIDs exist (cannot reach caller-id)', async () => {
      await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(emptyPage) }),
      });

      await waitForOverview();

      // Click next — gate blocks
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => {
        expect(document.body.textContent).toContain('You need at least one phone number');
      });

      // Should not have advanced to caller-id.
      expect(document.querySelector('.primary-did-section')).toBeNull();
      expect(document.querySelector('.num-cid-section')).toBeNull();
    });

    it('submits caller ID via Next button and calls updatePhoneNumber', async () => {
      const didWithoutCnam = { ...mockDID, id: 'did_nocnam', caller_id_name: null };
      const updatePhoneNumber = jest.fn().mockResolvedValue(undefined);
      const result = await renderNumbers({
        ...phoneNumbersNS({
          list: jest.fn().mockResolvedValue(didPage([didWithoutCnam])),
          update: updatePhoneNumber,
        }),
      });

      await advanceToPrimaryDID(result.instance);
      await advanceToCallerId();

      // Type a caller ID name
      const input = document.querySelector<HTMLInputElement>('.num-cid-input')!;
      fireEvent.change(input, { target: { value: 'Test Corp' } });

      // Click Next to trigger bulk submission
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        expect(updatePhoneNumber).toHaveBeenCalledWith('did_nocnam', {
          caller_id_name: 'Test Corp',
        });
      });
    });

    it('shows validation error when Next is clicked with invalid caller ID', async () => {
      const didWithoutCnam = { ...mockDID, id: 'did_invalid', caller_id_name: null };
      const result = await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(didPage([didWithoutCnam])) }),
      });

      await advanceToPrimaryDID(result.instance);
      await advanceToCallerId();

      // Type invalid characters
      const input = document.querySelector<HTMLInputElement>('.num-cid-input')!;
      fireEvent.change(input, { target: { value: 'Test@Corp!' } });

      // Click Next to trigger validation
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        const error = document.querySelector('.num-cid-status-error');
        expect(error).not.toBeNull();
        expect(error?.textContent).toContain('letters, numbers, spaces, and hyphens');
      });
    });

    it('Next triggers bulk submission when caller IDs are not yet submitted', async () => {
      const didWithoutCnam = { ...mockDID, id: 'did_block', caller_id_name: null };
      const updatePhoneNumber = jest.fn().mockResolvedValue(undefined);
      const result = await renderNumbers({
        ...phoneNumbersNS({
          list: jest.fn().mockResolvedValue(didPage([didWithoutCnam])),
          update: updatePhoneNumber,
        }),
      });

      await advanceToPrimaryDID(result.instance);
      await advanceToCallerId();

      // Type a valid caller ID name
      const input = document.querySelector<HTMLInputElement>('.num-cid-input')!;
      fireEvent.change(input, { target: { value: 'My Corp' } });

      // Click Next triggers submission
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        expect(updatePhoneNumber).toHaveBeenCalledWith('did_block', { caller_id_name: 'My Corp' });
      });
    });

    it('advances immediately when all caller IDs are pre-submitted', async () => {
      const result = await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(didPage([mockDID])) }), // has caller_id_name
      });

      await advanceToPrimaryDID(result.instance);
      await advanceToCallerId();

      // Click Next — should advance past caller-id to directory-listing (DID is pre-submitted)
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        expect(document.body.textContent).toContain('Directory Listing');
      });
    });

    it('shows skip button after mixed results (some succeed, some fail)', async () => {
      const did1 = { ...mockDID, id: 'did_ok', caller_id_name: null };
      const did2 = {
        ...mockDID,
        id: 'did_fail',
        phone_number: '+12125551002',
        caller_id_name: null,
      };
      const updatePhoneNumber = jest.fn().mockImplementation((id: string) => {
        if (id === 'did_fail') return Promise.reject(new Error('API error'));
        return Promise.resolve(undefined);
      });
      const result = await renderNumbers({
        ...phoneNumbersNS({
          list: jest.fn().mockResolvedValue(didPage([did1, did2])),
          update: updatePhoneNumber,
        }),
      });

      await advanceToPrimaryDID(result.instance);
      await advanceToCallerId();

      // Fill both inputs
      const inputs = document.querySelectorAll<HTMLInputElement>('.num-cid-input');
      fireEvent.change(inputs[0]!, { target: { value: 'OK Corp' } });
      fireEvent.change(inputs[1]!, { target: { value: 'Fail Corp' } });

      // Click Next
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        // Skip button should appear after partial failure
        expect(screen.getByRole('button', { name: /Skip/i })).toBeTruthy();
        // Inline error should be visible on the failed card
        expect(document.querySelector('.num-cid-status-error')).not.toBeNull();
      });
    }, 15000);

    it('skip after error advances to next step', async () => {
      const didWithoutCnam = { ...mockDID, id: 'did_skip', caller_id_name: null };
      const updatePhoneNumber = jest.fn().mockRejectedValue(new Error('fail'));
      const result = await renderNumbers({
        ...phoneNumbersNS({
          list: jest.fn().mockResolvedValue(didPage([didWithoutCnam])),
          update: updatePhoneNumber,
        }),
      });

      await advanceToPrimaryDID(result.instance);
      await advanceToCallerId();

      // Fill and trigger Next
      const input = document.querySelector<HTMLInputElement>('.num-cid-input')!;
      fireEvent.change(input, { target: { value: 'Skip Corp' } });
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // Wait for error + skip button
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Skip/i })).toBeTruthy();
      });

      // Click skip
      fireEvent.click(screen.getByRole('button', { name: /Skip/i }));

      // Should advance past caller-id
      await waitFor(() => {
        expect(document.querySelector('.num-cid-section')).toBeNull();
      });
    });

    it('retries only errored DIDs on second Next press', async () => {
      const did1 = { ...mockDID, id: 'did_ok2', caller_id_name: null };
      const did2 = {
        ...mockDID,
        id: 'did_retry',
        phone_number: '+12125551003',
        caller_id_name: null,
      };
      let callCount = 0;
      const updatePhoneNumber = jest.fn().mockImplementation((id: string) => {
        if (id === 'did_retry') {
          callCount++;
          if (callCount <= 1) return Promise.reject(new Error('fail'));
        }
        return Promise.resolve(undefined);
      });
      const result = await renderNumbers({
        ...phoneNumbersNS({
          list: jest.fn().mockResolvedValue(didPage([did1, did2])),
          update: updatePhoneNumber,
        }),
      });

      await advanceToPrimaryDID(result.instance);
      await advanceToCallerId();

      // Fill both
      const inputs = document.querySelectorAll<HTMLInputElement>('.num-cid-input');
      fireEvent.change(inputs[0]!, { target: { value: 'OK Corp' } });
      fireEvent.change(inputs[1]!, { target: { value: 'Retry Corp' } });

      // First Next — did_ok2 succeeds, did_retry fails
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Skip/i })).toBeTruthy();
      });

      // Clear mock tracking
      updatePhoneNumber.mockClear();

      // Edit the errored input to clear the error state
      const retryInput = inputs[1]!;
      fireEvent.change(retryInput, { target: { value: 'Retry Corp' } });

      // Wait for Next button to reappear
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Next/i })).toBeTruthy();
      });

      // Second Next — only did_retry should be re-submitted
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => {
        expect(updatePhoneNumber).toHaveBeenCalledTimes(1);
        expect(updatePhoneNumber).toHaveBeenCalledWith('did_retry', {
          caller_id_name: 'Retry Corp',
        });
      });
    }, 15000);
  });

  // ==========================================================================
  // Order Flow
  // ==========================================================================

  describe('Order Flow', () => {
    it('navigates to order search when clicking Request New Numbers', async () => {
      await renderNumbers();
      await navigateToOrder();
      expect(document.body.textContent).toContain('Search Available Numbers');
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

      await renderNumbers({
        ...defaultAvailablePhoneNumbersNS({ search: jest.fn().mockResolvedValue(mockAvailable) }),
      });

      await navigateToOrder();

      // Enter area code
      const areaInput = screen.getByPlaceholderText('212');
      fireEvent.change(areaInput, { target: { value: '212' } });

      // Click search
      fireEvent.click(screen.getByRole('button', { name: /Search$/i }));

      await waitFor(() => {
        expect(document.body.textContent).toContain('(212) 555-9001');
        expect(document.body.textContent).toContain('(212) 555-9002');
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

      const result = await renderNumbers({
        ...defaultAvailablePhoneNumbersNS({ search: jest.fn().mockResolvedValue(mockAvailable) }),
      });

      await navigateToOrder();

      // Search
      fireEvent.click(screen.getByRole('button', { name: /Search$/i }));

      await waitFor(() => {
        expect(document.body.textContent).toContain('(212) 555-9001');
      });

      // Select the number via checkbox
      const checkboxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
      // First checkbox is select-all, second is the number
      const numberCheckbox = checkboxes.length > 1 ? checkboxes[1]! : checkboxes[0]!;
      fireEvent.click(numberCheckbox);

      // Click Confirm
      fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));

      await waitFor(() => {
        expect(document.body.textContent).toContain('Confirm Your Order');
      });

      // Place order
      fireEvent.click(screen.getByRole('button', { name: /Place Order/i }));

      await waitFor(() => {
        expect(
          (result.instance as unknown as Record<string, Record<string, jest.Mock>>)
            .phoneNumberOrders.create
        ).toHaveBeenCalledWith(['+12125559001']);
      });

      // Should show order status
      await waitFor(() => {
        expect(document.body.textContent).toContain('Order Submitted');
      });

      fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

      await waitFor(() => {
        expect(document.querySelector('.num-cid-section')).not.toBeNull();
      });
      expect(document.querySelector('.primary-did-section')).toBeNull();
    });

    it('returns to overview from order sub-flow via cancel', async () => {
      await renderNumbers();
      await navigateToOrder();

      // Click back button
      fireEvent.click(screen.getByRole('button', { name: /Back$/i }));

      await waitFor(() => {
        expect(document.querySelector('.num-action-card')).not.toBeNull();
      });
    });
  });

  // ==========================================================================
  // Port Flow
  // ==========================================================================

  describe('Port Flow', () => {
    it('navigates to port flow when clicking Port Existing Numbers', async () => {
      await renderNumbers();
      await navigateToPort();
      expect(document.body.textContent).toContain('Numbers to Port');
    });

    it('accepts many numbers pasted at once and normalizes them', async () => {
      await renderNumbers();
      await navigateToPort();

      enterPortNumbers('2125551001, 212-555-1002\n+1 212 555 1003');

      await waitFor(() => {
        expect(document.body.textContent).toContain('3 numbers ready');
      });

      expect(portRows().map((r) => r.value)).toEqual([
        '(212) 555-1001',
        '(212) 555-1002',
        '(212) 555-1003',
      ]);
    });

    it('blocks continuing while any row is unreadable', async () => {
      await renderNumbers();
      await navigateToPort();

      enterPortNumbers('2125551001\n(000) 123-4567');

      await waitFor(() => {
        expect(document.body.textContent).toContain('Not a valid US phone number');
      });

      expect(screen.getByRole('button', { name: /Check Eligibility/i })).toBeDisabled();
    });

    it('canonicalises a paste immediately, without waiting for a blur', async () => {
      await renderNumbers();
      await navigateToPort();

      enterPortNumbers('2125551001, 212-555-1002\n2125551001');

      await waitFor(() => {
        expect(portRows()).toHaveLength(3);
      });
      // The repeat keeps its own row and is marked in place rather than removed.
      expect(portRows().map((r) => r.value)).toEqual([
        '(212) 555-1001',
        '(212) 555-1002',
        '(212) 555-1001',
      ]);
      expect(document.body.textContent).toContain('2 numbers ready');
      expect(document.body.textContent).toContain('Duplicate of row 1');
    });

    it('does not rewrite a number while it is still being typed', async () => {
      await renderNumbers();
      await navigateToPort();

      const [first] = portRows();
      if (!first) throw new Error('port numbers rows not rendered');

      fireEvent.change(first, { target: { value: '(212) 555-10' } });

      await waitFor(() => {
        expect(portRows()[0]?.value).toBe('(212) 555-10');
      });
    });

    it('adds a row from a real button, not a text link', async () => {
      await renderNumbers();
      await navigateToPort();
      enterPortNumbers('2125551001');

      const rows = () => document.querySelectorAll('.num-port-rows input[type="tel"]').length;
      const before = rows();

      // Queried by role: it renders as a link-styled span in an earlier version,
      // which gave a form action the affordance of navigation and left it out of
      // the button tab order.
      const add = screen.getByRole('button', { name: /Add another number/i });
      expect(add).toHaveAttribute('type', 'button');
      fireEvent.click(add);

      await waitFor(() => expect(rows()).toBe(before + 1));
    });

    it('marks a repeat in place and blocks on it', async () => {
      await renderNumbers();
      await navigateToPort();

      enterPortNumbers('2125551001\n212-555-1001');

      await waitFor(() => {
        expect(document.body.textContent).toContain('Duplicate of row 1');
        expect(document.body.textContent).toContain('1 number ready');
      });

      // The repeat keeps its row but is not ordered, so leaving it would submit
      // two rows as one number. Blocking makes the reader delete it, and what is
      // on screen then matches what is sent.
      expect(document.body.textContent).toContain('1 row needs attention');
      expect(screen.getByRole('button', { name: /Check Eligibility/i })).toBeDisabled();
    });

    it('checks port eligibility and shows results', async () => {
      const result = await renderNumbers();
      await navigateToPort();

      // Enter phone
      enterPortNumbers('(212) 555-1001');

      // Check eligibility
      fireEvent.click(screen.getByRole('button', { name: /Check Eligibility/i }));

      await waitFor(() => {
        expect(
          (result.instance as unknown as Record<string, Record<string, jest.Mock>>).portOrders
            .checkEligibility
        ).toHaveBeenCalled();
        expect(document.body.textContent).toContain('Portable');
        expect(document.body.textContent).toContain('OldCo');
      });
    });

    it('shows subscriber form after eligibility and validates required fields', async () => {
      await renderNumbers();
      await navigateToPort();

      enterPortNumbers('(212) 555-1001');

      fireEvent.click(screen.getByRole('button', { name: /Check Eligibility/i }));

      await waitFor(() => {
        expect(document.body.textContent).toContain('Portable');
      });

      fireEvent.click(screen.getByRole('button', { name: /Continue with Portable/i }));

      await waitFor(() => {
        expect(document.body.textContent).toContain('Subscriber Information');
      });

      // Try to advance without filling — should show validation errors
      const nextButtons = screen.getAllByRole('button', { name: /Next/i });
      fireEvent.click(nextButtons[nextButtons.length - 1]!);

      await waitFor(() => {
        expect(document.body.textContent).toContain('BTN is required');
        expect(document.body.textContent).toContain('Business name is required');
      });
    });

    it('reports a non-portable number against its row and stays put', async () => {
      await renderNumbers({
        ...defaultPortOrdersNS({
          checkEligibility: jest.fn().mockResolvedValue({
            portable_numbers: [],
            non_portable_numbers: [{ phone_number: '+12125551001', city: 'New York', state: 'NY' }],
          }),
        }),
      });

      await navigateToPort();
      enterPortNumbers('(212) 555-1001');
      fireEvent.click(screen.getByRole('button', { name: /Check Eligibility/i }));

      await waitFor(() => {
        expect(document.body.textContent).toContain('Not Portable');
      });
      // The message sits on the row holding that number.
      expect(document.querySelectorAll('.num-port-row-error')).toHaveLength(1);
    });

    it('turns a conflict code into copy the customer can act on', async () => {
      // The API's `error` string is written for a log. The stable `code` beside
      // it is the contract this decodes — showing the raw message instead is
      // what the admin portal already avoids.
      const conflict = Object.assign(new Error('4 phone number(s) are unavailable'), {
        name: 'ApiError',
        status: 409,
        code: 'phone_numbers_already_claimed',
      });
      await renderNumbers({
        ...defaultPortOrdersNS({
          checkEligibility: jest.fn().mockRejectedValue(conflict),
        }),
      });

      await navigateToPort();
      enterPortNumbers('(212) 555-1001');
      fireEvent.click(screen.getByRole('button', { name: /Check Eligibility/i }));

      await waitFor(() => {
        expect(document.body.textContent).toContain('already in use');
      });
      expect(document.body.textContent).not.toContain('phone number(s) are unavailable');
    });

    it('falls back to the message when an error carries no code', async () => {
      await renderNumbers({
        ...defaultPortOrdersNS({
          checkEligibility: jest.fn().mockRejectedValue(new Error('network unreachable')),
        }),
      });

      await navigateToPort();
      enterPortNumbers('(212) 555-1001');
      fireEvent.click(screen.getByRole('button', { name: /Check Eligibility/i }));

      await waitFor(() => {
        expect(document.body.textContent).toContain('network unreachable');
      });
    });

    it('does not carry the portable subset forward when some numbers are not portable', async () => {
      // The silent-short-order case: advancing here would create an order for
      // the one portable number and quietly drop the other.
      await renderNumbers({
        ...defaultPortOrdersNS({
          checkEligibility: jest.fn().mockResolvedValue({
            portable_numbers: [
              {
                phone_number: '+12125551001',
                losing_carrier_name: 'Old Telco',
                losing_carrier_spid: '1234',
                is_wireless: false,
                account_number_required: false,
              },
            ],
            non_portable_numbers: [{ phone_number: '+12125551002', city: 'New York', state: 'NY' }],
          }),
        }),
      });

      await navigateToPort();
      enterPortNumbers('(212) 555-1001\n(212) 555-1002');
      fireEvent.click(screen.getByRole('button', { name: /Check Eligibility/i }));

      await waitFor(() => {
        expect(document.body.textContent).toContain('Not Portable');
      });

      // Still on the numbers step — no eligibility screen, nothing to continue with.
      expect(screen.queryByRole('button', { name: /Continue with Portable/i })).toBeNull();
      expect(document.querySelectorAll('.num-port-row-error')).toHaveLength(1);
    });

    it('clears a server-reported issue once the row is edited', async () => {
      // Otherwise the issue outlives the text it describes and permanently
      // disables the only control that would clear it.
      await renderNumbers({
        ...defaultPortOrdersNS({
          checkEligibility: jest.fn().mockResolvedValue({
            portable_numbers: [],
            non_portable_numbers: [{ phone_number: '+12125551001', city: 'New York', state: 'NY' }],
          }),
        }),
      });

      await navigateToPort();
      enterPortNumbers('(212) 555-1001');
      fireEvent.click(screen.getByRole('button', { name: /Check Eligibility/i }));

      await waitFor(() => {
        expect(document.body.textContent).toContain('Not Portable');
      });
      expect(screen.getByRole('button', { name: /Check Eligibility/i })).toBeDisabled();

      const [first] = portRows();
      if (!first) throw new Error('port numbers rows not rendered');
      fireEvent.change(first, { target: { value: '(212) 555-1003' } });

      await waitFor(() => {
        expect(document.querySelectorAll('.num-port-row-error')).toHaveLength(0);
      });
      expect(screen.getByRole('button', { name: /Check Eligibility/i })).not.toBeDisabled();
    });

    it('never sends an unreadable number to the eligibility check', async () => {
      const result = await renderNumbers();
      await navigateToPort();

      enterPortNumbers('123');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Check Eligibility/i })).toBeDisabled();
      });

      // Not asserting on a click here: React suppresses events on a disabled
      // control, so "click then expect not-called" would pass even if the
      // handler had no guard at all.
      expect(
        (result.instance as unknown as Record<string, Record<string, jest.Mock>>).portOrders
          .checkEligibility
      ).not.toHaveBeenCalled();
    });

    it('cannot check eligibility with no numbers entered', async () => {
      const result = await renderNumbers();
      await navigateToPort();

      expect(screen.getByRole('button', { name: /Check Eligibility/i })).toBeDisabled();
      expect(
        (result.instance as unknown as Record<string, Record<string, jest.Mock>>).portOrders
          .checkEligibility
      ).not.toHaveBeenCalled();
    });

    it('validates bill copy required before moving to review', async () => {
      await renderNumbers();

      // Navigate to documents sub-step without uploading the bill
      await navigateToPort();
      enterPortNumbers('(212) 555-1001');
      fireEvent.click(screen.getByRole('button', { name: /Check Eligibility/i }));
      await waitFor(() => {
        expect(document.body.textContent).toContain('Portable');
      });

      fireEvent.click(screen.getByRole('button', { name: /Continue with Portable/i }));
      await waitFor(() => {
        expect(document.body.textContent).toContain('Subscriber Information');
      });

      // Fill subscriber
      fillByPlaceholder('(555) 123-4567', '(212) 555-1001');
      fillByPlaceholder('Acme Corp', 'Acme Corp');
      fillByPlaceholder('John Doe', 'John Doe');
      fillByPlaceholder('123', '123');
      fillByPlaceholder('Main St', 'Main St');
      const cityInputs = screen.getAllByPlaceholderText('New York');
      fireEvent.change(cityInputs[cityInputs.length - 1]!, { target: { value: 'New York' } });
      const zipInputs = screen.getAllByPlaceholderText('10001');
      fireEvent.change(zipInputs[zipInputs.length - 1]!, { target: { value: '10001' } });
      const stateSelects = document.querySelectorAll<HTMLSelectElement>('select');
      const stateSelect = Array.from(stateSelects).find((s) =>
        Array.from(s.options).some((o) => o.value === 'NY')
      );
      if (stateSelect) fireEvent.change(stateSelect, { target: { value: 'NY' } });

      // Advance to FOC date
      let nextBtns = screen.getAllByRole('button', { name: /Next/i });
      fireEvent.click(nextBtns[nextBtns.length - 1]!);
      await waitFor(() => {
        expect(document.body.textContent).toContain('Requested Port Date');
      });

      // Fill FOC
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const dateInput = document.querySelector<HTMLInputElement>('input[type="date"]')!;
      fireEvent.change(dateInput, { target: { value: futureDate.toISOString().split('T')[0] } });
      const timeSelect = document.querySelector<HTMLSelectElement>('select')!;
      fireEvent.change(timeSelect, { target: { value: '10:00' } });

      // Advance to documents
      nextBtns = screen.getAllByRole('button', { name: /Next/i });
      fireEvent.click(nextBtns[nextBtns.length - 1]!);
      await waitFor(() => {
        expect(document.body.textContent).toContain('Supporting Documents');
      });

      // Try to advance to review without bill copy
      nextBtns = screen.getAllByRole('button', { name: /Next/i });
      fireEvent.click(nextBtns[nextBtns.length - 1]!);

      await waitFor(() => {
        expect(document.body.textContent).toContain('A phone bill copy is required');
      });
    });

    it('completes full port flow end-to-end', async () => {
      const result = await renderNumbers();
      await navigatePortFlowTo(result.instance, 'submitted');

      // Verify API calls
      const portOrders = (result.instance as unknown as Record<string, Record<string, jest.Mock>>)
        .portOrders;
      expect(portOrders.checkEligibility).toHaveBeenCalled();
      expect(portOrders.create).toHaveBeenCalledWith(
        expect.objectContaining({
          phone_numbers: ['+12125551001'],
          subscriber: expect.objectContaining({
            business_name: 'Acme Corp',
            approver_name: 'John Doe',
          }),
        })
      );
      expect(portOrders.uploadBillCopy).toHaveBeenCalledWith('po_01abc', expect.any(File));
      expect(portOrders.approve).toHaveBeenCalledWith(
        'po_01abc',
        expect.objectContaining({ signature: 'John Doe' })
      );
      expect(portOrders.submit).toHaveBeenCalledWith('po_01abc');

      expect(document.body.textContent).toContain('Port Request Submitted');
    });

    it('shows review screen with summary', async () => {
      const result = await renderNumbers();
      await navigatePortFlowTo(result.instance, 'review');

      const content = document.body.textContent!;
      expect(content).toContain('(212) 555-1001');
      expect(content).toContain('Acme Corp');
      expect(content).toContain('John Doe');
      expect(content).toContain('bill.pdf');
    });

    it('validates signature required before port submission', async () => {
      const result = await renderNumbers();
      await navigatePortFlowTo(result.instance, 'review');

      // Try to submit without signature
      fireEvent.click(screen.getByRole('button', { name: /Approve & Submit/i }));

      await waitFor(() => {
        expect(document.body.textContent).toContain('Signature is required');
      });

      expect(
        (result.instance as unknown as Record<string, Record<string, jest.Mock>>).portOrders.create
      ).not.toHaveBeenCalled();
    });

    it('returns to overview after port submission', async () => {
      const result = await renderNumbers();
      await navigatePortFlowTo(result.instance, 'submitted');

      // Click "Back to Numbers"
      fireEvent.click(screen.getByRole('button', { name: /Back to Numbers/i }));

      await waitFor(() => {
        expect(document.querySelector('.num-action-card')).not.toBeNull();
      });
    });

    it('shows port submission error when API fails', async () => {
      const result = await renderNumbers({
        ...defaultPortOrdersNS({
          create: jest.fn().mockRejectedValue(new Error('Network failure')),
        }),
      });

      await navigatePortFlowTo(result.instance, 'review');

      fillByPlaceholder('Type your full legal name', 'John Doe');
      fireEvent.click(screen.getByRole('button', { name: /Approve & Submit/i }));

      await waitFor(() => {
        expect(document.body.textContent).toContain('Network failure');
      });
    });

    it('resets numbers sub-step to overview when navigating back', async () => {
      await renderNumbers();
      await navigateToOrder();

      // Navigate back
      fireEvent.click(screen.getByRole('button', { name: /Back$/i }));

      await waitFor(() => {
        expect(document.querySelector('.num-action-card')).not.toBeNull();
      });
    });
  });

  // ==========================================================================
  // E911 Provisioning
  // ==========================================================================

  describe('E911 Provisioning', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    /** Navigate from overview through caller-id to trigger E911. */
    async function completeToE911(instance: RenderOnboardingResult['instance']) {
      await advanceToPrimaryDID(instance);
      await advanceToCallerId();
      await advanceToDirectoryListing();
      // No DID is selected by default, so clicking Next skips directory listing
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    }

    it('shows loading spinner during E911 provisioning', async () => {
      let resolveValidation!: (value: { adjusted: boolean; address: object }) => void;
      const validationPromise = new Promise<{ adjusted: boolean; address: object }>((resolve) => {
        resolveValidation = resolve;
      });

      const result = await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(didPage([mockAccountDID])) }),
        ...defaultLocationsNS({ validateE911: jest.fn().mockReturnValue(validationPromise) }),
      });

      await completeToE911(result.instance);

      await waitFor(() => {
        expect(document.querySelector('.spinner')).not.toBeNull();
        expect(document.body.textContent).toContain('Configuring emergency services');
      });

      resolveValidation({ adjusted: false, address: {} });
    }, 15000);

    it('shows success panel when provisioning succeeds (status: provisioned)', async () => {
      const provisionedLocation = {
        ...mockLocation,
        primary_did_id: 'did_02acct',
        e911_status: 'provisioned' as const,
      };

      const validateE911Mock = jest.fn().mockResolvedValue({
        adjusted: false,
        address: { house_number: '123', street_name: 'Main', city: 'New York' },
      });
      const provisionE911Mock = jest.fn().mockResolvedValue(provisionedLocation);

      const result = await renderNumbers({
        ...phoneNumbersNS({
          list: jest.fn().mockResolvedValue(didPage([mockDID, mockAccountDID])),
        }),
        ...defaultLocationsNS({
          validateE911: validateE911Mock,
          provisionE911: provisionE911Mock,
        }),
      });

      await completeToE911(result.instance);

      await waitFor(() => {
        expect(document.body.textContent).toContain('E911 emergency address is verified');
      });

      expect(validateE911Mock).toHaveBeenCalledWith('loc_01abc');
      expect(provisionE911Mock).toHaveBeenCalledWith('loc_01abc');
    }, 15000);

    it('shows warning banner for complex case (multiple locations)', async () => {
      const secondLocation = {
        ...mockLocation,
        id: 'loc_02xyz',
        name: 'Branch Office',
      };

      const result = await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(didPage([mockDID])) }),
        ...defaultLocationsNS({
          list: jest
            .fn()
            .mockResolvedValueOnce([mockLocation, secondLocation])
            .mockResolvedValue([mockLocation, secondLocation]),
        }),
      });

      await completeToE911(result.instance);

      await waitFor(() => {
        expect(document.body.textContent).toContain(
          'E911 emergency services have not been fully configured'
        );
      });

      expect(
        (result.instance as unknown as Record<string, Record<string, jest.Mock>>).locations
          .validateE911
      ).not.toHaveBeenCalled();
      expect(
        (result.instance as unknown as Record<string, Record<string, jest.Mock>>).locations
          .provisionE911
      ).not.toHaveBeenCalled();
    }, 15000);

    it('shows error state with retry button on provisioning API error', async () => {
      const result = await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(didPage([mockAccountDID])) }),
        ...defaultLocationsNS({
          validateE911: jest.fn().mockRejectedValue(new Error('Validation failed')),
        }),
      });

      await completeToE911(result.instance);

      await waitFor(() => {
        expect(document.body.textContent).toContain('E911 configuration failed');
        expect(document.body.textContent).toContain('error configuring emergency services');
        expect(document.querySelector('.center-icon.error')).not.toBeNull();
      });

      // Retry button should be present
      const retryBtn = document.querySelector<HTMLButtonElement>('.center-btn-row button');
      expect(retryBtn).not.toBeNull();
      expect(retryBtn?.textContent).toContain('Retry');
    }, 15000);

    it('polls when provision returns pending status and resolves on provisioned', async () => {
      const pendingLocation = {
        ...mockLocation,
        primary_did_id: 'did_02acct',
        e911_status: 'pending' as const,
      };
      const provisionedLocation = {
        ...mockLocation,
        primary_did_id: 'did_02acct',
        e911_status: 'provisioned' as const,
      };

      const getLocationMock = jest.fn().mockResolvedValue(provisionedLocation);

      const result = await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(didPage([mockAccountDID])) }),
        ...defaultLocationsNS({
          update: jest.fn().mockResolvedValue(pendingLocation),
          validateE911: jest.fn().mockResolvedValue({ adjusted: false, address: {} }),
          provisionE911: jest.fn().mockResolvedValue(pendingLocation),
          retrieve: getLocationMock,
        }),
      });

      await completeToE911(result.instance);

      // Wait for poll to resolve (2s interval + async resolution)
      await waitFor(
        () => {
          expect(document.body.textContent).toContain('E911 emergency address is verified');
        },
        { timeout: 5000 }
      );

      expect(getLocationMock).toHaveBeenCalledWith('loc_01abc');
    }, 15000);

    it('stops polling after max attempts (5) and shows pending message', async () => {
      const pendingLocation = {
        ...mockLocation,
        primary_did_id: 'did_02acct',
        e911_status: 'pending' as const,
      };

      const getLocationMock = jest.fn().mockResolvedValue(pendingLocation);

      const result = await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(didPage([mockAccountDID])) }),
        ...defaultLocationsNS({
          update: jest.fn().mockResolvedValue(pendingLocation),
          validateE911: jest.fn().mockResolvedValue({ adjusted: false, address: {} }),
          provisionE911: jest.fn().mockResolvedValue(pendingLocation),
          retrieve: getLocationMock,
        }),
      });

      await completeToE911(result.instance);

      // Wait for all 5 polls to complete (5 * 2s = 10s + buffer)
      await waitFor(
        () => {
          expect(document.body.textContent).toContain(
            'emergency address verification will complete shortly'
          );
        },
        { timeout: 15000 }
      );

      expect(getLocationMock).toHaveBeenCalledTimes(5);
    }, 20000);

    it('retry button re-triggers provisioning after error', async () => {
      const provisionedLocation = {
        ...mockLocation,
        primary_did_id: 'did_02acct',
        e911_status: 'provisioned' as const,
      };

      const validateMock = jest
        .fn()
        .mockRejectedValueOnce(new Error('Validation failed'))
        .mockResolvedValueOnce({ adjusted: false, address: {} });

      const provisionE911Mock = jest.fn().mockResolvedValue(provisionedLocation);
      const result = await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(didPage([mockAccountDID])) }),
        ...defaultLocationsNS({
          update: jest.fn().mockResolvedValue(provisionedLocation),
          validateE911: validateMock,
          provisionE911: provisionE911Mock,
        }),
      });

      await completeToE911(result.instance);

      // Should show error with retry
      await waitFor(() => {
        expect(document.body.textContent).toContain('E911 configuration failed');
      });

      // Click retry
      const retryBtn = document.querySelector<HTMLButtonElement>('.center-btn-row button')!;
      fireEvent.click(retryBtn);

      // Should show success after retry
      await waitFor(() => {
        expect(document.body.textContent).toContain('E911 emergency address is verified');
      });

      expect(validateMock).toHaveBeenCalledTimes(2);
      expect(provisionE911Mock).toHaveBeenCalledWith('loc_01abc');
    }, 15000);

    it('shows polling status message during active polling', async () => {
      const pendingLocation = {
        ...mockLocation,
        primary_did_id: 'did_02acct',
        e911_status: 'pending' as const,
      };

      // First poll returns pending, second returns provisioned
      const getLocationMock = jest
        .fn()
        .mockResolvedValueOnce(pendingLocation)
        .mockResolvedValueOnce({
          ...pendingLocation,
          e911_status: 'provisioned' as const,
        });

      const result = await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(didPage([mockAccountDID])) }),
        ...defaultLocationsNS({
          update: jest.fn().mockResolvedValue(pendingLocation),
          validateE911: jest.fn().mockResolvedValue({ adjusted: false, address: {} }),
          provisionE911: jest.fn().mockResolvedValue(pendingLocation),
          retrieve: getLocationMock,
        }),
      });

      await completeToE911(result.instance);

      // After first poll returns pending, should show polling status message
      await waitFor(
        () => {
          expect(document.body.textContent).toContain('Verifying emergency services registration');
        },
        { timeout: 5000 }
      );
    }, 15000);

    it('shows error state when polling encounters network error', async () => {
      const pendingLocation = {
        ...mockLocation,
        primary_did_id: 'did_02acct',
        e911_status: 'pending' as const,
      };

      const getLocationMock = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(didPage([mockAccountDID])) }),
        ...defaultLocationsNS({
          update: jest.fn().mockResolvedValue(pendingLocation),
          validateE911: jest.fn().mockResolvedValue({ adjusted: false, address: {} }),
          provisionE911: jest.fn().mockResolvedValue(pendingLocation),
          retrieve: getLocationMock,
        }),
      });

      await completeToE911(result.instance);

      // Should show error with retry after poll failure
      await waitFor(
        () => {
          expect(document.body.textContent).toContain('E911 configuration failed');
        },
        { timeout: 5000 }
      );

      expect(getLocationMock).toHaveBeenCalledTimes(1);
    }, 15000);

    it('exposes a forward button (Next/Retry) when E911 fails — never blocks', async () => {
      const result = await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(didPage([mockAccountDID])) }),
        ...defaultLocationsNS({
          validateE911: jest.fn().mockRejectedValue(new Error('Validation failed')),
        }),
      });

      await completeToE911(result.instance);

      // Wait for error state
      await waitFor(() => {
        expect(document.body.textContent).toContain('E911 configuration failed');
      });

      // When E911 fails the step isn't actually data-complete — we don't
      // paint a "Numbers Complete" celebration. Instead we surface Retry
      // (re-attempt provisioning) so the user can recover. Assert Retry
      // specifically: the always-present footer Next would satisfy a
      // /retry|next/ regex even if Retry regressed away, defeating the point.
      // Retry is itself the forward affordance, so its presence also proves
      // the user is never blocked.
      expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
    }, 15000);

    it('aborts E911 when component unmounts (cleanup)', async () => {
      let resolveValidation!: (value: { adjusted: boolean; address: object }) => void;
      const validationPromise = new Promise<{ adjusted: boolean; address: object }>((resolve) => {
        resolveValidation = resolve;
      });
      const validateE911Mock = jest.fn().mockReturnValue(validationPromise);
      const provisionE911Mock = jest.fn().mockResolvedValue({
        ...mockLocation,
        e911_status: 'provisioned',
      });

      const result = await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(didPage([mockDID])) }),
        ...defaultLocationsNS({
          validateE911: validateE911Mock,
          provisionE911: provisionE911Mock,
        }),
      });

      await completeToE911(result.instance);

      await waitFor(() => {
        expect(validateE911Mock).toHaveBeenCalledWith('loc_01abc');
      });

      // E911 validation is in flight. Unmount before it completes.
      result.unmount();

      // Resolving validation after unmount must not start provisioning.
      resolveValidation({ adjusted: false, address: {} });
      await new Promise((r) => setTimeout(r, 50));

      expect(provisionE911Mock).not.toHaveBeenCalled();
    }, 15000);
  });

  // ==========================================================================
  // Temporary DID
  // ==========================================================================

  describe('Temporary DID', () => {
    const tempDID = {
      ...mockDID,
      id: 'did_temp01',
      phone_number: '+15559990001',
      number_class: 'temporary' as const,
    };

    it('shows temporary banner when temporary DID exists', async () => {
      await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(didPage([tempDID])) }),
      });

      await waitForOverview();

      await waitFor(() => {
        expect(document.body.textContent).toContain('A temporary number has been assigned');
      });
    });

    it('shows Temporary badge on card', async () => {
      await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(didPage([tempDID])) }),
      });

      await waitForOverview();

      await waitFor(() => {
        const meta = document.querySelector('.num-phone-card-meta');
        expect(meta).not.toBeNull();
        expect(meta?.textContent).toContain('Temporary');
      });
    });

    it('does not show a Primary DID step for temporary numbers', async () => {
      const result = await renderNumbers({
        ...phoneNumbersNS({ list: jest.fn().mockResolvedValue(didPage([tempDID])) }),
      });

      await advanceToPrimaryDID(result.instance);

      expect(document.querySelector('.primary-did-section')).toBeNull();
      expect(document.querySelector('.num-cid-section')).not.toBeNull();
    });

    it('does not show banner when no temporary DIDs', async () => {
      await renderNumbers({
        ...phoneNumbersNS({
          list: jest.fn().mockResolvedValue(
            didPage([
              {
                id: 'did_regular',
                phone_number: '+12125551001',
                status: 'active',
                outbound_enabled: true,
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
              },
            ])
          ),
        }),
      });

      await waitForOverview();

      // Banner should not be present
      expect(document.body.textContent).not.toContain('A temporary number has been assigned');
    });
  });

  // ==========================================================================
  // Multi-carrier Port Flow
  // ==========================================================================

  describe('Multi-carrier Port Flow', () => {
    const multiCarrierEligibility = {
      portable_numbers: [
        {
          phone_number: '+12125551001',
          losing_carrier_name: 'AT&T Mobility',
          is_wireless: false,
          account_number_required: false,
        },
        {
          phone_number: '+12125551002',
          losing_carrier_name: 'AT&T Mobility',
          is_wireless: false,
          account_number_required: false,
        },
        {
          phone_number: '+14155550101',
          losing_carrier_name: 'Verizon Business',
          is_wireless: false,
          account_number_required: false,
        },
      ],
      non_portable_numbers: [],
    };

    /** Enter phone numbers, check eligibility, and click Continue with Portable. */
    async function navigateToCarrierSelect(
      overrides: RenderOnboardingOptions['instanceOverrides'] = {}
    ) {
      // Merge portOrders overrides with the multiCarrier checkEligibility default
      const portOrdersOverride = (overrides as Record<string, unknown>)?.portOrders as
        Record<string, unknown> | undefined;
      const { portOrders: _discarded, ...restOverrides } = (overrides || {}) as Record<
        string,
        unknown
      >;
      const result = await renderNumbers({
        ...defaultPortOrdersNS({
          ...portOrdersOverride,
          checkEligibility: jest.fn().mockResolvedValue(multiCarrierEligibility),
        }),
        ...restOverrides,
      });
      await navigateToPort();

      // Enter 3 phone numbers spanning two carriers
      enterPortNumbers('(212) 555-1001\n(212) 555-1002\n(415) 555-0101');

      // Check eligibility
      fireEvent.click(screen.getByRole('button', { name: /Check Eligibility/i }));
      await waitFor(() => {
        expect(document.body.textContent).toContain('Portable');
      });

      // Continue to carrier select
      fireEvent.click(screen.getByRole('button', { name: /Continue with Portable/i }));
      await waitFor(() => {
        expect(document.body.textContent).toContain('AT&T Mobility');
        expect(document.body.textContent).toContain('Verizon Business');
      });

      return result;
    }

    /** Fill the subscriber form fields (same pattern as navigatePortFlowTo). */
    function fillSubscriberForm() {
      fillByPlaceholder('(555) 123-4567', '(212) 555-1001');
      fillByPlaceholder('Acme Corp', 'Acme Corp');
      fillByPlaceholder('John Doe', 'John Doe');
      fillByPlaceholder('123', '123');
      fillByPlaceholder('Main St', 'Main St');
      const cityInputs = screen.getAllByPlaceholderText('New York');
      fireEvent.change(cityInputs[cityInputs.length - 1]!, { target: { value: 'New York' } });
      const zipInputs = screen.getAllByPlaceholderText('10001');
      fireEvent.change(zipInputs[zipInputs.length - 1]!, { target: { value: '10001' } });
      const stateSelects = document.querySelectorAll<HTMLSelectElement>('select');
      const stateSelect = Array.from(stateSelects).find((s) =>
        Array.from(s.options).some((o) => o.value === 'NY')
      );
      if (stateSelect) fireEvent.change(stateSelect, { target: { value: 'NY' } });
    }

    /** Complete subscriber -> FOC -> docs -> review -> submit for one carrier. */
    async function completeCarrierPortFlow() {
      await waitFor(() => {
        expect(document.body.textContent).toContain('Subscriber Information');
      });

      fillSubscriberForm();

      // Advance to FOC date
      const nextBtns = screen.getAllByRole('button', { name: /Next/i });
      fireEvent.click(nextBtns[nextBtns.length - 1]!);
      await waitFor(() => {
        expect(document.body.textContent).toContain('Requested Port Date');
      });

      // Fill FOC date
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const dateInput = document.querySelector<HTMLInputElement>('input[type="date"]')!;
      fireEvent.change(dateInput, { target: { value: futureDate.toISOString().split('T')[0] } });
      const timeSelect = document.querySelector<HTMLSelectElement>('select')!;
      fireEvent.change(timeSelect, { target: { value: '10:00' } });

      // Advance to documents
      const nextBtns2 = screen.getAllByRole('button', { name: /Next/i });
      fireEvent.click(nextBtns2[nextBtns2.length - 1]!);
      await waitFor(() => {
        expect(document.body.textContent).toContain('Supporting Documents');
      });

      // Upload bill copy
      const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
      const billInput = fileInputs[0]!;
      const file = new File(['mock'], 'bill.pdf', { type: 'application/pdf' });
      Object.defineProperty(billInput, 'files', { value: [file], configurable: true });
      fireEvent.change(billInput);

      // Advance to review
      const nextBtns3 = screen.getAllByRole('button', { name: /Next/i });
      fireEvent.click(nextBtns3[nextBtns3.length - 1]!);
      await waitFor(() => {
        expect(document.body.textContent).toContain('Review');
      });

      // Fill signature and submit
      fillByPlaceholder('Type your full legal name', 'John Doe');
      fireEvent.click(screen.getByRole('button', { name: /Approve & Submit/i }));
    }

    it('groups numbers by carrier after eligibility', async () => {
      await navigateToCarrierSelect();

      // Verify carrier groups
      const groups = document.querySelectorAll('.num-carrier-group');
      expect(groups.length).toBe(2);

      // AT&T group with 2 numbers
      const attGroup = Array.from(groups).find((g) => g.textContent?.includes('AT&T Mobility'));
      expect(attGroup).not.toBeNull();
      expect(attGroup?.textContent).toContain('(2');

      // Verizon group with 1 number
      const vzGroup = Array.from(groups).find((g) => g.textContent?.includes('Verizon Business'));
      expect(vzGroup).not.toBeNull();
      expect(vzGroup?.textContent).toContain('(1');
    });

    it('single carrier skips carrier select', async () => {
      await renderNumbers({
        ...defaultPortOrdersNS({
          checkEligibility: jest.fn().mockResolvedValue({
            portable_numbers: [
              {
                phone_number: '+12125551001',
                losing_carrier_name: 'AT&T Mobility',
                is_wireless: false,
                account_number_required: false,
              },
              {
                phone_number: '+12125551002',
                losing_carrier_name: 'AT&T Mobility',
                is_wireless: false,
                account_number_required: false,
              },
            ],
            non_portable_numbers: [],
          }),
        }),
      });

      await navigateToPort();

      enterPortNumbers('(212) 555-1001\n(212) 555-1002');

      fireEvent.click(screen.getByRole('button', { name: /Check Eligibility/i }));
      await waitFor(() => {
        expect(document.body.textContent).toContain('Portable');
      });

      fireEvent.click(screen.getByRole('button', { name: /Continue with Portable/i }));

      // Should go directly to subscriber form, no carrier-select screen
      await waitFor(() => {
        expect(document.body.textContent).toContain('Subscriber Information');
      });
      expect(document.querySelector('.num-carrier-groups')).toBeNull();
    });

    it('shows carrier info banner in subscriber form', async () => {
      await navigateToCarrierSelect();

      // Click Start on AT&T carrier group
      const groups = document.querySelectorAll('.num-carrier-group');
      const attGroup = Array.from(groups).find((g) => g.textContent?.includes('AT&T Mobility'));
      const startBtn = attGroup!.querySelector('button');
      fireEvent.click(startBtn!);

      await waitFor(() => {
        expect(document.body.textContent).toContain('Subscriber Information');
      });

      // Carrier info banner should be visible
      const banner = document.querySelector('.inline-alert.info');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain('AT&T Mobility');
      expect(banner?.textContent).toContain('(212) 555-1001');
      expect(banner?.textContent).toContain('(212) 555-1002');
    });

    it('submits separate port orders per carrier', async () => {
      const createPortOrder = jest.fn().mockResolvedValue({
        id: 'po_01abc',
        status: 'draft',
        details: { phone_numbers: ['+12125551001', '+12125551002'], subscriber: null },
        submitted_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      });

      await navigateToCarrierSelect({ ...defaultPortOrdersNS({ create: createPortOrder }) });

      // Click Start on AT&T carrier group
      const groups = document.querySelectorAll('.num-carrier-group');
      const attGroup = Array.from(groups).find((g) => g.textContent?.includes('AT&T Mobility'));
      fireEvent.click(attGroup!.querySelector('button')!);

      // Complete the port flow for AT&T
      await completeCarrierPortFlow();

      // Should return to carrier select after AT&T submission
      await waitFor(() => {
        // Back on carrier select — AT&T should show as submitted
        const updatedGroups = document.querySelectorAll('.num-carrier-group');
        const attGroupAfter = Array.from(updatedGroups).find((g) =>
          g.textContent?.includes('AT&T Mobility')
        );
        expect(attGroupAfter?.classList.contains('num-carrier-group--completed')).toBe(true);
      });

      // createPortOrder should have been called with AT&T numbers only
      expect(createPortOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          phone_numbers: ['+12125551001', '+12125551002'],
        })
      );
    }, 15000);

    it('completes all carriers and shows combined confirmation', async () => {
      let orderIndex = 0;
      const createPortOrder = jest.fn().mockImplementation(() => {
        orderIndex++;
        return Promise.resolve({
          id: `po_0${orderIndex}`,
          status: 'draft',
          details: { phone_numbers: [], subscriber: null },
          submitted_at: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        });
      });

      await navigateToCarrierSelect({ ...defaultPortOrdersNS({ create: createPortOrder }) });

      // --- Complete AT&T carrier ---
      const groups1 = document.querySelectorAll('.num-carrier-group');
      const attGroup = Array.from(groups1).find((g) => g.textContent?.includes('AT&T Mobility'));
      fireEvent.click(attGroup!.querySelector('button')!);
      await completeCarrierPortFlow();

      // Should return to carrier select
      await waitFor(() => {
        const updatedGroups = document.querySelectorAll('.num-carrier-group');
        expect(updatedGroups.length).toBe(2);
        const att = Array.from(updatedGroups).find((g) => g.textContent?.includes('AT&T Mobility'));
        expect(att?.classList.contains('num-carrier-group--completed')).toBe(true);
      });

      // --- Complete Verizon carrier ---
      const groups2 = document.querySelectorAll('.num-carrier-group');
      const vzGroup = Array.from(groups2).find((g) => g.textContent?.includes('Verizon Business'));
      fireEvent.click(vzGroup!.querySelector('button')!);
      await completeCarrierPortFlow();

      // Should show combined confirmation with both carriers
      await waitFor(() => {
        expect(document.body.textContent).toContain('Port Request Submitted');
      });

      // Both carriers should appear in the results
      const completedGroups = document.querySelectorAll('.num-carrier-group--completed');
      expect(completedGroups.length).toBe(2);

      expect(createPortOrder).toHaveBeenCalledTimes(2);
    }, 15000);
  });
});
