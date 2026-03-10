import type { DialStackInstanceImpl } from '../types/core';
import type { AppearanceOptions, UpdateOptions } from '../types/appearance';
import type { SearchAvailableNumbersOptions, NumberOrder } from '../types/phone-number-ordering';
import type { DialPlan } from '../types/dial-plan';
import type { CallEventMap, CallEventHandler } from '../types/callbacks';
import type { ComponentTagName, ComponentElement } from '../types/components';
import type { CreatePortOrderRequest, ApprovePortOrderRequest } from '../types/number-porting';
import type {
  CreateDeviceRequest,
  UpdateDeviceRequest,
  DeviceListOptions,
  ProvisioningEventListOptions,
  ProvisionedDevice,
} from '../types/device';
import type {
  CreateDECTBaseRequest,
  UpdateDECTBaseRequest,
  CreateDECTHandsetRequest,
  UpdateDECTHandsetRequest,
  CreateDECTExtensionRequest,
} from '../types/dect';
import type {
  Account,
  OnboardingUser,
  OnboardingLocation,
  CreateUserRequest,
  CreateExtensionRequest,
  CreateLocationRequest,
  UpdateLocationRequest,
} from '../types/account-onboarding';
import type { Extension } from '../types/dial-plan';
import type { CreateDeviceLineRequest, DeviceLine } from '../types/device';
import type { OnboardingEndpoint, CreateEndpointRequest } from '../types/account-onboarding';
import {
  MOCK_CALLS,
  MOCK_VOICEMAILS,
  MOCK_PHONE_NUMBERS,
  MOCK_AVAILABLE_NUMBERS,
  MOCK_EMPTY_RESPONSE,
} from './mock-data';

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

/**
 * Creates a mock DialStackInstanceImpl for Storybook stories.
 * When `empty` is true, all data-fetching methods return empty results.
 */
