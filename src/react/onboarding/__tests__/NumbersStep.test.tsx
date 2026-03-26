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

/** Render NumbersStep with given instance overrides. */
async function renderNumbers(
  overrides: RenderOnboardingOptions['instanceOverrides'] = {}
): Promise<RenderOnboardingResult> {
  return await renderWithOnboarding(<NumbersStep />, {
    instanceOverrides: {
      listLocations: jest.fn().mockResolvedValue([mockLocation]),
      // E911 methods required by navigateToNext
      validateLocationE911: jest.fn().mockResolvedValue({ adjusted: false, address: {} }),
      provisionLocationE911: jest.fn().mockResolvedValue({
        ...mockLocation,
        e911_status: 'pending',
        primary_did_id: 'did_01abc',
      }),
      // Number order methods
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
      // Port order methods
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

/** Click the overview Next button to advance to primary-did. */
async function advanceToPrimaryDID(_instance: RenderOnboardingResult['instance']) {
  await waitForOverview();
  fireEvent.click(screen.getByRole('button', { name: /Next/i }));
  // Wait for primary-did section to appear
  await waitFor(() => {
    expect(document.querySelector('.primary-did-section')).not.toBeNull();
  });
}

/** Advance from primary-did to caller-id. Selects first DID if needed. */
async function advanceToCallerId() {
  // Ensure a DID is selected (select first radio if none checked)
  const checked = document.querySelector<HTMLInputElement>('input[name="primary-did"]:checked');
  if (!checked) {
    const first = document.querySelector<HTMLInputElement>('input[name="primary-did"]');
    if (first) fireEvent.click(first);
  }
  // Click Next to go from primary-did to caller-id
  fireEvent.click(screen.getByRole('button', { name: /Next/i }));
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
    expect(document.querySelector('input[type="tel"]')).not.toBeNull();
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
  const phoneInput = document.querySelector<HTMLInputElement>('input[type="tel"]')!;
  fireEvent.change(phoneInput, { target: { value: '(212) 555-1001' } });

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
        listPhoneNumbers: jest.fn().mockResolvedValue(emptyPage),
      });
      await waitForOverview();
      expect(document.body.textContent).toContain('No telephone numbers yet');
      expect(document.querySelector('.num-action-card')).not.toBeNull();
    });

    it('renders existing phone numbers in the overview table', async () => {
      await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(
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

    it('advances past numbers step from overview via Next', async () => {
      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([mockDID])),
      });

      await advanceToPrimaryDID(result.instance);

      // primary-did sub-step should be visible
      expect(document.querySelector('.primary-did-section')).not.toBeNull();
    });

    it('shows error when numbers data fails to load', async () => {
      await renderNumbers({
        listPhoneNumbers: jest.fn().mockRejectedValue(new Error('Network error')),
      });

      await waitFor(() => {
        expect(document.body.textContent).toContain('Network error');
        expect(screen.getByRole('button', { name: /Retry/i })).toBeTruthy();
      });
    });
  });

  // ==========================================================================
  // Primary DID Selection
  // ==========================================================================

  describe('Primary DID Selection', () => {
    it('auto-selects primary DID when account phone matches (+12125550100)', async () => {
      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([mockDID, mockAccountDID])),
      });

      await advanceToPrimaryDID(result.instance);

      await waitFor(() => {
        const radios = document.querySelectorAll<HTMLInputElement>('input[name="primary-did"]');
        expect(radios.length).toBe(2);
        const checked = document.querySelector<HTMLInputElement>(
          'input[name="primary-did"]:checked'
        );
        expect(checked?.value).toBe('did_02acct');
      });

      // Auto-match badge should be visible
      const badge = document.querySelector('.primary-did-badge.auto-matched');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toContain('auto-selected');
    });

    it('shows radio buttons when no phone match but does not auto-select with multiple DIDs', async () => {
      const nonMatchingDID1 = { ...mockDID, id: 'did_other1', phone_number: '+13105550101' };
      const nonMatchingDID2 = { ...mockDID, id: 'did_other2', phone_number: '+13105550102' };

      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([nonMatchingDID1, nonMatchingDID2])),
      });

      await advanceToPrimaryDID(result.instance);

      await waitFor(() => {
        const radios = document.querySelectorAll<HTMLInputElement>('input[name="primary-did"]');
        expect(radios.length).toBe(2);
      });

      // No radio should be checked
      const checked = document.querySelector<HTMLInputElement>('input[name="primary-did"]:checked');
      expect(checked).toBeNull();

      // Auto-match badge should NOT appear
      expect(document.querySelector('.primary-did-badge.auto-matched')).toBeNull();
    });

    it('auto-selects the only DID when there is exactly one (convenience)', async () => {
      const singleDID = { ...mockDID, id: 'did_single', phone_number: '+13105550999' };

      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([singleDID])),
      });

      await advanceToPrimaryDID(result.instance);

      await waitFor(() => {
        const checked = document.querySelector<HTMLInputElement>(
          'input[name="primary-did"]:checked'
        );
        expect(checked?.value).toBe('did_single');
      });
    });

    it('user can manually select a different DID', async () => {
      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([mockDID, mockAccountDID])),
      });

      await advanceToPrimaryDID(result.instance);

      await waitFor(() => {
        const radios = document.querySelectorAll<HTMLInputElement>('input[name="primary-did"]');
        expect(radios.length).toBe(2);
      });

      // Initially the account DID is auto-matched
      expect(
        document.querySelector<HTMLInputElement>('input[name="primary-did"]:checked')?.value
      ).toBe('did_02acct');

      // Select the other DID
      const otherRadio = document.querySelector<HTMLInputElement>(
        'input[name="primary-did"][value="did_01abc"]'
      )!;
      fireEvent.click(otherRadio);

      await waitFor(() => {
        const checked = document.querySelector<HTMLInputElement>(
          'input[name="primary-did"]:checked'
        );
        expect(checked?.value).toBe('did_01abc');
      });
    });

    it('shows no DIDs message when none are available', async () => {
      await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(emptyPage),
      });

      await waitForOverview();

      // Click next — gate should block
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        expect(document.body.textContent).toContain('You need at least one phone number');
      });

      // Should still be on overview
      expect(document.querySelector('.primary-did-section')).toBeNull();
    });

    it('temporary DID shows badge', async () => {
      const tempDID = {
        ...mockDID,
        id: 'did_temp',
        phone_number: '+15551234567',
        number_class: 'temporary' as const,
      };

      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([tempDID])),
      });

      await advanceToPrimaryDID(result.instance);

      await waitFor(() => {
        const badge = document.querySelector('.primary-did-badge');
        expect(badge).not.toBeNull();
        expect(badge?.textContent).toContain('Temporary');
      });
    });

    it('does not refetch DIDs after rejection when clicking next again on overview', async () => {
      const listPhoneNumbers = jest
        .fn()
        .mockResolvedValueOnce(emptyPage) // consumed by overview loadNumbersData
        .mockRejectedValueOnce(new Error('Network error')); // consumed by loadActiveDIDs

      await renderNumbers({ listPhoneNumbers });

      await waitForOverview();

      // Click next — triggers loadActiveDIDs which rejects
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => {
        expect(document.body.textContent).toContain('You need at least one phone number');
      });

      // Click next again — should not refetch
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // listPhoneNumbers called: once by overview load (via fetchAllPages), once by loadActiveDIDs
      // fetchAllPages calls listPhoneNumbers, plus the direct loadActiveDIDs call
      // The key assertion: no additional calls after second click
      const totalCalls = listPhoneNumbers.mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      // Should not have increased
      expect(listPhoneNumbers.mock.calls.length).toBe(totalCalls);
    });

    it('does not refetch when empty result and next is clicked again on overview', async () => {
      const listPhoneNumbers = jest.fn().mockResolvedValue(emptyPage);

      await renderNumbers({ listPhoneNumbers });

      await waitForOverview();

      // Click next — triggers loadActiveDIDs, returns empty, gate blocks
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => {
        expect(document.body.textContent).toContain('You need at least one phone number');
      });

      const callsAfterFirstNext = listPhoneNumbers.mock.calls.length;

      // Click next again — should not refetch
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(listPhoneNumbers.mock.calls.length).toBe(callsAfterFirstNext);
      expect(document.body.textContent).toContain('You need at least one phone number');
    });

    it('auto-selects matching DID on page 2 of paginated response', async () => {
      const page1DID = {
        ...mockDID,
        id: 'did_page1',
        phone_number: '+13105550101',
        caller_id_name: 'ACME Corp',
      };

      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([page1DID])),
        // fetchAllPages simulates two-page fetch returning both DIDs
        fetchAllPages: jest.fn().mockResolvedValue([page1DID, mockAccountDID]),
      });

      await advanceToPrimaryDID(result.instance);

      await waitFor(() => {
        const radios = document.querySelectorAll('input[name="primary-did"]');
        expect(radios.length).toBe(2);
      });

      // Account DID from page 2 should be auto-selected
      const checked = document.querySelector<HTMLInputElement>('input[name="primary-did"]:checked');
      expect(checked?.value).toBe('did_02acct');
    });

    it('allows user to override auto-matched DID in primary-did sub-step', async () => {
      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([mockDID, mockAccountDID])),
      });

      await advanceToPrimaryDID(result.instance);

      await waitFor(() => {
        expect(document.querySelectorAll('input[name="primary-did"]').length).toBeGreaterThan(0);
      });

      // Override auto-match: select mockDID instead of mockAccountDID
      const otherRadio = document.querySelector<HTMLInputElement>(
        'input[name="primary-did"][value="did_01abc"]'
      )!;
      fireEvent.click(otherRadio);

      const checked = document.querySelector<HTMLInputElement>('input[name="primary-did"]:checked');
      expect(checked?.value).toBe('did_01abc');
    });
  });

  // ==========================================================================
  // Caller ID
  // ==========================================================================

  describe('Caller ID', () => {
    it('renders caller ID cards for each active DID', async () => {
      const didWithoutCnam = { ...mockDID, caller_id_name: null };
      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([didWithoutCnam, mockAccountDID])),
      });

      await advanceToPrimaryDID(result.instance);
      await advanceToCallerId();

      const cards = document.querySelectorAll('.num-phone-card--cid');
      expect(cards.length).toBe(2);
    });

    it('pre-fills and marks submitted for DIDs with existing caller_id_name', async () => {
      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([mockDID])), // has caller_id_name
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
        listPhoneNumbers: jest.fn().mockResolvedValue(emptyPage),
      });

      await waitForOverview();

      // Click next — gate blocks
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => {
        expect(document.body.textContent).toContain('You need at least one phone number');
      });

      // Should not have advanced to primary-did or caller-id
      expect(document.querySelector('.primary-did-section')).toBeNull();
      expect(document.querySelector('.num-cid-section')).toBeNull();
    });

    it('submits caller ID via Next button and calls updateCallerID', async () => {
      const didWithoutCnam = { ...mockDID, id: 'did_nocnam', caller_id_name: null };
      const updateCallerID = jest.fn().mockResolvedValue(undefined);
      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([didWithoutCnam])),
        updateCallerID,
      });

      await advanceToPrimaryDID(result.instance);
      await advanceToCallerId();

      // Type a caller ID name
      const input = document.querySelector<HTMLInputElement>('.num-cid-input')!;
      fireEvent.change(input, { target: { value: 'Test Corp' } });

      // Click Next to trigger bulk submission
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        expect(updateCallerID).toHaveBeenCalledWith('did_nocnam', 'Test Corp');
      });
    });

    it('shows validation error when Next is clicked with invalid caller ID', async () => {
      const didWithoutCnam = { ...mockDID, id: 'did_invalid', caller_id_name: null };
      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([didWithoutCnam])),
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
      const updateCallerID = jest.fn().mockResolvedValue(undefined);
      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([didWithoutCnam])),
        updateCallerID,
      });

      await advanceToPrimaryDID(result.instance);
      await advanceToCallerId();

      // Type a valid caller ID name
      const input = document.querySelector<HTMLInputElement>('.num-cid-input')!;
      fireEvent.change(input, { target: { value: 'My Corp' } });

      // Click Next triggers submission
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        expect(updateCallerID).toHaveBeenCalledWith('did_block', 'My Corp');
      });
    });

    it('advances immediately when all caller IDs are pre-submitted', async () => {
      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([mockDID])), // has caller_id_name
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
      const updateCallerID = jest.fn().mockImplementation((id: string) => {
        if (id === 'did_fail') return Promise.reject(new Error('API error'));
        return Promise.resolve(undefined);
      });
      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([did1, did2])),
        updateCallerID,
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
      const updateCallerID = jest.fn().mockRejectedValue(new Error('fail'));
      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([didWithoutCnam])),
        updateCallerID,
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
      const updateCallerID = jest.fn().mockImplementation((id: string) => {
        if (id === 'did_retry') {
          callCount++;
          if (callCount <= 1) return Promise.reject(new Error('fail'));
        }
        return Promise.resolve(undefined);
      });
      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([did1, did2])),
        updateCallerID,
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
      updateCallerID.mockClear();

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
        expect(updateCallerID).toHaveBeenCalledTimes(1);
        expect(updateCallerID).toHaveBeenCalledWith('did_retry', 'Retry Corp');
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
        searchAvailableNumbers: jest.fn().mockResolvedValue(mockAvailable),
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
        searchAvailableNumbers: jest.fn().mockResolvedValue(mockAvailable),
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
        const mock = result.instance as unknown as Record<string, jest.Mock>;
        expect(mock.createPhoneNumberOrder).toHaveBeenCalledWith(['+12125559001']);
      });

      // Should show order status
      await waitFor(() => {
        expect(document.body.textContent).toContain('Order Submitted');
      });
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

    it('adds and removes port phone number inputs', async () => {
      await renderNumbers();
      await navigateToPort();

      // Should have one input
      const inputs = document.querySelectorAll<HTMLInputElement>('input[type="tel"]');
      expect(inputs.length).toBe(1);

      // Should not have a remove button when only one input
      expect(screen.queryByRole('button', { name: /Remove/i })).toBeNull();

      // Add another
      fireEvent.click(screen.getByRole('button', { name: /Add another/i }));

      await waitFor(() => {
        const updatedInputs = document.querySelectorAll<HTMLInputElement>('input[type="tel"]');
        expect(updatedInputs.length).toBe(2);
        // Now remove buttons should appear
        expect(screen.getAllByRole('button', { name: /Remove/i }).length).toBeGreaterThan(0);
      });
    });

    it('checks port eligibility and shows results', async () => {
      const result = await renderNumbers();
      await navigateToPort();

      // Enter phone
      const phoneInput = document.querySelector<HTMLInputElement>('input[type="tel"]')!;
      fireEvent.change(phoneInput, { target: { value: '(212) 555-1001' } });

      // Check eligibility
      fireEvent.click(screen.getByRole('button', { name: /Check Eligibility/i }));

      await waitFor(() => {
        const mock = result.instance as unknown as Record<string, jest.Mock>;
        expect(mock.checkPortEligibility).toHaveBeenCalled();
        expect(document.body.textContent).toContain('Portable');
        expect(document.body.textContent).toContain('OldCo');
      });
    });

    it('shows subscriber form after eligibility and validates required fields', async () => {
      await renderNumbers();
      await navigateToPort();

      const phoneInput = document.querySelector<HTMLInputElement>('input[type="tel"]')!;
      fireEvent.change(phoneInput, { target: { value: '(212) 555-1001' } });

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

    it('shows non-portable numbers in eligibility results', async () => {
      await renderNumbers({
        checkPortEligibility: jest.fn().mockResolvedValue({
          portable_numbers: [],
          non_portable_numbers: [{ phone_number: '+12125551001', city: 'New York', state: 'NY' }],
        }),
      });

      await navigateToPort();

      const phoneInput = document.querySelector<HTMLInputElement>('input[type="tel"]')!;
      fireEvent.change(phoneInput, { target: { value: '(212) 555-1001' } });

      fireEvent.click(screen.getByRole('button', { name: /Check Eligibility/i }));

      await waitFor(() => {
        expect(document.body.textContent).toContain('Not Portable');
        expect(document.body.textContent).toContain('None of the entered numbers are eligible');
      });
    });

    it('validates phone number format before checking eligibility', async () => {
      const result = await renderNumbers();
      await navigateToPort();

      const phoneInput = document.querySelector<HTMLInputElement>('input[type="tel"]')!;
      fireEvent.change(phoneInput, { target: { value: '123' } });

      fireEvent.click(screen.getByRole('button', { name: /Check Eligibility/i }));

      await waitFor(() => {
        expect(document.body.textContent).toContain('Enter a valid US phone number');
        const mock = result.instance as unknown as Record<string, jest.Mock>;
        expect(mock.checkPortEligibility).not.toHaveBeenCalled();
      });
    });

    it('validates empty phone inputs before checking eligibility', async () => {
      await renderNumbers();
      await navigateToPort();

      // Click check without entering any number
      fireEvent.click(screen.getByRole('button', { name: /Check Eligibility/i }));

      await waitFor(() => {
        expect(document.body.textContent).toContain('At least one phone number is required');
      });
    });

    it('validates bill copy required before moving to review', async () => {
      await renderNumbers();

      // Navigate to documents sub-step without uploading the bill
      await navigateToPort();
      const phoneInput = document.querySelector<HTMLInputElement>('input[type="tel"]')!;
      fireEvent.change(phoneInput, { target: { value: '(212) 555-1001' } });
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
      const mock = result.instance as unknown as Record<string, jest.Mock>;
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
        expect.objectContaining({ signature: 'John Doe' })
      );
      expect(mock.submitPortOrder).toHaveBeenCalledWith('po_01abc');

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

      const mock = result.instance as unknown as Record<string, jest.Mock>;
      expect(mock.createPortOrder).not.toHaveBeenCalled();
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
        createPortOrder: jest.fn().mockRejectedValue(new Error('Network failure')),
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

    /** Navigate from overview through primary-did + caller-id to trigger E911. */
    async function completeToE911(instance: RenderOnboardingResult['instance']) {
      await advanceToPrimaryDID(instance);
      await advanceToCallerId();
      await advanceToDirectoryListing();
      // Uncheck all directory listing toggles so no DLDA submission is needed
      const dlToggles = document.querySelectorAll<HTMLInputElement>(
        '.num-dl-toggle input[type="checkbox"]'
      );
      dlToggles.forEach((toggle) => {
        if (toggle.checked) fireEvent.click(toggle);
      });
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    }

    /**
     * listLocations is called twice:
     * 1. In loadActiveDIDs (overview -> primary-did transition)
     * 2. In navigateToNext (E911 flow after completion)
     * This helper returns a mock that resolves normally on the first call
     * and returns a controllable promise on the second call.
     */
    function listLocationsBlockingOnSecondCall(firstResult: unknown[]) {
      let resolveSecond!: (v: unknown[]) => void;
      const secondPromise = new Promise<unknown[]>((r) => {
        resolveSecond = r;
      });
      const mock = jest.fn().mockResolvedValueOnce(firstResult).mockReturnValue(secondPromise);
      return { mock, resolveSecond };
    }

    it('shows loading spinner during E911 provisioning', async () => {
      const { mock: listLocationsMock, resolveSecond } = listLocationsBlockingOnSecondCall([
        mockLocation,
      ]);

      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([mockAccountDID])),
        listLocations: listLocationsMock,
      });

      await completeToE911(result.instance);

      await waitFor(() => {
        expect(document.querySelector('.spinner')).not.toBeNull();
        expect(document.body.textContent).toContain('Configuring emergency services');
      });

      // Cleanup
      resolveSecond([mockLocation]);
    }, 15000);

    it('shows success panel when provisioning succeeds (status: provisioned)', async () => {
      const provisionedLocation = {
        ...mockLocation,
        primary_did_id: 'did_02acct',
        e911_status: 'provisioned' as const,
      };

      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([mockDID, mockAccountDID])),
        updateLocation: jest.fn().mockResolvedValue(provisionedLocation),
        validateLocationE911: jest.fn().mockResolvedValue({
          adjusted: false,
          address: { house_number: '123', street_name: 'Main', city: 'New York' },
        }),
        provisionLocationE911: jest.fn().mockResolvedValue(provisionedLocation),
      });

      await completeToE911(result.instance);

      await waitFor(() => {
        expect(document.body.textContent).toContain('E911 emergency address is verified');
      });

      const mock = result.instance as unknown as Record<string, jest.Mock>;
      expect(mock.updateLocation).toHaveBeenCalledWith('loc_01abc', {
        primary_did_id: 'did_02acct',
      });
      expect(mock.validateLocationE911).toHaveBeenCalledWith('loc_01abc');
      expect(mock.provisionLocationE911).toHaveBeenCalledWith('loc_01abc');
    }, 15000);

    it('shows warning banner for complex case (multiple locations)', async () => {
      const secondLocation = {
        ...mockLocation,
        id: 'loc_02xyz',
        name: 'Branch Office',
      };

      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([mockDID])),
        listLocations: jest
          .fn()
          .mockResolvedValueOnce([mockLocation, secondLocation])
          .mockResolvedValue([mockLocation, secondLocation]),
      });

      await completeToE911(result.instance);

      await waitFor(() => {
        expect(document.body.textContent).toContain(
          'E911 emergency services have not been fully configured'
        );
      });

      const mock = result.instance as unknown as Record<string, jest.Mock>;
      expect(mock.validateLocationE911).not.toHaveBeenCalled();
      expect(mock.provisionLocationE911).not.toHaveBeenCalled();
    }, 15000);

    it('shows error state with retry button on provisioning API error', async () => {
      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([mockAccountDID])),
        validateLocationE911: jest.fn().mockRejectedValue(new Error('Validation failed')),
      });

      await completeToE911(result.instance);

      await waitFor(() => {
        expect(document.body.textContent).toContain('E911 configuration failed');
        expect(document.body.textContent).toContain('error configuring emergency services');
        expect(document.querySelector('.center-icon.error')).not.toBeNull();
      });

      // Retry button should be present
      const retryBtn = document.querySelector<HTMLButtonElement>('.center-btn button');
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
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([mockAccountDID])),
        updateLocation: jest.fn().mockResolvedValue(pendingLocation),
        validateLocationE911: jest.fn().mockResolvedValue({ adjusted: false, address: {} }),
        provisionLocationE911: jest.fn().mockResolvedValue(pendingLocation),
        getLocation: getLocationMock,
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
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([mockAccountDID])),
        updateLocation: jest.fn().mockResolvedValue(pendingLocation),
        validateLocationE911: jest.fn().mockResolvedValue({ adjusted: false, address: {} }),
        provisionLocationE911: jest.fn().mockResolvedValue(pendingLocation),
        getLocation: getLocationMock,
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

      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([mockAccountDID])),
        updateLocation: jest.fn().mockResolvedValue(provisionedLocation),
        validateLocationE911: validateMock,
        provisionLocationE911: jest.fn().mockResolvedValue(provisionedLocation),
      });

      await completeToE911(result.instance);

      // Should show error with retry
      await waitFor(() => {
        expect(document.body.textContent).toContain('E911 configuration failed');
      });

      // Click retry
      const retryBtn = document.querySelector<HTMLButtonElement>('.center-btn button')!;
      fireEvent.click(retryBtn);

      // Should show success after retry
      await waitFor(() => {
        expect(document.body.textContent).toContain('E911 emergency address is verified');
      });

      expect(validateMock).toHaveBeenCalledTimes(2);
      const mock = result.instance as unknown as Record<string, jest.Mock>;
      expect(mock.provisionLocationE911).toHaveBeenCalledWith('loc_01abc');
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
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([mockAccountDID])),
        updateLocation: jest.fn().mockResolvedValue(pendingLocation),
        validateLocationE911: jest.fn().mockResolvedValue({ adjusted: false, address: {} }),
        provisionLocationE911: jest.fn().mockResolvedValue(pendingLocation),
        getLocation: getLocationMock,
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
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([mockAccountDID])),
        updateLocation: jest.fn().mockResolvedValue(pendingLocation),
        validateLocationE911: jest.fn().mockResolvedValue({ adjusted: false, address: {} }),
        provisionLocationE911: jest.fn().mockResolvedValue(pendingLocation),
        getLocation: getLocationMock,
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

    it('Done button always present regardless of E911 state', async () => {
      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([mockAccountDID])),
        validateLocationE911: jest.fn().mockRejectedValue(new Error('Validation failed')),
      });

      await completeToE911(result.instance);

      // Wait for error state
      await waitFor(() => {
        expect(document.body.textContent).toContain('E911 configuration failed');
      });

      // Done button should be present even during error
      expect(screen.getByRole('button', { name: /Done/i })).toBeTruthy();
    }, 15000);

    it('aborts E911 when component unmounts (cleanup)', async () => {
      const { mock: listLocationsMock, resolveSecond } = listLocationsBlockingOnSecondCall([
        mockLocation,
      ]);

      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([mockDID])),
        listLocations: listLocationsMock,
      });

      await completeToE911(result.instance);

      // E911 is in-flight (second listLocations pending). Unmount the component.
      result.unmount();

      // Resolve the pending promise — should not trigger write APIs
      resolveSecond([mockLocation]);
      await new Promise((r) => setTimeout(r, 50));

      const mock = result.instance as unknown as Record<string, jest.Mock>;
      expect(mock.updateLocation).not.toHaveBeenCalled();
      expect(mock.validateLocationE911).not.toHaveBeenCalled();
      expect(mock.provisionLocationE911).not.toHaveBeenCalled();
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
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([tempDID])),
      });

      await waitForOverview();

      await waitFor(() => {
        expect(document.body.textContent).toContain('A temporary number has been assigned');
      });
    });

    it('shows Temporary badge on card', async () => {
      await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([tempDID])),
      });

      await waitForOverview();

      await waitFor(() => {
        const meta = document.querySelector('.num-phone-card-meta');
        expect(meta).not.toBeNull();
        expect(meta?.textContent).toContain('Temporary');
      });
    });

    it('shows temporary note in Primary DID step', async () => {
      const result = await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(didPage([tempDID])),
      });

      await advanceToPrimaryDID(result.instance);

      await waitFor(() => {
        expect(document.body.textContent).toContain(
          'This is a temporary number assigned to get you started'
        );
      });
    });

    it('does not show banner when no temporary DIDs', async () => {
      await renderNumbers({
        listPhoneNumbers: jest.fn().mockResolvedValue(
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
      const result = await renderNumbers({
        checkPortEligibility: jest.fn().mockResolvedValue(multiCarrierEligibility),
        ...overrides,
      });
      await navigateToPort();

      // Enter 3 phone numbers
      const phoneInput = document.querySelector<HTMLInputElement>('input[type="tel"]')!;
      fireEvent.change(phoneInput, { target: { value: '(212) 555-1001' } });

      fireEvent.click(screen.getByRole('button', { name: /Add another/i }));
      await waitFor(() => {
        expect(document.querySelectorAll('input[type="tel"]').length).toBe(2);
      });
      const inputs2 = document.querySelectorAll<HTMLInputElement>('input[type="tel"]');
      fireEvent.change(inputs2[1]!, { target: { value: '(212) 555-1002' } });

      fireEvent.click(screen.getByRole('button', { name: /Add another/i }));
      await waitFor(() => {
        expect(document.querySelectorAll('input[type="tel"]').length).toBe(3);
      });
      const inputs3 = document.querySelectorAll<HTMLInputElement>('input[type="tel"]');
      fireEvent.change(inputs3[2]!, { target: { value: '(415) 555-0101' } });

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
        checkPortEligibility: jest.fn().mockResolvedValue({
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
      });

      await navigateToPort();

      const phoneInput = document.querySelector<HTMLInputElement>('input[type="tel"]')!;
      fireEvent.change(phoneInput, { target: { value: '(212) 555-1001' } });

      fireEvent.click(screen.getByRole('button', { name: /Add another/i }));
      await waitFor(() => {
        expect(document.querySelectorAll('input[type="tel"]').length).toBe(2);
      });
      const inputs2 = document.querySelectorAll<HTMLInputElement>('input[type="tel"]');
      fireEvent.change(inputs2[1]!, { target: { value: '(212) 555-1002' } });

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

      await navigateToCarrierSelect({ createPortOrder });

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

      await navigateToCarrierSelect({ createPortOrder });

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
