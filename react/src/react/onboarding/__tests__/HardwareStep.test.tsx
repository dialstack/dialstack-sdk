/**
 * Tests for the React HardwareStep component.
 *
 * Ports the hardware step test cases from the WC account-onboarding tests
 * to React Testing Library.
 */

import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { HardwareStep } from '../steps/hardware/HardwareStep';
import {
  renderWithOnboarding,
  waitForLoadingToFinish,
  mockDevice,
  mockUsers,
  mockExtensions,
} from '../__test-helpers__/onboarding';

// Default instance overrides that provide users + extensions so the team table renders.
const withUsersAndExtensions = {
  users: {
    create: jest.fn().mockResolvedValue({}),
    list: jest.fn().mockResolvedValue(mockUsers),
    del: jest.fn().mockResolvedValue(undefined),
  },
  extensions: {
    list: jest.fn().mockResolvedValue(mockExtensions),
    create: jest.fn().mockResolvedValue({}),
  },
};

/**
 * Build a devices namespace override with a nested `users` (device-assignment)
 * sub-namespace. Partial overrides are deep-merged, so siblings are preserved.
 */
function devicesNS(overrides: Record<string, unknown> = {}) {
  const { users: usersOverrides, ...rest } = overrides as Record<string, unknown> & {
    users?: Record<string, unknown>;
  };
  return {
    devices: {
      retrieve: jest.fn().mockResolvedValue({}),
      list: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      users: {
        create: jest.fn().mockResolvedValue({}),
        list: jest.fn().mockResolvedValue([]),
        del: jest.fn().mockResolvedValue(undefined),
        ...usersOverrides,
      },
      ...rest,
    },
  };
}

/** Build a users namespace override. */
function usersNS(overrides: Record<string, unknown> = {}) {
  return {
    users: {
      create: jest.fn().mockResolvedValue({}),
      list: jest.fn().mockResolvedValue(mockUsers),
      del: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    },
  };
}

