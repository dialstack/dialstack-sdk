/**
 * Tests for the TeamMembers React onboarding sub-step.
 *
 * Ported from WC reference tests in account-onboarding.test.ts (team members section).
 */

import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { TeamMembers } from '../steps/account/TeamMembers';
import { renderWithOnboarding } from '../__test-helpers__/onboarding';

/**
 * Query helper: labels lack htmlFor so getByLabelText won't work.
 * Finds the input/select sibling of a label matching the given text.
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

describe('TeamMembers', () => {
  const defaultProps = {
    accountEmail: 'owner@example.com',
    onBack: jest.fn(),
    onDone: jest.fn(),
  };

  beforeEach(() => {
    defaultProps.onBack.mockReset();
    defaultProps.onDone.mockReset();
  });

  // Helper: render and wait for loading to finish
  async function renderTM(instanceOverrides = {}) {
    const result = await renderWithOnboarding(<TeamMembers {...defaultProps} />, {
      instanceOverrides,
    });
    await waitFor(() => {
      expect(screen.getByText('Team Members')).toBeTruthy();
    });
    return result;
  }

  function clickNext() {
    const nextBtn = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextBtn);
  }

  function clickAddUser() {
    const addBtn = screen.getByRole('button', { name: /add user/i });
    fireEvent.click(addBtn);
  }

  // ==========================================================================
  // Rendering existing users
  // ==========================================================================

  it('renders existing users in the table', async () => {
    await renderTM();

    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('shows extension number for users with extensions', async () => {
    await renderTM();

    expect(screen.getByText('1001')).toBeTruthy();
  });

  // ==========================================================================
  // Adding users
  // ==========================================================================

  it('calls createUser and createExtension when adding a user', async () => {
    const { container, instance } = await renderTM();

    fireEvent.change(getFieldByLabel(container, 'Full name'), { target: { value: 'Bob' } });
    fireEvent.change(getFieldByLabel(container, 'Email'), { target: { value: 'bob@example.com' } });

    clickAddUser();

    await waitFor(() => {
      expect(instance.createUser).toHaveBeenCalledWith({
        name: 'Bob',
        email: 'bob@example.com',
      });
    });

    await waitFor(() => {
      expect(instance.createExtension).toHaveBeenCalled();
    });
  });

  it('pre-populates the extension input with next extension number', async () => {
    const { container } = await renderTM();

    const extInput = getFieldByLabel(container, 'Extension') as HTMLInputElement;
    // mockExtensions has '1001', so next should be '1002'
    expect(extInput.value).toBe('1002');
  });

  it('uses custom extension number when adding a user', async () => {
    const { container, instance } = await renderTM();

    fireEvent.change(getFieldByLabel(container, 'Extension'), { target: { value: '2000' } });
    fireEvent.change(getFieldByLabel(container, 'Full name'), { target: { value: 'Bob' } });
    fireEvent.change(getFieldByLabel(container, 'Email'), { target: { value: 'bob@example.com' } });

    clickAddUser();

    await waitFor(() => {
      expect(instance.createExtension).toHaveBeenCalledWith({
        number: '2000',
        target: 'user_new',
      });
    });
  });

  // ==========================================================================
  // Removing users
  // ==========================================================================

  it('calls deleteUser when removing a user', async () => {
    const { instance } = await renderTM();

    const removeBtn = screen.getByTitle('Remove');
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(instance.deleteUser).toHaveBeenCalledWith('user_01abc');
    });
  });

  // ==========================================================================
  // Validation
  // ==========================================================================

  it('shows validation error when name is empty on add', async () => {
    await renderTM();

    clickAddUser();

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeTruthy();
    });
  });

  it('shows duplicate email error', async () => {
    const { container } = await renderTM({
      createUser: jest.fn().mockRejectedValue(new Error('A user with this email already exists')),
    });

    fireEvent.change(getFieldByLabel(container, 'Full name'), { target: { value: 'Duplicate' } });
    fireEvent.change(getFieldByLabel(container, 'Email'), {
      target: { value: 'alice@example.com' },
    });

    clickAddUser();

    await waitFor(() => {
      expect(screen.getByText(/already exists/)).toBeTruthy();
    });
  });

  it('requires at least one team member before advancing', async () => {
    await renderTM({
      listUsers: jest.fn().mockResolvedValue([]),
      listExtensions: jest.fn().mockResolvedValue([]),
    });

    clickNext();

    await waitFor(() => {
      expect(screen.getByText('Add at least one team member to continue.')).toBeTruthy();
    });
  });

  // ==========================================================================
  // Rollback on extension failure
  // ==========================================================================

  it('rolls back user creation when extension creation fails', async () => {
    const deleteUserMock = jest.fn().mockResolvedValue(undefined);
    const { container } = await renderTM({
      createExtension: jest.fn().mockRejectedValue(new Error('Extension conflict')),
      deleteUser: deleteUserMock,
    });

    fireEvent.change(getFieldByLabel(container, 'Full name'), { target: { value: 'Bob' } });
    fireEvent.change(getFieldByLabel(container, 'Email'), { target: { value: 'bob@example.com' } });

    clickAddUser();

    await waitFor(() => {
      expect(deleteUserMock).toHaveBeenCalledWith('user_new');
    });

    // Should show the extension error
    await waitFor(() => {
      expect(screen.getByText('Extension conflict')).toBeTruthy();
    });
  });

  // ==========================================================================
  // Navigation
  // ==========================================================================

  it('calls onDone and completes sub-step when advancing with users', async () => {
    const { progressStore } = await renderTM();

    clickNext();

    await waitFor(() => {
      expect(defaultProps.onDone).toHaveBeenCalled();
    });

    expect(progressStore.getCompletedSubSteps('account').has('team-members')).toBe(true);
  });
});
