/**
 * Shared test utilities for React onboarding component tests.
 *
 * Provides a mock DialStackInstance factory and render wrapper that
 * sets up DialstackComponentsProvider + OnboardingProvider with a real
 * OnboardingProgressStore — the same setup the real AccountOnboarding uses.
 */

import React from 'react';
import {
  render,
  type RenderOptions,
  type RenderResult,
  waitFor,
  screen,
} from '@testing-library/react';
import { DialstackComponentsProvider } from '../../DialstackComponentsProvider';
import { OnboardingProvider } from '../OnboardingContext';
import { OnboardingProgressStore } from '../progress-store';
import { defaultLocale } from '../../../locales';
import type { DialStackInstance, AccountConfig, OnboardingCollectionOptions } from '../../../types';
import type { Extension } from '../../../types/dial-plan';

// ============================================================================
// Mock data constants — mirrors WC test fixtures
// ============================================================================

export const mockAccount = {
  id: 'acct_01abc',
  email: 'existing@example.com',
  name: 'Acme Corp',
  phone: '(212) 555-0100',
  primary_contact_name: 'Jane Doe',
  config: {
    region: 'us-east',
    extension_length: 4,
    timezone: 'America/New_York',
  } as AccountConfig,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

export const mockUsers = [
  {
    id: 'user_01abc',
    name: 'Alice',
    email: 'alice@example.com',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

export const mockExtensions: Extension[] = [
  {
    number: '1001',
    target: 'user_01abc',
    status: 'active' as const,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

export const mockLocation = {
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

export const mockDevice = {
  id: 'dev_01abc',
  type: 'deskphone' as const,
  mac_address: '00:04:13:aa:bb:cc',
  vendor: 'snom',
  model: 'D785',
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

export const mockEndpoint = {
  id: 'ep_01abc',
  user_id: 'user_01abc',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

export const mockDID = {
  id: 'did_01abc',
  phone_number: '+12125551001',
  status: 'active' as const,
  caller_id_name: 'ACME Corp',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

export const mockMatchingDID = {
  id: 'did_match',
  phone_number: '+12125550100',
  status: 'active' as const,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// ============================================================================
// Mock instance factory
// ============================================================================

export interface MockInstanceOverrides {
  [key: string]: unknown;
}

/**
 * Creates a jest.fn()-based mock DialStackInstance with sensible defaults.
 * Pass overrides to customize individual methods.
 */
export function createMockInstance(overrides?: MockInstanceOverrides): DialStackInstance {
  const base = {
    getAccount: jest.fn().mockResolvedValue(mockAccount),
    updateAccount: jest.fn().mockResolvedValue(mockAccount),
    listUsers: jest.fn().mockResolvedValue(mockUsers),
    listExtensions: jest.fn().mockResolvedValue(mockExtensions),
    listLocations: jest.fn().mockResolvedValue([mockLocation]),
    createUser: jest.fn().mockImplementation(async (data: { name: string; email: string }) => ({
      id: 'user_new',
      name: data.name,
      email: data.email,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
    deleteUser: jest.fn().mockResolvedValue(undefined),
    createExtension: jest.fn().mockResolvedValue({
      number: '1002',
      target: 'user_new',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    createLocation: jest.fn().mockImplementation(async (data: unknown) => ({
      id: 'loc_new',
      ...(data as Record<string, unknown>),
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
    updateLocation: jest.fn().mockResolvedValue(mockLocation),
    suggestAddresses: jest.fn().mockResolvedValue([]),
    getPlaceDetails: jest.fn().mockResolvedValue({}),
    listDevices: jest.fn().mockResolvedValue([]),
    listDECTBases: jest.fn().mockResolvedValue([]),
    listEndpoints: jest.fn().mockResolvedValue([]),
    listDECTHandsets: jest.fn().mockResolvedValue([]),
    listDeskphoneLines: jest.fn().mockResolvedValue([]),
    createEndpoint: jest.fn().mockImplementation(async (userId: string) => ({
      id: 'ep_new_' + Math.random().toString(36).slice(2, 8),
      user_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
    createDeskphoneLine: jest
      .fn()
      .mockImplementation(async (deskphoneId: string, data: { endpoint_id: string }) => ({
        id: 'dln_new',
        device_id: deskphoneId,
        line_number: 1,
        endpoint_id: data.endpoint_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
    deleteDeskphoneLine: jest.fn().mockResolvedValue(undefined),
    createDECTExtension: jest.fn().mockResolvedValue({
      id: 'decte_new',
      handset_id: 'hs_01',
      endpoint_id: 'ep_01abc',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    deleteDECTExtension: jest.fn().mockResolvedValue(undefined),
    listPhoneNumbers: jest.fn().mockResolvedValue({
      object: 'list',
      data: [mockDID],
      next_page_url: null,
      previous_page_url: null,
    }),
    fetchAllPages: jest
      .fn()
      .mockImplementation(
        async (fetcher: (opts: { limit: number }) => Promise<{ data: unknown[] }>) => {
          const result = await fetcher({ limit: 100 });
          return result.data;
        }
      ),
    getCallerID: jest.fn().mockResolvedValue({ caller_id_name: '' }),
    updateCallerID: jest.fn().mockResolvedValue(undefined),
    searchAvailableNumbers: jest.fn().mockResolvedValue({ data: [] }),
    createNumberOrder: jest.fn().mockResolvedValue({
      id: 'order_01',
      status: 'pending',
      phone_numbers: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
    createPortOrder: jest.fn().mockResolvedValue({
      id: 'port_01',
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    approvePortOrder: jest.fn().mockResolvedValue(undefined),
    submitPortOrder: jest.fn().mockResolvedValue(undefined),
    uploadCSR: jest.fn().mockResolvedValue(undefined),
    uploadBillCopy: jest.fn().mockResolvedValue(undefined),
    checkPortEligibility: jest.fn().mockResolvedValue({ eligible: true, phone_numbers: [] }),
    deleteDeskphone: jest.fn().mockResolvedValue(undefined),
    getPhoneNumber: jest.fn().mockResolvedValue(mockDID),
    create: jest.fn(),
    update: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return base as unknown as DialStackInstance;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve a mock method's return value. Calls the mock and awaits the result.
 * Falls back to `defaultValue` if the override is not a function.
 */
async function resolveJestMockValue<T>(override: unknown, defaultValue: T): Promise<T> {
  if (!override || typeof override !== 'function') return defaultValue;
  try {
    return await (override as (...args: unknown[]) => T | Promise<T>)();
  } catch {
    return defaultValue;
  }
}

// ============================================================================
// Render wrapper
// ============================================================================

export interface SharedDataOverrides {
  account?: typeof mockAccount;
  users?: typeof mockUsers;
  extensions?: Extension[];
  locations?: Array<typeof mockLocation>;
}

export interface RenderOnboardingOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Override individual mock methods. */
  instanceOverrides?: MockInstanceOverrides;
  /** Collection options (steps include/exclude). */
  collectionOptions?: OnboardingCollectionOptions;
  /** Pre-hydrate the progress store. */
  progressHydration?: Record<string, unknown>;
  /** Override the accountConfig passed to OnboardingProvider. */
  accountConfig?: AccountConfig;
  /** Override shared data provided via OnboardingContext. */
  sharedData?: SharedDataOverrides;
}

export interface RenderOnboardingResult extends RenderResult {
  instance: DialStackInstance;
  progressStore: OnboardingProgressStore;
}

/**
 * Renders a component wrapped in the full onboarding provider stack.
 *
 * Returns the mock instance and progress store for assertions.
 *
 * Async because shared data props are resolved from mock return values
 * (which may be jest.fn().mockResolvedValue promises).
 */
export async function renderWithOnboarding(
  ui: React.ReactElement,
  options: RenderOnboardingOptions = {}
): Promise<RenderOnboardingResult> {
  const {
    instanceOverrides,
    collectionOptions,
    progressHydration,
    accountConfig,
    sharedData,
    ...renderOptions
  } = options;

  const instance = createMockInstance(instanceOverrides);
  const progressStore = new OnboardingProgressStore();
  if (progressHydration) {
    progressStore.hydrate(progressHydration as Record<string, string[]>);
  }

  // Resolve shared data: explicit sharedData overrides take priority, then
  // we extract from instanceOverrides mock return values, finally defaults.
  const resolvedAccount =
    sharedData?.account ?? (await resolveJestMockValue(instanceOverrides?.getAccount, mockAccount));
  const resolvedUsers =
    sharedData?.users ?? (await resolveJestMockValue(instanceOverrides?.listUsers, mockUsers));
  const resolvedExtensions =
    sharedData?.extensions ??
    (await resolveJestMockValue(instanceOverrides?.listExtensions, mockExtensions));
  const resolvedLocations =
    sharedData?.locations ??
    (await resolveJestMockValue(instanceOverrides?.listLocations, [mockLocation]));

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <DialstackComponentsProvider dialstack={instance}>
      <OnboardingProvider
        progressStore={progressStore}
        accountConfig={accountConfig ?? resolvedAccount.config}
        account={resolvedAccount}
        users={resolvedUsers}
        extensions={resolvedExtensions}
        locations={resolvedLocations}
        reloadSharedData={async () => {}}
        locale={defaultLocale}
        collectionOptions={collectionOptions}
      >
        {children}
      </OnboardingProvider>
    </DialstackComponentsProvider>
  );

  const result = render(ui, { wrapper: Wrapper, ...renderOptions });

  return {
    ...result,
    instance,
    progressStore,
  };
}

/**
 * Helper: wait for loading indicators to disappear.
 * Call after rendering a component that shows a skeleton or spinner on mount.
 */
export async function waitForLoadingToFinish() {
  await waitFor(() => {
    const spinners = screen.queryAllByText(/loading/i);
    const skeletons = document.querySelectorAll('.skeleton-line, .skeleton-circle');
    expect(spinners.length + skeletons.length).toBe(0);
  });
}