/** A deskphone with a user assignment (as returned by `expand[]=users`). */
function assignedDevice(userId: string) {
  return {
    ...mockDevice,
    assignments: [
      {
        user: userId,
        user_id: userId,
        device: mockDevice.id,
        device_id: mockDevice.id,
        line_number: 1,
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
  };
}

// Helper: render HardwareStep with optional instance overrides and wait for loading.
async function renderHardwareStep(instanceOverrides = {}) {
  const result = await renderWithOnboarding(<HardwareStep />, {
    instanceOverrides: {
      ...withUsersAndExtensions,
      ...instanceOverrides,
    },
    collectionOptions: { steps: { include: ['hardware'] } },
  });
  await waitForLoadingToFinish();
  return result;
}

describe('HardwareStep', () => {
  it('shows loading state on mount', async () => {
    await renderWithOnboarding(<HardwareStep />, {
      instanceOverrides: {
        // Use a never-resolving promise for device fetch to keep the loading state visible
        ...devicesNS({ list: jest.fn().mockReturnValue(new Promise(() => {})) }),
      },
      collectionOptions: { steps: { include: ['hardware'] } },
    });

    expect(document.querySelector('.skeleton-line')).not.toBeNull();
  });

  it('shows no-devices placeholder when no devices available', async () => {
    await renderHardwareStep();

    expect(
      screen.getByText('No devices are available for your account at the moment.')
    ).toBeInTheDocument();
  });

  it('disables Next when nothing is assigned and nothing was previously assigned', async () => {
    await renderHardwareStep();

    // With zero devices, zero assignments, and zero pre-existing records the
    // hardware predicate (≥1 device assignment) can't be met, so the wizard
    // must not let the user click through to a misleading "Setup Complete"
    // screen that would bounce right back.
    const nextButton = screen.getByRole('button', { name: /save & continue/i });
    expect(nextButton).toBeDisabled();
  });

  it('shows no users message when user list is empty on hardware step', async () => {
    await renderHardwareStep({
      ...usersNS({ list: jest.fn().mockResolvedValue([]) }),
      extensions: {
        list: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
    });

    expect(screen.getByText(/no team members found/i)).toBeInTheDocument();
  });

  it('renders device cards with draggable attribute', async () => {
    const unassignedDevice = { ...mockDevice, assignments: [] };
    await renderHardwareStep({
      ...devicesNS({ list: jest.fn().mockResolvedValue([unassignedDevice]) }),
    });

    const card = document.querySelector('.hw-device-card') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.getAttribute('draggable')).toBe('true');
  });

  it('renders team member table with drop zones', async () => {
    await renderHardwareStep({
      ...devicesNS({ list: jest.fn().mockResolvedValue([{ ...mockDevice, assignments: [] }]) }),
    });

    const table = document.querySelector('.hw-team-table');
    expect(table).not.toBeNull();

    const dropZone = document.querySelector('.hw-drop-zone');
    expect(dropZone).not.toBeNull();
    expect(dropZone!.textContent).toContain('Drag and drop device here');
  });

  it('assigns device via drag-and-drop and shows badge chip', async () => {
    const unassignedDevice = { ...mockDevice, assignments: [] };
    await renderHardwareStep({
      ...devicesNS({ list: jest.fn().mockResolvedValue([unassignedDevice]) }),
    });

    const card = document.querySelector('.hw-device-card') as HTMLElement;
    const dropZone = document.querySelector('.hw-drop-zone') as HTMLElement;

    // Simulate drag start
    fireEvent.dragStart(card, {
      dataTransfer: {
        setData: jest.fn(),
        getData: () => unassignedDevice.id,
        effectAllowed: 'move',
        dropEffect: 'move',
      },
    });

    // Simulate drop
    fireEvent.drop(dropZone, {
      dataTransfer: {
        getData: () => unassignedDevice.id,
      },
    });

    await waitFor(() => {
      const badge = document.querySelector('.hw-device-badge-chip');
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toContain('Snom');
    });
  });

  it('assigns device via click-to-assign and shows badge chip', async () => {
    const unassignedDevice = { ...mockDevice, assignments: [] };
    await renderHardwareStep({
      ...devicesNS({ list: jest.fn().mockResolvedValue([unassignedDevice]) }),
    });

    // Click the device card to select it
    const card = document.querySelector('.hw-device-card') as HTMLElement;
    fireEvent.click(card);

    await waitFor(() => {
      expect(document.querySelector('.hw-device-card--selected')).not.toBeNull();
      expect(document.querySelector('.hw-drop-zone--selectable')).not.toBeNull();
    });
    expect(document.querySelector('.hw-drop-zone')!.textContent).toContain('Click to assign');

    // Click the drop zone to assign
    const dropZone = document.querySelector('.hw-drop-zone') as HTMLElement;
    fireEvent.click(dropZone);

    await waitFor(() => {
      const badge = document.querySelector('.hw-device-badge-chip');
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toContain('Snom');
      // Card should no longer be in available devices
      expect(document.querySelector('.hw-device-card')).toBeNull();
    });
  });

  it('unassign removes badge and returns card to available', async () => {
    const unassignedDevice = { ...mockDevice, assignments: [] };
    await renderHardwareStep({
      ...devicesNS({ list: jest.fn().mockResolvedValue([unassignedDevice]) }),
    });

    // Assign via click
    const card = document.querySelector('.hw-device-card') as HTMLElement;
    fireEvent.click(card);
    await waitFor(() => {
      expect(document.querySelector('.hw-drop-zone--selectable')).not.toBeNull();
    });
    fireEvent.click(document.querySelector('.hw-drop-zone') as HTMLElement);

    await waitFor(() => {
      expect(document.querySelector('.hw-device-badge-chip')).not.toBeNull();
    });

    // Click the unassign button (x on badge chip)
    const removeBtn = document.querySelector('.hw-device-badge-chip__remove') as HTMLElement;
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(document.querySelector('.hw-device-badge-chip')).toBeNull();
      // Card should be back in available devices
      expect(document.querySelector('.hw-device-card')).not.toBeNull();
    });
  });

  it('shows Save & Continue when all devices assigned', async () => {
    const unassignedDevice = { ...mockDevice, assignments: [] };
    await renderHardwareStep({
      ...devicesNS({ list: jest.fn().mockResolvedValue([unassignedDevice]) }),
    });

    // Assign via click
    const card = document.querySelector('.hw-device-card') as HTMLElement;
    fireEvent.click(card);
    await waitFor(() => {
      expect(document.querySelector('.hw-drop-zone--selectable')).not.toBeNull();
    });
    fireEvent.click(document.querySelector('.hw-drop-zone') as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText('Save & Continue')).toBeInTheDocument();
      expect(screen.getByText('All devices have been assigned')).toBeInTheDocument();
    });
  });

  it('Save & Continue assigns the user to the device via device-assignment', async () => {
    const assignUser = jest.fn().mockResolvedValue({
      user: 'user_01abc',
      user_id: 'user_01abc',
      device: mockDevice.id,
      device_id: mockDevice.id,
      line_number: 1,
      created_at: new Date().toISOString(),
    });
    const unassignedDevice = { ...mockDevice, assignments: [] };

    await renderHardwareStep({
      ...devicesNS({
        list: jest.fn().mockResolvedValue([unassignedDevice]),
        users: { create: assignUser },
      }),
    });

    // Assign via click
    fireEvent.click(document.querySelector('.hw-device-card') as HTMLElement);
    await waitFor(() => {
      expect(document.querySelector('.hw-drop-zone--selectable')).not.toBeNull();
    });
    fireEvent.click(document.querySelector('.hw-drop-zone') as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText('Save & Continue')).toBeInTheDocument();
    });

    // Click Save & Continue
    fireEvent.click(screen.getByText('Save & Continue'));

    await waitFor(() => {
      expect(assignUser).toHaveBeenCalledWith(unassignedDevice.id, { user: 'user_01abc' });
    });
  });

  it('does not touch the device location when saving assignments', async () => {
    const assignUser = jest.fn().mockResolvedValue({
      user: 'user_01abc',
      user_id: 'user_01abc',
      device: mockDevice.id,
      device_id: mockDevice.id,
      line_number: 1,
      created_at: new Date().toISOString(),
    });
    // The user has no seat location, so the device's own location stands.
    const update = jest.fn().mockResolvedValue({});
    const unassignedDevice = { ...mockDevice, assignments: [] };

    await renderHardwareStep({
      ...devicesNS({
        list: jest.fn().mockResolvedValue([unassignedDevice]),
        update,
        users: { create: assignUser },
      }),
    });

    fireEvent.click(document.querySelector('.hw-device-card') as HTMLElement);
    await waitFor(() => {
      expect(document.querySelector('.hw-drop-zone--selectable')).not.toBeNull();
    });
    fireEvent.click(document.querySelector('.hw-drop-zone') as HTMLElement);
    await waitFor(() => {
      expect(screen.getByText('Save & Continue')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save & Continue'));
    await waitFor(() => {
      expect(assignUser).toHaveBeenCalledTimes(1);
    });
    expect(update).not.toHaveBeenCalled();
  });

  // A device's location may be a server default; assigning a user seated at
  // another site would then be refused, so onboarding moves the device first.
  it("moves a deskphone to its user's site before assigning", async () => {
    const calls: string[] = [];
    const update = jest.fn().mockImplementation(async () => {
      calls.push('update');
      return {};
    });
    const assignUser = jest.fn().mockImplementation(async () => {
      calls.push('assign');
      return {};
    });
    const unassignedDevice = { ...mockDevice, location: 'loc_main', assignments: [] };

    await renderHardwareStep({
      ...usersNS({
        list: jest.fn().mockResolvedValue([{ ...mockUsers[0], location: 'loc_branch' }]),
      }),
      ...devicesNS({
        list: jest.fn().mockResolvedValue([unassignedDevice]),
        update,
        users: { create: assignUser },
      }),
    });

    fireEvent.click(document.querySelector('.hw-device-card') as HTMLElement);
    await waitFor(() => {
      expect(document.querySelector('.hw-drop-zone--selectable')).not.toBeNull();
    });
    fireEvent.click(document.querySelector('.hw-drop-zone') as HTMLElement);
    fireEvent.click(await screen.findByText('Save & Continue'));

    await waitFor(() => {
      expect(assignUser).toHaveBeenCalledWith(unassignedDevice.id, { user: 'user_01abc' });
    });
    expect(update).toHaveBeenCalledWith(unassignedDevice.id, { location: 'loc_branch' });
    expect(calls).toEqual(['update', 'assign']);
  });

  function dectNS(baseLocation: string, handsets: Array<{ id: string; assignments: unknown[] }>) {
    return {
      dectBases: {
        list: jest.fn().mockResolvedValue([{ id: 'dectb_01abc', location: baseLocation }]),
        handsets: {
          list: jest
            .fn()
            .mockResolvedValue(
              handsets.map((h) => ({ id: h.id, base_id: 'dectb_01abc', display_name: h.id }))
            ),
        },
      },
    };
  }

  it("moves a DECT base to a handset user's site before assigning", async () => {
    const update = jest.fn().mockResolvedValue({});
    const assignUser = jest.fn().mockResolvedValue({});

    await renderHardwareStep({
      ...usersNS({
        list: jest.fn().mockResolvedValue([{ ...mockUsers[0], location: 'loc_branch' }]),
      }),
      ...dectNS('loc_main', [{ id: 'dect_01abc', assignments: [] }]),
      ...devicesNS({
        update,
        users: { create: assignUser, list: jest.fn().mockResolvedValue([]) },
      }),
    });

    fireEvent.click(document.querySelector('.hw-device-card') as HTMLElement);
    await waitFor(() => {
      expect(document.querySelector('.hw-drop-zone--selectable')).not.toBeNull();
    });
    fireEvent.click(document.querySelector('.hw-drop-zone') as HTMLElement);
    fireEvent.click(await screen.findByText('Save & Continue'));

    await waitFor(() => {
      expect(assignUser).toHaveBeenCalledWith('dect_01abc', { user: 'user_01abc' });
    });
    expect(update).toHaveBeenCalledWith('dectb_01abc', { location: 'loc_branch' });
  });

  // Another handset's user is seated at the base's current site: moving the
  // base would strand them, so onboarding leaves it and shows the API's refusal.
  it('leaves a base whose other handset user sits elsewhere, and shows the refusal', async () => {
    const update = jest.fn().mockResolvedValue({});
    const assignUser = jest
      .fn()
      .mockRejectedValue(
        new Error('device location contradicts the seat location already set on this user')
      );
    const bob = {
      id: 'user_02bob',
      name: 'Bob',
      email: 'bob@example.com',
      location: 'loc_main',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const bobAssignment = {
      user: bob.id,
      user_id: bob.id,
      device: 'dect_02bob',
      device_id: 'dect_02bob',
      line_number: 1,
      created_at: '2026-01-01T00:00:00Z',
    };

    await renderHardwareStep({
      ...usersNS({
        list: jest.fn().mockResolvedValue([{ ...mockUsers[0], location: 'loc_branch' }, bob]),
      }),
      ...dectNS('loc_main', [
        { id: 'dect_01abc', assignments: [] },
        { id: 'dect_02bob', assignments: [bobAssignment] },
      ]),
      ...devicesNS({
        update,
        users: {
          create: assignUser,
          list: jest
            .fn()
            .mockImplementation(async (id: string) => (id === 'dect_02bob' ? [bobAssignment] : [])),
        },
      }),
    });

    fireEvent.click(document.querySelector('.hw-device-card') as HTMLElement);
    await waitFor(() => {
      expect(document.querySelector('.hw-drop-zone--selectable')).not.toBeNull();
    });
    fireEvent.click(document.querySelector('.hw-drop-zone') as HTMLElement);
    fireEvent.click(await screen.findByText('Save & Continue'));

    expect(await screen.findByText(/contradicts the seat location/)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('pre-populates assignments from API on review', async () => {
    // The device is already assigned to user_01abc (expand[]=users on the list).
    await renderHardwareStep({
      ...devicesNS({ list: jest.fn().mockResolvedValue([assignedDevice('user_01abc')]) }),
    });

    // The device should already be assigned — badge chip visible, no unassigned card
    await waitFor(() => {
      const badge = document.querySelector('.hw-device-badge-chip');
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toContain('Snom');
    });

    // No unassigned device cards should remain
    expect(document.querySelector('.hw-device-card')).toBeNull();
  });
});
