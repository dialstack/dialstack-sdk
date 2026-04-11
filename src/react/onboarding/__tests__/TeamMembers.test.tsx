/**
 * Tests for the TeamMembers React onboarding sub-step.
 *
 * Ported from WC reference tests in account-onboarding.test.ts (team members section).
 */

import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { TeamMembers } from '../steps/account/TeamMembers';
import {
  renderWithOnboarding,
  createStatefulUserMocks,
  createStatefulExtensionMocks,
} from '../__test-helpers__/onboarding';

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

  /** Build a users namespace override with sensible defaults. */
  function usersNS(overrides: Record<string, unknown> = {}) {
    return {
      users: {
        create: jest.fn().mockImplementation(async (data: { name: string; email: string }) => ({
          id: 'user_new',
          name: data.name,
          email: data.email,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })),
        list: jest.fn().mockResolvedValue([]),
        del: jest.fn().mockResolvedValue(undefined),
        endpoints: {
          create: jest.fn().mockResolvedValue({
            id: 'ep_new',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
          list: jest.fn().mockResolvedValue([]),
        },
        ...overrides,
      },
    };
  }

  /** Build an extensions namespace override with sensible defaults. */
  function extensionsNS(overrides: Record<string, unknown> = {}) {
    return {
      extensions: {
        list: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          number: '1002',
          target: 'user_new',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        ...overrides,
      },
    };
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
      expect(instance.users.create).toHaveBeenCalledWith({
        name: 'Bob',
        email: 'bob@example.com',
      });
    });

    await waitFor(() => {
      expect(instance.extensions.create).toHaveBeenCalled();
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
      expect(instance.extensions.create).toHaveBeenCalledWith({
        number: '2000',
        target: 'user_new',
      });
    });
  });

  // ==========================================================================
  // User list persistence (DIA-557)
  // ==========================================================================

  it('shows newly added user in the table after creation', async () => {
    const statefulUsers = createStatefulUserMocks([]);
    const statefulExts = createStatefulExtensionMocks([]);

    const { container } = await renderTM({
      ...statefulUsers,
      ...statefulExts,
    });

    fireEvent.change(getFieldByLabel(container, 'Full name'), { target: { value: 'Bob' } });
    fireEvent.change(getFieldByLabel(container, 'Email'), { target: { value: 'bob@example.com' } });

    clickAddUser();

    await waitFor(() => {
      expect(screen.getByText('Bob')).toBeTruthy();
    });
  });

  it('shows all added users after adding multiple', async () => {
    const statefulUsers = createStatefulUserMocks([]);
    const statefulExts = createStatefulExtensionMocks([]);

    const { container } = await renderTM({
      ...statefulUsers,
      ...statefulExts,
    });

    fireEvent.change(getFieldByLabel(container, 'Full name'), { target: { value: 'Bob' } });
    fireEvent.change(getFieldByLabel(container, 'Email'), { target: { value: 'bob@example.com' } });
    clickAddUser();

    await waitFor(() => {
      expect(screen.getByText('Bob')).toBeTruthy();
    });

    fireEvent.change(getFieldByLabel(container, 'Full name'), { target: { value: 'Charlie' } });
    fireEvent.change(getFieldByLabel(container, 'Email'), {
      target: { value: 'charlie@example.com' },
    });
    clickAddUser();

    await waitFor(() => {
      expect(screen.getByText('Charlie')).toBeTruthy();
    });

    expect(screen.getByText('Bob')).toBeTruthy();
  });

  // ==========================================================================
  // Removing users
  // ==========================================================================

  it('calls deleteUser when removing a user', async () => {
    const { instance } = await renderTM();

    const removeBtn = screen.getByTitle('Remove');
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(instance.users.del).toHaveBeenCalledWith('user_01abc');
    });
  });

  it('removes user from the table after deletion', async () => {
    const statefulUsers = createStatefulUserMocks();
    const statefulExts = createStatefulExtensionMocks();

    await renderTM({
      ...statefulUsers,
      ...statefulExts,
    });

    expect(screen.getByText('Alice')).toBeTruthy();

    const removeBtn = screen.getByTitle('Remove');
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.queryByText('Alice')).toBeNull();
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
      ...usersNS({
        create: jest.fn().mockRejectedValue(new Error('A user with this email already exists')),
      }),
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
      ...usersNS({ list: jest.fn().mockResolvedValue([]) }),
      ...extensionsNS({ list: jest.fn().mockResolvedValue([]) }),
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
      ...extensionsNS({ create: jest.fn().mockRejectedValue(new Error('Extension conflict')) }),
      ...usersNS({ del: deleteUserMock }),
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