export function createMockInstance(
  appearance: AppearanceOptions = { theme: 'light' },
  options: { empty?: boolean } = {}
): DialStackInstanceImpl {
  const empty = options.empty ?? false;
  const mockOrders = new Map<string, NumberOrder>();
  const mockDeviceModels: Array<{ vendor: string; model: string; count: number }> = [
    { vendor: 'snom', model: 'D785', count: 3 },
    { vendor: 'yealink', model: 'T48S', count: 1 },
    { vendor: 'poly', model: 'VVX 450', count: 4 },
    { vendor: 'grandstream', model: 'GRP2616', count: 2 },
    { vendor: 'cisco', model: '8845', count: 2 },
    { vendor: 'fanvil', model: 'X6U', count: 3 },
  ];

  let devIdx = 0;
  const mockDevices: ProvisionedDevice[] = empty
    ? []
    : mockDeviceModels.flatMap((m) =>
        Array.from({ length: m.count }, () => {
          devIdx++;
          return {
            id: `dev_mock${String(devIdx).padStart(3, '0')}`,
            mac_address: `00:04:13:${devIdx.toString(16).padStart(2, '0')}:00:01`,
            vendor: m.vendor,
            model: m.model,
            status: 'pending-sync' as const,
            lines: [],
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          };
        })
      );

  const mockExtensions: Extension[] = empty
    ? []
    : [
        {
          number: '1001',
          target: 'usr_mock01',
          status: 'active' as const,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          number: '1002',
          target: 'usr_mock02',
          status: 'active' as const,
          created_at: '2025-01-02T00:00:00Z',
          updated_at: '2025-01-02T00:00:00Z',
        },
      ];

  const instance: DialStackInstanceImpl = {
    getAppearance: () => appearance,
    getClientSecret: async () => 'mock_secret',

    // fetchComponentData calls this internally for call-logs, call-history, voicemails
    fetchApi: async (path: string) => {
      await delay();
      let body: unknown = MOCK_EMPTY_RESPONSE;

      if (!empty) {
        if (path.includes('/v1/calls')) body = MOCK_CALLS;
        else if (path.includes('/voicemails')) body = MOCK_VOICEMAILS;
        else if (path.includes('/v1/dialplans/'))
          body = {
            id: 'dp_01abc',
            name: 'Main Reception',
            entry_node: 'sched_01',
            nodes: [
              {
                id: 'sched_01',
                type: 'schedule',
                config: {
                  schedule_id: 'sched_01abc',
                  open: 'dial_01',
                  closed: undefined,
                  holiday: undefined,
                },
              },
              {
                id: 'dial_01',
                type: 'internal_dial',
                config: {
                  target_id: 'user_01abc',
                  next: undefined,
                },
              },
            ],
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          } satisfies DialPlan;
        else if (path.includes('/v1/schedules/'))
          body = { id: 'sched_01abc', name: 'Business Hours' };
        else if (path.includes('/v1/users/'))
          body = { id: 'user_01abc', name: 'Alice Smith', email: 'alice@example.com' };
      }

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },

    create: <T extends ComponentTagName>(tagName: T): ComponentElement[T] => {
      const el = document.createElement(`dialstack-${tagName}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const component = el as any;
      if (typeof component.setInstance === 'function') {
        component.setInstance(instance);
      }
      return el as ComponentElement[T];
    },
    update: (_updateOptions: UpdateOptions) => {},
    logout: async () => {},
    initiateCall: async (_userId: string, _dialString: string) => {},
    getTranscript: async (_callId: string) => ({
      call_id: 'mock',
      status: 'pending' as const,
      text: null,
    }),
    getVoicemailTranscript: async (_userId: string, _voicemailId: string) => ({
      voicemail_id: 'mock',
      status: 'completed' as const,
      text: 'Hello, this is a test voicemail. Please call me back when you get a chance. Thanks!',
    }),
    on: <K extends keyof CallEventMap>(
      _event: K,
      _handler: CallEventHandler<CallEventMap[K]>
    ) => {},
    off: <K extends keyof CallEventMap>(
      _event: K,
      _handler?: CallEventHandler<CallEventMap[K]>
    ) => {},

    // Phone numbers component uses these typed methods
    listPhoneNumbers: async () => (empty ? MOCK_EMPTY_RESPONSE : MOCK_PHONE_NUMBERS),
    listNumberOrders: async () => MOCK_EMPTY_RESPONSE,
    listPortOrders: async () => MOCK_EMPTY_RESPONSE,

    // Phone number ordering component
    searchAvailableNumbers: async (opts: SearchAvailableNumbersOptions) => {
      await delay();
      const qty = opts.quantity || 10;
      return empty
        ? []
        : MOCK_AVAILABLE_NUMBERS.slice(0, Math.min(qty, MOCK_AVAILABLE_NUMBERS.length));
    },
    createPhoneNumberOrder: async (phoneNumbers: string[]) => {
      await delay();
      const order: NumberOrder = {
        id: 'ord_' + Math.random().toString(36).slice(2, 10),
        order_type: 'purchase',
        status: 'pending',
        phone_numbers: phoneNumbers,
        completed_numbers: [],
        failed_numbers: [],
        error_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockOrders.set(order.id, order);
      setTimeout(() => {
        order.status = 'complete';
        order.completed_numbers = phoneNumbers;
      }, 3000);
      return order;
    },
    getPhoneNumberOrder: async (orderId: string) => {
      const order = mockOrders.get(orderId);
      if (!order) throw new Error(`Order ${orderId} not found`);
      return order;
    },

    // Account onboarding methods
    getAccount: async (): Promise<Account> => {
      await delay();
      return {
        id: 'acct_mock01',
        name: 'Acme Corp',
        email: 'admin@acme.com',
        phone: '+12018401234',
        primary_contact_name: 'Jane Doe',
        config: { timezone: 'America/New_York', extension_length: 4 },
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
    },
    updateAccount: async (_request) => {
      await delay();
      return {
        id: 'acct_mock01',
        name: 'Acme Corp',
        email: 'admin@acme.com',
        phone: '+12018401234',
        primary_contact_name: 'Jane Doe',
        config: { timezone: 'America/New_York' },
        created_at: '2025-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
      };
    },
    listUsers: async (): Promise<OnboardingUser[]> => {
      await delay();
      return empty
        ? []
        : [
            {
              id: 'usr_mock01',
              name: 'Alice Smith',
              email: 'alice@acme.com',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
            },
            {
              id: 'usr_mock02',
              name: 'Bob Jones',
              email: 'bob@acme.com',
              created_at: '2025-01-02T00:00:00Z',
              updated_at: '2025-01-02T00:00:00Z',
            },
          ];
    },
    createUser: async (request: CreateUserRequest): Promise<OnboardingUser> => {
      await delay();
      return {
        id: 'usr_' + Math.random().toString(36).slice(2, 10),
        name: request.name ?? null,
        email: request.email ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    },
    deleteUser: async (_userId: string) => {
      await delay();
    },
    createExtension: async (request: CreateExtensionRequest): Promise<Extension> => {
      await delay();
      return {
        id: 'ext_' + Math.random().toString(36).slice(2, 10),
        number: request.number,
        target: request.target,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      } as Extension;
    },
    listLocations: async (): Promise<OnboardingLocation[]> => {
      await delay();
      return empty
        ? []
        : [
            {
              id: 'loc_mock01',
              name: 'Main Office',
              address: {
                street: '123 Main St',
                city: 'New York',
                state: 'NY',
                postal_code: '10001',
                country: 'US',
                formatted_address: '123 Main St, New York, NY 10001, US',
              },
              status: 'active',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
            },
          ];
    },
    createLocation: async (request: CreateLocationRequest): Promise<OnboardingLocation> => {
      await delay();
      return {
        id: 'loc_' + Math.random().toString(36).slice(2, 10),
        name: request.name,
        address: {
          ...request.address,
          city: request.address.city,
          state: request.address.state,
          postal_code: request.address.postal_code,
          country: request.address.country,
        },
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    },
    updateLocation: async (
      _locationId: string,
      request: UpdateLocationRequest
    ): Promise<OnboardingLocation> => {
      await delay();
      return {
        id: _locationId,
        name: request.name,
        address: {
          ...request.address,
          city: request.address.city,
          state: request.address.state,
          postal_code: request.address.postal_code,
          country: request.address.country,
        },
        status: 'active',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
      };
    },
    suggestAddresses: async (_query: string) => {
      await delay(100);
      return [
        {
          place_id: 'place_01',
          title: '123 Main St',
          formatted_address: '123 Main St, New York, NY 10001',
        },
        {
          place_id: 'place_02',
          title: '456 Oak Ave',
          formatted_address: '456 Oak Ave, Brooklyn, NY 11201',
        },
      ];
    },
    getPlaceDetails: async (_placeId: string) => {
      await delay(100);
      return {
        place_id: _placeId,
        address_number: '123',
        street: 'Main St',
        city: 'New York',
        state: 'NY',
        postal_code: '10001',
        country: 'US',
        latitude: 40.7128,
        longitude: -74.006,
        timezone: 'America/New_York',
      };
    },
    createEndpoint: async (
      userId: string,
      _request?: CreateEndpointRequest
    ): Promise<OnboardingEndpoint> => {
      await delay();
      return {
        id: 'ep_' + Math.random().toString(36).slice(2, 10),
        user_id: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    },
    listEndpoints: async (_userId: string): Promise<OnboardingEndpoint[]> => [],
    createDeviceLine: async (
      deviceId: string,
      data: CreateDeviceLineRequest
    ): Promise<DeviceLine> => {
      await delay();
      return {
        id: 'dln_' + Math.random().toString(36).slice(2, 10),
        device_id: deviceId,
        line_number: 1,
        endpoint_id: data.endpoint_id,
      };
    },
    fetchAllPages: async <T>(
      _fetcher: (opts: { offset: number; limit: number }) => Promise<T[]>
    ): Promise<T[]> => {
      return [];
    },
    uploadBillCopy: async () => {},
    uploadCSR: async () => {},

    // Routing target resolution
    listExtensions: async () => [...mockExtensions],
    getCallerID: async (_phoneNumberId: string) => ({ caller_id_name: 'ACME Corp' }),
    resolveRoutingTarget: async (target: string) => ({
      id: target,
      name: target.startsWith('rg_') ? 'Main Ring Group' : 'Alice Smith',
      type: (target.startsWith('rg_') ? 'ring_group' : 'user') as 'ring_group' | 'user',
    }),

    checkPortEligibility: async (phoneNumbers: string[]) => {
      await delay();
      return {
        portable_numbers: phoneNumbers.map((n) => ({
          phone_number: n,
          losing_carrier_name: 'OldTelco',
          losing_carrier_spid: '6214',
          is_wireless: false,
          account_number_required: true,
        })),
        non_portable_numbers: [],
      };
    },
    createPortOrder: async (_request: CreatePortOrderRequest) => {
      await delay();
      return {
        id: 'po_mock_' + Math.random().toString(36).slice(2, 10),
        status: 'draft' as const,
        details: { phone_numbers: _request.phone_numbers, subscriber: null },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    },
    getPortOrder: async (orderId: string) => ({
      id: orderId,
      status: 'submitted' as const,
      details: { phone_numbers: [], subscriber: null },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    approvePortOrder: async (orderId: string, _request: ApprovePortOrderRequest) => ({
      id: orderId,
      status: 'submitted' as const,
      details: { phone_numbers: [], subscriber: null },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    submitPortOrder: async (orderId: string) => ({
      id: orderId,
      status: 'submitted' as const,
      details: { phone_numbers: [], subscriber: null },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    cancelPortOrder: async (_orderId: string) => {
      await delay();
    },
    createDevice: async (data: CreateDeviceRequest) => {
      await delay();
      const dev: ProvisionedDevice = {
        id: 'dev_' + Math.random().toString(36).slice(2, 10),
        mac_address: data.mac_address,
        vendor: 'snom',
        model: 'D785',
        status: 'pending-sync',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDevices.push(dev);
      return dev;
    },
    getDevice: async (_id: string) => {
      throw new Error('Not implemented in mock');
    },
    listDevices: async (_options?: DeviceListOptions) => [...mockDevices],
    listDeviceLines: async (_deviceId: string): Promise<DeviceLine[]> => [],
    updateDevice: async (_id: string, _data: UpdateDeviceRequest) => {
      throw new Error('Not implemented in mock');
    },
    deleteDevice: async (_id: string) => {},
    listProvisioningEvents: async (
      _deviceId: string,
      _options?: ProvisioningEventListOptions
    ) => [],
    createDECTBase: async (_data: CreateDECTBaseRequest) => {
      throw new Error('Not implemented in mock');
    },
    getDECTBase: async (_id: string) => {
      throw new Error('Not implemented in mock');
    },
    listDECTBases: async () => [],
    updateDECTBase: async (_id: string, _data: UpdateDECTBaseRequest) => {
      throw new Error('Not implemented in mock');
    },
    deleteDECTBase: async (_id: string) => {},
    createDECTHandset: async (_baseId: string, _data: CreateDECTHandsetRequest) => {
      throw new Error('Not implemented in mock');
    },
    getDECTHandset: async (_baseId: string, _handsetId: string) => {
      throw new Error('Not implemented in mock');
    },
    listDECTHandsets: async (_baseId: string) => [],
    updateDECTHandset: async (
      _baseId: string,
      _handsetId: string,
      _data: UpdateDECTHandsetRequest
    ) => {
      throw new Error('Not implemented in mock');
    },
    deleteDECTHandset: async (_baseId: string, _handsetId: string) => {},
    createDECTExtension: async (
      _baseId: string,
      _handsetId: string,
      _data: CreateDECTExtensionRequest
    ) => {
      throw new Error('Not implemented in mock');
    },
    listDECTExtensions: async (_baseId: string, _handsetId: string) => [],
    deleteDECTExtension: async (_baseId: string, _handsetId: string, _extensionId: string) => {},
  };

  return instance;
}
