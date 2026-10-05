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
  mockAccount,
  mockUsers,
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
  // User list persistence
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

  it('disables Next until at least one team member exists', async () => {
    await renderTM({
      ...usersNS({ list: jest.fn().mockResolvedValue([]) }),
      ...extensionsNS({ list: jest.fn().mockResolvedValue([]) }),
    });

    // No team members → wizard must not let the user advance past a state the
    // data doesn't satisfy. Next stays disabled until ≥1 user is added; the
    // account owner is admin-side and never appears here, so there is nobody to
    // discount from the count.
    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(nextButton).toBeDisabled();
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
  // Delete affordance
  // ==========================================================================

  it('shows a delete affordance for every listed team member', async () => {
    const memberA = {
      id: 'user_a',
      name: 'Member A',
      email: 'a@example.com',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const memberB = {
      id: 'user_b',
      name: 'Member B',
      email: 'b@example.com',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    await renderTM({ users: { list: jest.fn().mockResolvedValue([memberA, memberB]) } });

    expect(screen.getAllByTitle('Remove')).toHaveLength(2);
  });

  // ==========================================================================
  // Navigation
  // ==========================================================================

  it('calls onDone and completes sub-step with a single team member', async () => {
    // One user is enough: the threshold is ≥1 user, not ≥2. mockUsers has a
    // single entry.
    const { progressStore } = await renderTM({
      users: { list: jest.fn().mockResolvedValue(mockUsers) },
    });

    clickNext();

    await waitFor(() => {
      expect(defaultProps.onDone).toHaveBeenCalled();
    });

    expect(progressStore.getCompletedSubSteps('account').has('team-members')).toBe(true);
  });

  it('advances with a single member whose email matches the account contact address', async () => {
    // The overlap case: this person owns the account and also holds a seat, so
    // their user email equals the account's contact address. They are a real team
    // member — the old email comparison discounted them and left the substep
    // permanently incomplete.
    const overlapUser = { ...mockUsers[0]!, email: mockAccount.email };
    const { progressStore } = await renderTM({
      users: { list: jest.fn().mockResolvedValue([overlapUser]) },
    });

    clickNext();

    await waitFor(() => {
      expect(defaultProps.onDone).toHaveBeenCalled();
    });

    expect(progressStore.getCompletedSubSteps('account').has('team-members')).toBe(true);
  });

  // ==========================================================================
  // Administrators without phone service
  // ==========================================================================

  describe('administrators without phone service', () => {
    const owner = {
      id: 'admin_user_owner',
      name: 'Jane Doe',
      email: 'jane@example.com',
      role: 'owner' as const,
      user: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    function adminNS(list: jest.Mock) {
      return { admin: { users: { list } } };
    }

    it('lists an owner with no seat, offering phone access', async () => {
      await renderTM(adminNS(jest.fn().mockResolvedValue([owner])));

      expect(screen.getByText('Jane Doe')).toBeTruthy();
      expect(screen.getByText('No phone service')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Give phone access' })).toBeTruthy();
    });

    it('does not list an administrator who already has a seat', async () => {
      // Alice is a user (mockUsers) and also an administrator; the API links
      // the two through `user`, so she must appear once, as a user.
      const alice = { ...owner, id: 'admin_user_alice', name: 'Alice', user: 'user_01abc' };
      await renderTM(adminNS(jest.fn().mockResolvedValue([alice])));

      expect(screen.getAllByText('Alice')).toHaveLength(1);
      expect(screen.queryByRole('button', { name: 'Give phone access' })).toBeNull();
    });

    it("labels a seated administrator's delete as removing phone access", async () => {
      // Deleting the user only drops the seat; the administrator stays.
      const alice = { ...owner, id: 'admin_user_alice', name: 'Alice', user: 'user_01abc' };
      const { instance } = await renderTM(adminNS(jest.fn().mockResolvedValue([alice])));

      expect(screen.getByText('Admin')).toBeTruthy();
      expect(screen.queryByTitle('Remove')).toBeNull();
      fireEvent.click(screen.getByTitle('Remove phone access'));

      await waitFor(() => {
        expect(instance.users.del).toHaveBeenCalledWith('user_01abc');
      });
    });

    it('gives the owner a user and the next extension in one click', async () => {
      // The owner flips to having a seat once the user exists, as the API
      // resolves it on the reload.
      const adminList = jest.fn().mockResolvedValue([owner]);
      const { users } = createStatefulUserMocks([]);
      users.create.mockImplementation(async (data: { name: string; email: string }) => {
        const u = {
          id: 'user_jane',
          ...data,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        adminList.mockResolvedValue([{ ...owner, user: u.id }]);
        users.list.mockResolvedValue([u]);
        return u;
      });
      const { instance } = await renderTM({
        ...adminNS(adminList),
        users,
        ...createStatefulExtensionMocks([]),
      });

      fireEvent.click(screen.getByRole('button', { name: 'Give phone access' }));

      await waitFor(() => {
        expect(instance.users.create).toHaveBeenCalledWith({
          name: 'Jane Doe',
          email: 'jane@example.com',
        });
      });
      await waitFor(() => {
        expect(instance.extensions.create).toHaveBeenCalledWith({
          number: '101',
          target: 'user_jane',
        });
      });
      await waitFor(() => {
        expect(screen.queryByText('No phone service')).toBeNull();
      });
      expect(screen.getByText('Jane Doe')).toBeTruthy();
    });

    it('rolls the user back when the extension cannot be created', async () => {
      const { instance } = await renderTM({
        ...adminNS(jest.fn().mockResolvedValue([owner])),
        ...usersNS(),
        ...extensionsNS({ create: jest.fn().mockRejectedValue(new Error('Extension taken')) }),
      });

      fireEvent.click(screen.getByRole('button', { name: 'Give phone access' }));

      await waitFor(() => {
        expect(instance.users.del).toHaveBeenCalledWith('user_new');
      });
      expect(await screen.findByText('Extension taken')).toBeTruthy();
      expect(screen.getByText('No phone service')).toBeTruthy();
    });

    it('hands an administrator with no name to the form instead of creating a user', async () => {
      const unnamed = { ...owner, name: null };
      const { container, instance } = await renderTM(
        adminNS(jest.fn().mockResolvedValue([unnamed]))
      );

      fireEvent.click(screen.getByRole('button', { name: 'Give phone access' }));

      expect((getFieldByLabel(container, 'Email') as HTMLInputElement).value).toBe(
        'jane@example.com'
      );
      expect(document.activeElement).toBe(getFieldByLabel(container, 'Full name'));
      expect(instance.users.create).not.toHaveBeenCalled();
    });

    it('clears a half-typed name when handing an administrator to the form', async () => {
      const unnamed = { ...owner, name: null };
      const { container } = await renderTM(adminNS(jest.fn().mockResolvedValue([unnamed])));

      fireEvent.change(getFieldByLabel(container, 'Full name'), { target: { value: 'Bob Smith' } });
      fireEvent.click(screen.getByRole('button', { name: 'Give phone access' }));

      expect((getFieldByLabel(container, 'Full name') as HTMLInputElement).value).toBe('');
    });

    it('reloads after a failed attempt so a seat left by a failed rollback shows', async () => {
      // The rollback fails, so the user survives without an extension. The
      // reload shows them as a user instead of offering a retry that can only
      // hit "already exists".
      const adminList = jest.fn().mockResolvedValue([owner]);
      const ns = usersNS({ del: jest.fn().mockRejectedValue(new Error('network')) });
      ns.users.create.mockImplementation(async (data: { name: string; email: string }) => {
        const u = { id: 'user_jane', ...data, created_at: '', updated_at: '' };
        adminList.mockResolvedValue([{ ...owner, user: u.id }]);
        (ns.users.list as jest.Mock).mockResolvedValue([u]);
        return u;
      });
      await renderTM({
        ...adminNS(adminList),
        ...ns,
        ...extensionsNS({ create: jest.fn().mockRejectedValue(new Error('Extension taken')) }),
      });

      fireEvent.click(screen.getByRole('button', { name: 'Give phone access' }));

      expect(await screen.findByText('Extension taken')).toBeTruthy();
      await waitFor(() => {
        expect(screen.queryByText('No phone service')).toBeNull();
      });
    });

    it('blocks deleting a user while giving phone access', async () => {
      let finishCreate: (u: unknown) => void = () => {};
      const ns = usersNS({ list: jest.fn().mockResolvedValue(mockUsers) });
      ns.users.create.mockImplementation(() => new Promise((resolve) => (finishCreate = resolve)));
      const { instance } = await renderTM({
        ...adminNS(jest.fn().mockResolvedValue([owner])),
        ...ns,
      });

      fireEvent.click(screen.getByRole('button', { name: 'Give phone access' }));
      await waitFor(() => {
        expect(instance.users.create).toHaveBeenCalled();
      });

      const removeBtn = screen.getByTitle('Remove') as HTMLButtonElement;
      expect(removeBtn.disabled).toBe(true);
      fireEvent.click(removeBtn);
      expect(instance.users.del).not.toHaveBeenCalled();

      finishCreate({ id: 'user_jane', name: 'Jane Doe', email: owner.email });
    });

    it('does not count an owner without a seat toward the team', async () => {
      await renderTM({
        ...adminNS(jest.fn().mockResolvedValue([owner])),
        users: { list: jest.fn().mockResolvedValue([]) },
      });

      const nextBtn = screen.getByRole('button', { name: /next/i }) as HTMLButtonElement;
      expect(nextBtn.disabled).toBe(true);
      expect(screen.queryByText('No team members added yet.')).toBeNull();
    });
  });
});
