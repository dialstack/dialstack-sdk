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
} from '../types/device';
import type {
  CreateDECTBaseRequest,
  UpdateDECTBaseRequest,
  CreateDECTHandsetRequest,
  UpdateDECTHandsetRequest,
  CreateDECTExtensionRequest,
} from '../types/dect';
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

    // Routing target resolution
    listExtensions: async () => [],
    getCallerID: async (_phoneNumberId: string) => ({ caller_id_name: 'ACME Corp' }),
    resolveRoutingTarget: async (target: string) => ({
      id: target,
      name: target.startsWith('rg_') ? 'Main Ring Group' : 'Alice Smith',
      type: (target.startsWith('rg_') ? 'ring_group' : 'user') as 'ring_group' | 'user',
    }),

    // Stubs for unused methods
    checkPortEligibility: async (_phoneNumbers: string[]) => ({
      portable_numbers: [],
      non_portable_numbers: [],
    }),
    createPortOrder: async (_request: CreatePortOrderRequest) => {
      throw new Error('Not implemented in mock');
    },
    getPortOrder: async (_orderId: string) => {
      throw new Error('Not implemented in mock');
    },
    approvePortOrder: async (_orderId: string, _request: ApprovePortOrderRequest) => {
      throw new Error('Not implemented in mock');
    },
    submitPortOrder: async (_orderId: string) => {
      throw new Error('Not implemented in mock');
    },
    cancelPortOrder: async (_orderId: string) => {
      throw new Error('Not implemented in mock');
    },
    createDevice: async (_data: CreateDeviceRequest) => {
      throw new Error('Not implemented in mock');
    },
    getDevice: async (_id: string) => {
      throw new Error('Not implemented in mock');
    },
    listDevices: async (_options?: DeviceListOptions) => [],
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
