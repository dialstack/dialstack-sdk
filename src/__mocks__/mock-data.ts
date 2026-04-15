import type { AvailablePhoneNumber, PaginatedResponse, DIDItem, CallLog } from '../types';

/**
 * Voicemail data structure (mirrors the component-internal Voicemail interface).
 * TODO: Export Voicemail type from SDK types so mock data stays in sync automatically.
 */
interface Voicemail {
  id: string;
  from_name: string;
  from_number: string;
  created_at: string;
  duration_seconds: number;
  is_read: boolean;
  audio_url: string;
  format?: string;
  transcription?: string;
  summary?: string;
}

// Call Logs / Call History — returned by fetchApi('/v1/calls?...')
export const MOCK_CALLS: PaginatedResponse<CallLog> = {
  object: 'list',
  url: '/v1/calls',
  data: [
    {
      id: 'cdr_01abc',
      direction: 'inbound',
      from_number: '+15551234567',
      to_number: '+15559876543',
      status: 'completed',
      duration_seconds: 125,
      started_at: '2026-02-24T14:30:00Z',
      answered_at: '2026-02-24T14:30:05Z',
      ended_at: '2026-02-24T14:32:10Z',
    },
    {
      id: 'cdr_02def',
      direction: 'outbound',
      from_number: '+15559876543',
      to_number: '+15551112222',
      status: 'completed',
      duration_seconds: 45,
      started_at: '2026-02-24T13:00:00Z',
      answered_at: '2026-02-24T13:00:03Z',
      ended_at: '2026-02-24T13:00:48Z',
    },
    {
      id: 'cdr_03ghi',
      direction: 'inbound',
      from_number: '+15553334444',
      to_number: '+15559876543',
      status: 'no-answer',
      duration_seconds: 0,
      started_at: '2026-02-24T10:15:00Z',
      ended_at: '2026-02-24T10:15:30Z',
    },
    {
      id: 'cdr_04jkl',
      direction: 'inbound',
      from_number: '+15557778888',
      to_number: '+15559876543',
      status: 'voicemail',
      duration_seconds: 18,
      started_at: '2026-02-23T16:45:00Z',
      ended_at: '2026-02-23T16:45:18Z',
    },
    {
      id: 'cdr_05mno',
      direction: 'outbound',
      from_number: '+15559876543',
      to_number: '+15552223333',
      status: 'completed',
      duration_seconds: 312,
      started_at: '2026-02-23T11:20:00Z',
      answered_at: '2026-02-23T11:20:08Z',
      ended_at: '2026-02-23T11:25:20Z',
    },
  ],
  next_page_url: null,
  previous_page_url: null,
};

// Voicemails — returned by fetchApi('/v1/voicemails?...')
export const MOCK_VOICEMAILS: PaginatedResponse<Voicemail> = {
  object: 'list',
  url: '/v1/voicemails',
  data: [
    {
      id: 'vm_01abc',
      from_name: 'Unknown Caller',
      from_number: '+15551234567',
      duration_seconds: 15,
      is_read: false,
      audio_url:
        'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
      created_at: '2026-02-24T14:30:00Z',
    },
    {
      id: 'vm_02def',
      from_name: 'Unknown Caller',
      from_number: '+15553334444',
      duration_seconds: 32,
      is_read: true,
      audio_url:
        'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
      created_at: '2026-02-23T09:00:00Z',
    },
    {
      id: 'vm_03ghi',
      from_name: 'Unknown Caller',
      from_number: '+15557778888',
      duration_seconds: 8,
      is_read: false,
      audio_url:
        'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
      created_at: '2026-02-22T17:15:00Z',
    },
  ],
  next_page_url: null,
  previous_page_url: null,
};

// Phone numbers (DIDs)
export const MOCK_PHONE_NUMBERS: PaginatedResponse<DIDItem> = {
  object: 'list',
  url: '/v1/phone-numbers',
  data: [
    {
      id: 'did_01abc',
      phone_number: '+15559876543',
      status: 'active',
      outbound_enabled: true,
      routing_target: 'rg_01abc',
      created_at: '2026-01-15T10:00:00Z',
      updated_at: '2026-01-15T10:00:00Z',
    },
    {
      id: 'did_02def',
      phone_number: '+15551112222',
      status: 'active',
      outbound_enabled: true,
      routing_target: 'user_01abc',
      created_at: '2026-01-20T10:00:00Z',
      updated_at: '2026-01-20T10:00:00Z',
    },
  ],
  next_page_url: null,
  previous_page_url: null,
};

// Available numbers for phone number ordering
export const MOCK_AVAILABLE_NUMBERS: AvailablePhoneNumber[] = [
  {
    phone_number: '+12125551001',
    city: 'New York',
    state: 'NY',
    rate_center: 'NWYRCYZN01',
    lata: '132',
  },
  {
    phone_number: '+12125551002',
    city: 'New York',
    state: 'NY',
    rate_center: 'NWYRCYZN01',
    lata: '132',
  },
  {
    phone_number: '+12125551003',
    city: 'Brooklyn',
    state: 'NY',
    rate_center: 'BRKLYN',
    lata: '132',
  },
  {
    phone_number: '+14155550101',
    city: 'San Francisco',
    state: 'CA',
    rate_center: 'SNFCCA01',
    lata: '722',
  },
  {
    phone_number: '+13105550201',
    city: 'Los Angeles',
    state: 'CA',
    rate_center: 'LSAN DA01',
    lata: '730',
  },
  {
    phone_number: '+17735550301',
    city: 'Chicago',
    state: 'IL',
    rate_center: 'CHCGIL01',
    lata: '358',
  },
];

// Empty paginated response
export const MOCK_EMPTY_RESPONSE: PaginatedResponse<never> = {
  object: 'list',
  url: '',
  data: [],
  next_page_url: null,
  previous_page_url: null,
};
