import type { DialStackInstanceImpl } from '../types/core';
import type { AppearanceOptions, UpdateOptions } from '../types/appearance';
import type { SearchAvailableNumbersOptions, NumberOrder } from '../types/phone-number-ordering';
import type { DIDItem, PaginatedResponse } from '../types';
import type { DialPlan } from '../types/dial-plan';
import type { CallEventMap, CallEventHandler } from '../types/callbacks';
import type { ComponentTagName, ComponentElement } from '../types/components';
import type {
  CreatePortOrderRequest,
  ApprovePortOrderRequest,
  PortOrder,
} from '../types/number-porting';
import type {
  CreateDeskphoneRequest,
  UpdateDeskphoneRequest,
  CreateDeviceRequest,
  CreateDeviceResponse,
  UpdateDeviceRequest,
  DeviceListOptions,
  ProvisioningEventListOptions,
  Device,
} from '../types/device';
import type {
  CreateButtonTemplateRequest,
  UpdateButtonTemplateRequest,
  CreateTemplateButtonRequest,
  UpdateTemplateButtonRequest,
  CreateDeviceButtonOverrideRequest,
} from '../types/button';
import type {
  CreateDECTBaseRequest,
  UpdateDECTBaseRequest,
  CreateDECTHandsetRequest,
  UpdateDECTHandsetRequest,
  CreateDECTExtensionRequest,
  DECTExtension,
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
import type { CreateDeskphoneLineRequest, DeviceLine } from '../types/device';
import type {
  OnboardingEndpoint,
  CreateEndpointRequest,
  UpdateEndpointRequest,
} from '../types/account-onboarding';
import {
  MOCK_CALLS,
  MOCK_VOICEMAILS,
  MOCK_PHONE_NUMBERS,
  MOCK_AVAILABLE_NUMBERS,
  MOCK_EMPTY_RESPONSE,
} from './mock-data';

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

const MOCK_DIAL_PLAN_DEFAULT: DialPlan = {
  id: 'dp_01abc',
  name: 'Main Reception',
  entry_node: 'sched_01',
  nodes: [
    {
      id: 'sched_01',
      type: 'schedule',
      config: { schedule_id: 'sched_01abc', open: 'dial_01', closed: undefined },
    },
    {
      id: 'dial_01',
      type: 'internal_dial',
      config: { target_id: 'user_01abc', next: undefined },
    },
  ],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const MOCK_DIAL_PLAN_RING_ALL: DialPlan = {
  id: 'dp_ringall',
  name: 'Ring All Plan',
  entry_node: 'ring1',
  nodes: [{ id: 'ring1', type: 'ring_all_users', config: { timeout: 24 } }],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

/**
 * Creates a mock DialStackInstanceImpl for Storybook stories.
 * When `empty` is true, all data-fetching methods return empty results.
 */
export function createMockInstance(
  appearance: AppearanceOptions = { theme: 'light' },
  options: { empty?: boolean; dids?: DIDItem[]; account?: Partial<Account> } = {}
): DialStackInstanceImpl {
  const empty = options.empty ?? false;
  const mockOrders = new Map<string, NumberOrder>();
  const mockPortOrders = new Map<string, PortOrder>();
  const mockEndpoints = new Map<string, OnboardingEndpoint[]>(); // userId → endpoints
  const mockDeviceLines = new Map<string, DeviceLine[]>(); // deviceId → lines
  const mockDECTExts = new Map<string, DECTExtension[]>(); // `${baseId}/${handsetId}` → extensions
  const mockDIDs: DIDItem[] = options.dids ?? (empty ? [] : [...MOCK_PHONE_NUMBERS.data]);
  const mockDeviceModels: Array<{ vendor: string; model: string; count: number }> = [
    { vendor: 'snom', model: 'D785', count: 3 },
    { vendor: 'yealink', model: 'T48S', count: 1 },
    { vendor: 'poly', model: 'VVX 450', count: 4 },
    { vendor: 'grandstream', model: 'GRP2616', count: 2 },
    { vendor: 'cisco', model: '8845', count: 2 },
    { vendor: 'fanvil', model: 'X6U', count: 3 },
  ];

  let devIdx = 0;
  const mockDevices: Device[] = empty
    ? []
    : mockDeviceModels.flatMap((m) =>
        Array.from({ length: m.count }, () => {
          devIdx++;
          return {
            id: `dev_mock${String(devIdx).padStart(3, '0')}`,
            type: 'deskphone' as const,
            mac_address: `00:04:13:${devIdx.toString(16).padStart(2, '0')}:00:01`,
            vendor: m.vendor,
            model: m.model,
            status: 'pending-sync' as const,
            registration_status: 'not_registered' as const,
            last_registered_at: null,
            last_call_at: null,
            lines: [],
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          };
        })
      );

  const mockUsersList: OnboardingUser[] = empty
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

  const mockAccount: Account = {
    id: 'acct_mock01',
    name: 'Acme Corp',
    email: 'admin@acme.com',
    phone: '+12018401234',
    primary_contact_name: 'Jane Doe',
    config: { timezone: 'America/New_York', extension_length: 4 },
    onboarding_complete: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...options.account,
  };

  const mockLocations: OnboardingLocation[] = empty
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
          e911_status: 'none',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

  const mockExtensionsList: Extension[] = empty
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
        else if (path.includes('/v1/dialplans/dp_ringall')) body = MOCK_DIAL_PLAN_RING_ALL;
        else if (path.includes('/v1/dialplans/')) body = MOCK_DIAL_PLAN_DEFAULT;
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
    addAppearanceTarget: (_element: HTMLElement) => {},
    removeAppearanceTarget: (_element: HTMLElement) => {},
    update: (_updateOptions: UpdateOptions) => {},
    logout: async () => {},

    calls: {
      create: async (_params: { userId: string; dialString: string }) => {},
      retrieve: async (callId: string) => {
        await delay();
        return {
          id: callId,
          direction: 'inbound' as const,
          from_number: '+15551234567',
          from_label: 'John Doe',
          to_number: '+15559876543',
          to_label: 'Front Desk',
          started_at: new Date(Date.now() - 300000).toISOString(),
          answered_at: new Date(Date.now() - 295000).toISOString(),
          ended_at: new Date(Date.now() - 60000).toISOString(),
          duration_seconds: 235,
          status: 'completed' as const,
          summary: 'Customer called to inquire about their account balance.',
          recording_url: 'https://example.com/mock-recording.wav',
          quality_metrics: [
            {
              leg: 'pstn',
              mos: 4.2,
              jitter_ms: 12.5,
              packet_loss_pct: 0.1,
              rtt_ms: 45.0,
            },
          ],
        };
      },
      transcripts: {
        retrieve: async (_callId: string) => ({
          call_id: 'mock',
          status: 'pending' as const,
          text: null,
        }),
      },
    },

    voicemails: {
      retrieveTranscript: async (_voicemailId: string) => ({
        voicemail_id: 'mock',
        status: 'completed' as const,
        text: 'Hello, this is a test voicemail. Please call me back when you get a chance. Thanks!',
      }),
      markAsRead: async (_voicemailId: string) => {},
      delete: async (_voicemailId: string) => {},
    },

    on: <K extends keyof CallEventMap>(
      _event: K,
      _handler: CallEventHandler<CallEventMap[K]>
    ) => {},
    off: <K extends keyof CallEventMap>(
      _event: K,
      _handler?: CallEventHandler<CallEventMap[K]>
    ) => {},

    phoneNumbers: {
      retrieve: async (phoneNumberId: string) => {
        await delay();
        const did = mockDIDs.find((d) => d.id === phoneNumberId);
        if (!did) throw new Error('Phone number not found');
        return { ...did };
      },
      list: async (options?: { status?: string }) => {
        const filtered = options?.status
          ? mockDIDs.filter((d) => d.status === options.status)
          : mockDIDs;
        return {
          object: 'list',
          url: '/v1/phone-numbers',
          data: filtered,
          next_page_url: null,
          previous_page_url: null,
        } as PaginatedResponse<DIDItem>;
      },
      update: async (phoneNumberId: string, update: Record<string, unknown>) => {
        await delay();
        const did = mockDIDs.find((d) => d.id === phoneNumberId);
        if (!did) throw new Error('Phone number not found');
        const writable = did as Record<string, unknown>;
        if (update.caller_id_name !== undefined) writable.caller_id_name = update.caller_id_name;
        if (update.directory_listing_type !== undefined)
          writable.directory_listing_type = update.directory_listing_type;
        if (update.directory_listing_name !== undefined)
          writable.directory_listing_name = update.directory_listing_name;
        if (update.directory_listing_location_id !== undefined)
          writable.directory_listing_location_id = update.directory_listing_location_id;
        return { ...did };
      },
      updateRoute: async (phoneNumberId: string, routingTarget: string | null) => {
        await delay();
        const did = mockDIDs.find((d) => d.id === phoneNumberId);
        if (!did) throw new Error('Phone number not found');
        did.routing_target = routingTarget;
        return { ...did };
      },
    },

    availablePhoneNumbers: {
      search: async (opts: SearchAvailableNumbersOptions) => {
        await delay();
        const qty = opts.quantity || 10;
        return empty
          ? []
          : MOCK_AVAILABLE_NUMBERS.slice(0, Math.min(qty, MOCK_AVAILABLE_NUMBERS.length));
      },
    },

    phoneNumberOrders: {
      create: async (phoneNumbers: string[]) => {
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
          // Add ordered numbers as active DIDs
          for (const pn of phoneNumbers) {
            const id = 'did_' + Math.random().toString(36).slice(2, 10);
            mockDIDs.push({
              id,
              phone_number: pn,
              status: 'active',
              outbound_enabled: true,
              routing_target: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        }, 3000);
        return order;
      },
      retrieve: async (orderId: string) => {
        const order = mockOrders.get(orderId);
        if (!order) throw new Error(`Order ${orderId} not found`);
        return order;
      },
      list: async () => MOCK_EMPTY_RESPONSE,
    },

    portOrders: {
      create: async (request: CreatePortOrderRequest) => {
        await delay();
        const order: PortOrder = {
          id: 'po_mock_' + Math.random().toString(36).slice(2, 10),
          status: 'draft',
          details: {
            phone_numbers: request.phone_numbers,
            subscriber: request.subscriber,
            requested_foc_date: request.requested_foc_date,
            requested_foc_time: request.requested_foc_time ?? null,
          },
          submitted_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        mockPortOrders.set(order.id, order);
        return order;
      },
      retrieve: async (orderId: string) => {
        const order = mockPortOrders.get(orderId);
        if (order) return order;
        return {
          id: orderId,
          status: 'submitted' as const,
          details: { phone_numbers: [] as string[] },
          submitted_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      },
      list: async () => ({
        object: 'list' as const,
        url: '/v1/port-orders',
        data: Array.from(mockPortOrders.values()),
        next_page_url: null,
        previous_page_url: null,
      }),
      approve: async (orderId: string, _request: ApprovePortOrderRequest) => {
        const order = mockPortOrders.get(orderId);
        if (order) {
          order.status = 'approved';
          order.updated_at = new Date().toISOString();
          return order;
        }
        return {
          id: orderId,
          status: 'approved' as const,
          details: { phone_numbers: [] as string[] },
          submitted_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      },
      submit: async (orderId: string) => {
        const order = mockPortOrders.get(orderId);
        if (order) {
          order.status = 'submitted';
          order.submitted_at = new Date().toISOString();
          order.updated_at = new Date().toISOString();
          return order;
        }
        return {
          id: orderId,
          status: 'submitted' as const,
          details: { phone_numbers: [] as string[] },
          submitted_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      },
      cancel: async (_orderId: string) => {
        await delay();
      },
      checkEligibility: async (phoneNumbers: string[]) => {
        await delay();
        return {
          portable_numbers: phoneNumbers.map((n) => ({
            phone_number: n,
            losing_carrier_name: 'AT&T Mobility',
            losing_carrier_spid: '6214',
            is_wireless: false,
            account_number_required: true,
          })),
          non_portable_numbers: [],
        };
      },
      uploadCSR: async () => {},
      uploadBillCopy: async () => {},
      downloadCSR: async () => new Blob(),
      downloadBillCopy: async () => new Blob(),
    },

    dialPlans: {
      retrieve: async (_dialPlanId: string) => MOCK_DIAL_PLAN_DEFAULT,
      list: async () => [],
      create: async (_data: Record<string, unknown>) => MOCK_DIAL_PLAN_DEFAULT,
      update: async (_dialPlanId: string, _data: Record<string, unknown>) => MOCK_DIAL_PLAN_DEFAULT,
    },

    schedules: {
      retrieve: async (_scheduleId: string) => ({
        id: 'sched_01abc',
        name: 'Business Hours',
      }),
      list: async () => [],
    },

    ringGroups: {
      list: async () => [],
    },

    queues: {
      list: async () => [],
    },

    voiceApps: {
      list: async () => [],
    },

    aiAgents: {
      retrieve: async (_aiAgentId: string) => {
        await delay();
        return {
          id: 'aia_01abc',
          name: 'VoiceAI Agent',
          voice_app_id: 'va_01abc',
          persona_name: 'Receptionist',
          greeting_name: 'Sample Practice',
          instructions:
            'You are the AI receptionist for the sample practice. Help callers reach the right person, look up appointments, and book new visits. Never share patient information until verified. For medical questions, take a message.',
          faq_responses: [
            { question: 'What are your hours?', answer: 'Monday to Friday, 9am to 5pm.' },
          ],
          scheduling: null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        };
      },
      update: async (aiAgentId: string, data) => {
        await delay();
        return {
          id: aiAgentId,
          name: data.name ?? 'VoiceAI Agent',
          voice_app_id: 'va_01abc',
          persona_name: data.persona_name ?? null,
          greeting_name: data.greeting_name ?? null,
          instructions: data.instructions ?? null,
          faq_responses: data.faq_responses ?? [],
          scheduling: null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: new Date().toISOString(),
        };
      },
    },

    sharedVoicemailBoxes: {
      list: async () => [],
    },

    extensions: {
      list: async () => [...mockExtensionsList],
      create: async (request: CreateExtensionRequest): Promise<Extension> => {
        await delay();
        const ext: Extension = {
          number: request.number,
          target: request.target,
          status: 'active' as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        mockExtensionsList.push(ext);
        return ext;
      },
    },

    deskphones: {
      create: async (data: CreateDeskphoneRequest) => {
        await delay();
        const dev: Device = {
          id: 'dev_' + Math.random().toString(36).slice(2, 10),
          type: 'deskphone',
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
      update: async (_id: string, _data: UpdateDeskphoneRequest) => {
        throw new Error('Not implemented in mock');
      },
      del: async (_id: string) => {},
      lines: {
        create: async (
          deskphoneId: string,
          data: CreateDeskphoneLineRequest
        ): Promise<DeviceLine> => {
          await delay();
          const existing = mockDeviceLines.get(deskphoneId) ?? [];
          const line: DeviceLine = {
            id: 'dln_' + Math.random().toString(36).slice(2, 10),
            device_id: deskphoneId,
            line_number: existing.length + 1,
            endpoint_id: data.endpoint_id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          mockDeviceLines.set(deskphoneId, [...existing, line]);
          return line;
        },
        list: async (deskphoneId: string): Promise<DeviceLine[]> =>
          mockDeviceLines.get(deskphoneId) ?? [],
        update: async (_deskphoneId: string, _lineId: string, _data) => {
          throw new Error('Not implemented in mock');
        },
        del: async (deskphoneId: string, lineId: string): Promise<void> => {
          const lines = mockDeviceLines.get(deskphoneId) ?? [];
          mockDeviceLines.set(
            deskphoneId,
            lines.filter((l) => l.id !== lineId)
          );
        },
      },
      provisioningEvents: {
        list: async (_deskphoneId: string, _options?: ProvisioningEventListOptions) => [],
      },
    },

    devices: {
      create: async (_request: CreateDeviceRequest): Promise<CreateDeviceResponse> => {
        throw new Error('Not implemented in mock');
      },
      retrieve: async (_id: string) => {
        throw new Error('Not implemented in mock');
      },
      list: async (_options?: DeviceListOptions) =>
        mockDevices.map((d) => ({ ...d, lines: mockDeviceLines.get(d.id) ?? d.lines ?? [] })),
      update: async (id: string, request: UpdateDeviceRequest) => {
        const idx = mockDevices.findIndex((d) => d.id === id);
        if (idx !== -1) {
          const updated = {
            ...mockDevices[idx],
            ...request,
            updated_at: new Date().toISOString(),
          } as Device;
          mockDevices[idx] = updated;
          return updated;
        }
        return {
          id,
          type: 'deskphone' as const,
          mac_address: '00:00:00:00:00:00',
          vendor: 'snom',
          model: 'mock',
          status: 'pending-sync' as const,
          registration_status: 'not_registered' as const,
          last_registered_at: null,
          last_call_at: null,
          lines: [],
          ...request,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as Device;
      },
      listButtons: async (id: string) => ({
        object: 'list' as const,
        url: `/v1/devices/${id}/buttons`,
        next_page_url: null,
        previous_page_url: null,
        data: [],
      }),
      listCompatibleButtonTemplates: async (id: string) => ({
        object: 'list' as const,
        url: `/v1/devices/${id}/compatible_button_templates`,
        next_page_url: null,
        previous_page_url: null,
        data: [],
      }),
      listButtonOverrides: async (id: string) => ({
        object: 'list' as const,
        url: `/v1/devices/${id}/button_overrides`,
        next_page_url: null,
        previous_page_url: null,
        data: [],
      }),
      createButtonOverride: async (_id: string, _request: CreateDeviceButtonOverrideRequest) => {
        throw new Error('Not implemented in mock');
      },
      deleteButtonOverride: async (_id: string, _overrideId: string): Promise<void> => {},
    },

    buttonTemplates: {
      create: async (_request: CreateButtonTemplateRequest) => {
        throw new Error('Not implemented in mock');
      },
      retrieve: async (_templateId: string) => {
        throw new Error('Not implemented in mock');
      },
      list: async () => ({
        object: 'list' as const,
        url: '/v1/button_templates',
        next_page_url: null,
        previous_page_url: null,
        data: [],
      }),
      update: async (_templateId: string, _request: UpdateButtonTemplateRequest) => {
        throw new Error('Not implemented in mock');
      },
      del: async (_templateId: string): Promise<void> => {},
      buttons: {
        list: async (templateId: string) => ({
          object: 'list' as const,
          url: `/v1/button_templates/${templateId}/buttons`,
          next_page_url: null,
          previous_page_url: null,
          data: [],
        }),
        create: async (_templateId: string, _request: CreateTemplateButtonRequest) => {
          throw new Error('Not implemented in mock');
        },
        update: async (
          _templateId: string,
          _buttonId: string,
          _request: UpdateTemplateButtonRequest
        ) => {
          throw new Error('Not implemented in mock');
        },
        del: async (_templateId: string, _buttonId: string): Promise<void> => {},
      },
    },

    dectBases: {
      create: async (_data: CreateDECTBaseRequest) => {
        throw new Error('Not implemented in mock');
      },
      retrieve: async (_id: string) => {
        throw new Error('Not implemented in mock');
      },
      list: async () =>
        empty
          ? []
          : [
              {
                id: 'dectb_mock001',
                mac_address: '00:04:13:D0:00:01',
                vendor: 'snom',
                model: 'M500',
                status: 'provisioned' as const,
                multicell_role: 'single' as const,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ],
      update: async (_id: string, _data: UpdateDECTBaseRequest) => {
        throw new Error('Not implemented in mock');
      },
      del: async (_id: string) => {},
      handsets: {
        create: async (_baseId: string, _data: CreateDECTHandsetRequest) => {
          throw new Error('Not implemented in mock');
        },
        retrieve: async (_baseId: string, _handsetId: string) => {
          throw new Error('Not implemented in mock');
        },
        list: async (baseId: string) => {
          if (empty) return [];
          const handsets = [
            {
              id: 'decth_mock001',
              base_id: baseId,
              ipei: '00000000001',
              status: 'registered' as const,
              display_name: 'Snom E425',
              slot_number: 1,
              model: 'E425',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              extensions: undefined as DECTExtension[] | undefined,
            },
            {
              id: 'decth_mock002',
              base_id: baseId,
              ipei: '00000000002',
              status: 'registered' as const,
              display_name: 'Snom E425',
              slot_number: 2,
              model: 'E425',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              extensions: undefined as DECTExtension[] | undefined,
            },
          ];
          for (const hs of handsets) {
            const exts = mockDECTExts.get(`${baseId}/${hs.id}`);
            if (exts?.length) hs.extensions = exts;
          }
          return handsets;
        },
        update: async (_baseId: string, _handsetId: string, _data: UpdateDECTHandsetRequest) => {
          throw new Error('Not implemented in mock');
        },
        del: async (_baseId: string, _handsetId: string) => {},
      },
      extensions: {
        create: async (
          baseId: string,
          handsetId: string,
          data: CreateDECTExtensionRequest
        ): Promise<DECTExtension> => {
          await delay();
          const ext: DECTExtension = {
            id: 'decte_' + Math.random().toString(36).slice(2, 10),
            handset_id: handsetId,
            endpoint_id: data.endpoint_id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const key = `${baseId}/${handsetId}`;
          const existing = mockDECTExts.get(key) ?? [];
          mockDECTExts.set(key, [...existing, ext]);
          return ext;
        },
        list: async (baseId: string, handsetId: string) =>
          mockDECTExts.get(`${baseId}/${handsetId}`) ?? [],
        del: async (baseId: string, handsetId: string, extensionId: string) => {
          const key = `${baseId}/${handsetId}`;
          const exts = mockDECTExts.get(key) ?? [];
          mockDECTExts.set(
            key,
            exts.filter((e) => e.id !== extensionId)
          );
        },
      },
    },

    account: {
      retrieve: async (): Promise<Account> => {
        await delay();
        return { ...mockAccount, config: { ...mockAccount.config } };
      },
      update: async (request) => {
        await delay();
        if (request.name !== undefined) mockAccount.name = request.name;
        if (request.email !== undefined) mockAccount.email = request.email;
        if (request.phone !== undefined) mockAccount.phone = request.phone;
        if (request.primary_contact_name !== undefined)
          mockAccount.primary_contact_name = request.primary_contact_name;
        if (request.config !== undefined) {
          mockAccount.config = {
            ...mockAccount.config,
            ...request.config,
          };
        }
        mockAccount.updated_at = new Date().toISOString();
        return { ...mockAccount, config: { ...mockAccount.config } };
      },
    },

    users: {
      create: async (request: CreateUserRequest): Promise<OnboardingUser> => {
        await delay();
        const user: OnboardingUser = {
          id: 'usr_' + Math.random().toString(36).slice(2, 10),
          name: request.name ?? null,
          email: request.email ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        mockUsersList.push(user);
        return user;
      },
      list: async (): Promise<OnboardingUser[]> => {
        await delay();
        return [...mockUsersList];
      },
      del: async (userId: string) => {
        await delay();
        const idx = mockUsersList.findIndex((u) => u.id === userId);
        if (idx !== -1) mockUsersList.splice(idx, 1);
      },
      endpoints: {
        create: async (
          userId: string,
          _request?: CreateEndpointRequest
        ): Promise<OnboardingEndpoint> => {
          await delay();
          const ep: OnboardingEndpoint = {
            id: 'ep_' + Math.random().toString(36).slice(2, 10),
            user_id: userId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const existing = mockEndpoints.get(userId) ?? [];
          mockEndpoints.set(userId, [...existing, ep]);
          return ep;
        },
        list: async (userId: string): Promise<OnboardingEndpoint[]> =>
          mockEndpoints.get(userId) ?? [],
        update: async (
          userId: string,
          endpointId: string,
          request: UpdateEndpointRequest
        ): Promise<OnboardingEndpoint> => {
          await delay();
          const existing = mockEndpoints.get(userId) ?? [];
          const idx = existing.findIndex((e) => e.id === endpointId);
          if (idx === -1) {
            throw new Error(`endpoint not found: ${endpointId}`);
          }
          const updated: OnboardingEndpoint = {
            ...existing[idx],
            ...(request.name !== undefined ? { name: request.name } : {}),
            updated_at: new Date().toISOString(),
          };
          const next = [...existing];
          next[idx] = updated;
          mockEndpoints.set(userId, next);
          return updated;
        },
      },
    },

    locations: {
      create: async (request: CreateLocationRequest): Promise<OnboardingLocation> => {
        await delay();
        const loc: OnboardingLocation = {
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
        mockLocations.push(loc);
        return loc;
      },
      retrieve: async (_locationId: string) => {
        throw new Error('Not implemented in mock');
      },
      list: async (): Promise<OnboardingLocation[]> => {
        await delay();
        return [...mockLocations];
      },
      update: async (
        locationId: string,
        request: UpdateLocationRequest
      ): Promise<OnboardingLocation> => {
        await delay();
        const idx = mockLocations.findIndex((l) => l.id === locationId);
        if (idx === -1) throw new Error('Location not found');
        const existing = mockLocations[idx]!;
        const updated: OnboardingLocation = {
          ...existing,
          ...(request.name !== undefined && { name: request.name }),
          ...(request.address !== undefined && {
            address: { ...existing.address, ...request.address },
          }),
          ...(request.primary_did_id !== undefined && { primary_did_id: request.primary_did_id }),
          updated_at: new Date().toISOString(),
        };
        mockLocations[idx] = updated;
        return updated;
      },
      validateE911: async (_locationId: string) => {
        await delay();
        return { valid: true };
      },
      provisionE911: async (locationId: string) => {
        await delay();
        const idx = mockLocations.findIndex((l) => l.id === locationId);
        if (idx >= 0) {
          mockLocations[idx] = {
            ...mockLocations[idx]!,
            e911_status: 'provisioned',
            updated_at: new Date().toISOString(),
          };
          return mockLocations[idx]!;
        }
        return {
          id: locationId,
          name: 'Main Office',
          status: 'active',
          e911_status: 'provisioned',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: new Date().toISOString(),
        } as OnboardingLocation;
      },
    },

    addresses: {
      suggest: async (_query: string) => {
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
    },

    fetchAllPages: async <T>(
      fetcher: (opts: { limit: number }) => Promise<{ data: T[] }>
    ): Promise<T[]> => {
      const result = await fetcher({ limit: 100 });
      return result.data;
    },

    // Routing target resolution
    resolveRoutingTarget: async (target: string) => ({
      id: target,
      name: target.startsWith('rg_') ? 'Main Ring Group' : 'Alice Smith',
      type: (target.startsWith('rg_') ? 'ring_group' : 'user') as 'ring_group' | 'user',
      extension_number: '1001',
    }),
  };

  return instance;
}
