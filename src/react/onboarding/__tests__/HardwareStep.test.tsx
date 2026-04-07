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
  mockEndpoint,
} from '../__test-helpers__/onboarding';

// Default instance overrides that provide users + extensions so the team table renders.
const withUsersAndExtensions = {
  users: {
    create: jest.fn().mockResolvedValue({}),
    list: jest.fn().mockResolvedValue(mockUsers),
    del: jest.fn().mockResolvedValue(undefined),
    endpoints: {
      create: jest.fn().mockResolvedValue({}),
      list: jest.fn().mockResolvedValue([]),
    },
  },
  extensions: {
    list: jest.fn().mockResolvedValue(mockExtensions),
    create: jest.fn().mockResolvedValue({}),
  },
};

/** Build devices namespace override. */
function devicesNS(overrides: Record<string, unknown> = {}) {
  return {
    devices: {
      retrieve: jest.fn().mockResolvedValue({}),
      list: jest.fn().mockResolvedValue([]),
      ...overrides,
    },
  };
}

/** Build deskphones namespace override with nested lines. */
function deskphonesNS(overrides: Record<string, unknown> = {}) {
  const { lines: linesOverrides, ...rest } = overrides as Record<string, unknown> & {
    lines?: Record<string, unknown>;
  };
  return {
    deskphones: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      del: jest.fn().mockResolvedValue(undefined),
      lines: {
        create: jest.fn().mockResolvedValue({
          id: 'dln_new',
          device_id: '',
          line_number: 1,
          endpoint_id: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        list: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        del: jest.fn().mockResolvedValue(undefined),
        ...linesOverrides,
      },
      provisioningEvents: { list: jest.fn().mockResolvedValue([]) },
      ...rest,
    },
  };
}

/** Build a users namespace override with endpoints sub-namespace. */
function usersNS(overrides: Record<string, unknown> = {}) {
  const { endpoints: endpointsOverrides, ...rest } = overrides as Record<string, unknown> & {
    endpoints?: Record<string, unknown>;
  };
  return {
    users: {
      create: jest.fn().mockResolvedValue({}),
      list: jest.fn().mockResolvedValue(mockUsers),
      del: jest.fn().mockResolvedValue(undefined),
      endpoints: {
        create: jest.fn().mockResolvedValue({}),
        list: jest.fn().mockResolvedValue([]),
        ...endpointsOverrides,
      },
      ...rest,
    },
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

  it('hardware step is skippable (Next works without assignments)', async () => {
    await renderHardwareStep();

    const nextButton = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextButton);

    // After clicking next with no devices, the step completes and shows the done screen
    await waitFor(() => {
      expect(screen.getByText('Hardware Setup Complete')).toBeInTheDocument();
    });
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
    const unassignedDevice = { ...mockDevice, lines: [] };
    await renderHardwareStep({
      ...devicesNS({ list: jest.fn().mockResolvedValue([unassignedDevice]) }),
      ...deskphonesNS(),
      ...usersNS({ endpoints: { list: jest.fn().mockResolvedValue([]) } }),
    });

    const card = document.querySelector('.hw-device-card') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.getAttribute('draggable')).toBe('true');
  });

  it('renders team member table with drop zones', async () => {
    await renderHardwareStep({
      ...devicesNS({ list: jest.fn().mockResolvedValue([{ ...mockDevice, lines: [] }]) }),
      ...deskphonesNS(),
      ...usersNS({ endpoints: { list: jest.fn().mockResolvedValue([]) } }),
    });

    const table = document.querySelector('.hw-team-table');
    expect(table).not.toBeNull();

    const dropZone = document.querySelector('.hw-drop-zone');
    expect(dropZone).not.toBeNull();
    expect(dropZone!.textContent).toContain('Drag and drop device here');
  });

  it('assigns device via drag-and-drop and shows badge chip', async () => {
    const unassignedDevice = { ...mockDevice, lines: [] };
    await renderHardwareStep({
      ...devicesNS({ list: jest.fn().mockResolvedValue([unassignedDevice]) }),
      ...deskphonesNS(),
      ...usersNS({ endpoints: { list: jest.fn().mockResolvedValue([]) } }),
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
    const unassignedDevice = { ...mockDevice, lines: [] };
    await renderHardwareStep({
      ...devicesNS({ list: jest.fn().mockResolvedValue([unassignedDevice]) }),
      ...deskphonesNS(),
      ...usersNS({ endpoints: { list: jest.fn().mockResolvedValue([]) } }),
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
    const unassignedDevice = { ...mockDevice, lines: [] };
    await renderHardwareStep({
      ...devicesNS({ list: jest.fn().mockResolvedValue([unassignedDevice]) }),
      ...deskphonesNS(),
      ...usersNS({ endpoints: { list: jest.fn().mockResolvedValue([]) } }),
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

  it('shows Assign & Complete when all devices assigned', async () => {
    const unassignedDevice = { ...mockDevice, lines: [] };
    await renderHardwareStep({
      ...devicesNS({ list: jest.fn().mockResolvedValue([unassignedDevice]) }),
      ...deskphonesNS(),
      ...usersNS({ endpoints: { list: jest.fn().mockResolvedValue([]) } }),
    });

    // Assign via click
    const card = document.querySelector('.hw-device-card') as HTMLElement;
    fireEvent.click(card);
    await waitFor(() => {
      expect(document.querySelector('.hw-drop-zone--selectable')).not.toBeNull();
    });
    fireEvent.click(document.querySelector('.hw-drop-zone') as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText('Assign & Complete')).toBeInTheDocument();
      expect(screen.getByText('All devices have been assigned')).toBeInTheDocument();
    });
  });

  it('Assign & Complete calls API to create deskphone line', async () => {
    const createDeskphoneLine = jest.fn().mockResolvedValue({
      id: 'dln_new',
      device_id: mockDevice.id,
      line_number: 1,
      endpoint_id: mockEndpoint.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const unassignedDevice = { ...mockDevice, lines: [] };

    const { instance: _instance } = await renderHardwareStep({
      ...devicesNS({ list: jest.fn().mockResolvedValue([unassignedDevice]) }),
      ...deskphonesNS({
        lines: { create: createDeskphoneLine, list: jest.fn().mockResolvedValue([]) },
      }),
      ...usersNS({ endpoints: { list: jest.fn().mockResolvedValue([mockEndpoint]) } }),
    });

    // Assign via click
    fireEvent.click(document.querySelector('.hw-device-card') as HTMLElement);
    await waitFor(() => {
      expect(document.querySelector('.hw-drop-zone--selectable')).not.toBeNull();
    });
    fireEvent.click(document.querySelector('.hw-drop-zone') as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText('Assign & Complete')).toBeInTheDocument();
    });

    // Click Assign & Complete
    fireEvent.click(screen.getByText('Assign & Complete'));

    await waitFor(() => {
      expect(createDeskphoneLine).toHaveBeenCalledWith(unassignedDevice.id, {
        endpoint_id: mockEndpoint.id,
      });
    });
  });

  it('pre-populates assignments from API on review', async () => {
    // Device has a line with endpoint_id pointing to an endpoint owned by user_01abc
    const deviceWithLine = {
      ...mockDevice,
      lines: [
        {
          id: 'dln_01abc',
          device_id: mockDevice.id,
          line_number: 1,
          endpoint_id: 'ep_01abc',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    };

    await renderHardwareStep({
      ...devicesNS({ list: jest.fn().mockResolvedValue([deviceWithLine]) }),
      ...deskphonesNS({
        lines: {
          list: jest.fn().mockResolvedValue([
            {
              id: 'dln_01abc',
              device_id: mockDevice.id,
              line_number: 1,
              endpoint_id: 'ep_01abc',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          ]),
        },
      }),
      ...usersNS({ endpoints: { list: jest.fn().mockResolvedValue([mockEndpoint]) } }),
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
