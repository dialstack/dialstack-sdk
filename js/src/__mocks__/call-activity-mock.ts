/**
 * Mock data for the call activity components' stories and tests. Times are relative to
 * Date.now(), which visual regression runs freeze.
 */

import type { CallLog, CallSummary, CallSummaryCount, RemoteNumber } from '../types/components';
import type { DialStackInstanceImpl } from '../types/core';
import type { Device } from '../types/device';
import type { QualitySummary, VoicemailItem } from '../types/call-activity';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function page<T>(data: T[]) {
  return { object: 'list' as const, url: '', next_page_url: null, previous_page_url: null, data };
}

interface Caller {
  number: string;
  name: string | null;
  tries: Array<{ ago: number; status: CallLog['status']; connected?: boolean }>;
  callBacks?: number[];
}

const CALLERS: Caller[] = [
  {
    number: '+14155550101',
    name: 'Priya Natarajan',
    tries: [
      { ago: 3 * DAY, status: 'no-answer' },
      { ago: 3 * DAY - 20 * MIN, status: 'busy' },
      { ago: 2 * DAY, status: 'voicemail' },
      { ago: 26 * HOUR, status: 'completed', connected: false },
      { ago: 5 * HOUR, status: 'no-answer' },
    ],
    callBacks: [2 * DAY - 3 * HOUR],
  },
  {
    number: '+14155550102',
    name: 'Marco Ruiz',
    tries: [
      { ago: 30 * HOUR, status: 'voicemail' },
      { ago: 3 * HOUR, status: 'no-answer' },
    ],
  },
  {
    number: '+14155550103',
    name: null,
    tries: [{ ago: 2 * HOUR, status: 'completed', connected: false }],
  },
  {
    number: '+14155550104',
    name: 'Dana Whitfield',
    tries: [{ ago: 40 * MIN, status: 'failed' }],
    callBacks: [20 * MIN],
  },
];

function callerCalls(): CallLog[] {
  const calls: CallLog[] = [];
  let n = 0;
  for (const c of CALLERS) {
    for (const t of c.tries) {
      calls.push({
        id: `call_home${++n}`,
        direction: 'inbound',
        from_number: c.number,
        to_number: '+14155559000',
        started_at: ago(t.ago),
        connected_at: t.connected ? ago(t.ago) : null,
        status: t.status,
        remote_number: c.number,
      } as unknown as CallLog);
    }
    for (const b of c.callBacks ?? []) {
      calls.push({
        id: `call_home${++n}`,
        direction: 'outbound',
        from_number: '+14155559000',
        to_number: c.number,
        started_at: ago(b),
        connected_at: null,
        status: 'no-answer',
        remote_number: c.number,
      } as unknown as CallLog);
    }
  }
  return calls;
}

function remoteNumbers(): RemoteNumber[] {
  return CALLERS.map((c) => {
    const inbound = c.tries.map((t) => t.ago);
    return {
      object: 'remote_number',
      phone_number: c.number,
      name: c.name,
      last_call: 'call_home1',
      last_call_at: ago(Math.min(...inbound, ...(c.callBacks ?? []))),
      last_connected_at: null,
      unconnected_inbound: {
        count: c.tries.length,
        first_at: ago(Math.max(...inbound)),
        last_at: ago(Math.min(...inbound)),
        voicemail_count: c.tries.filter((t) => t.status === 'voicemail').length,
      },
      unconnected_outbound: {
        count: c.callBacks?.length ?? 0,
        last_at: c.callBacks?.length ? ago(Math.min(...c.callBacks)) : null,
      },
    };
  });
}

const BREAKDOWN: CallSummaryCount[] = [
  { direction: 'inbound', status: 'completed', connected: true, count: 64 },
  { direction: 'inbound', status: 'no-answer', connected: false, count: 9 },
  { direction: 'inbound', status: 'completed', connected: false, count: 4 },
  { direction: 'inbound', status: 'voicemail', connected: false, count: 5 },
  { direction: 'inbound', status: 'busy', connected: false, count: 1 },
  { direction: 'inbound', status: 'failed', connected: false, count: 1 },
  { direction: 'outbound', status: 'completed', connected: true, count: 31 },
  { direction: 'outbound', status: 'no-answer', connected: false, count: 6 },
  { direction: 'internal', status: 'completed', connected: true, count: 12 },
];

function summary(scale: number, buckets: boolean): CallSummary {
  const breakdown = BREAKDOWN.map((r) => ({ ...r, count: Math.round(r.count * scale) })).filter(
    (r) => r.count > 0
  );
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const hours = Math.max(new Date().getHours() + 1, 2);
  const shape = [0, 0, 0, 0, 0, 0, 0, 1, 4, 9, 12, 10, 7, 9, 11, 8, 6, 3, 1, 0, 0, 0, 0, 0];
  return {
    object: 'call_summary',
    total_calls: breakdown.reduce((s, r) => s + r.count, 0),
    breakdown,
    sentiment: {
      overall: [],
      local: [],
      remote: [
        { direction: 'inbound', sentiment: 'positive', count: Math.round(30 * scale) },
        { direction: 'inbound', sentiment: 'neutral', count: Math.round(20 * scale) },
        { direction: 'inbound', sentiment: 'negative', count: Math.round(7 * scale) },
      ],
    },
    ...(buckets
      ? {
          time_series: Array.from({ length: hours }, (_, h) => {
            const inbound = shape[h % 24] ?? 0;
            return {
              bucket: new Date(start.getTime() + h * HOUR).toISOString(),
              breakdown: [
                {
                  direction: 'inbound' as const,
                  status: 'completed' as const,
                  connected: true,
                  count: inbound,
                },
                ...(inbound > 6
                  ? [
                      {
                        direction: 'inbound' as const,
                        status: 'no-answer' as const,
                        connected: false,
                        count: 2,
                      },
                      {
                        direction: 'inbound' as const,
                        status: 'voicemail' as const,
                        connected: false,
                        count: 1,
                      },
                    ]
                  : []),
                ...(inbound > 10
                  ? [
                      {
                        direction: 'inbound' as const,
                        status: 'completed' as const,
                        connected: false,
                        count: 1,
                      },
                    ]
                  : []),
              ],
            };
          }),
        }
      : {}),
  };
}

const QUALITY: QualitySummary = {
  kpi: { avg_mos: 4.2, avg_jitter_ms: 8, avg_packet_loss_pct: 0.2, total_calls: 104 },
  time_series: [{ bucket: ago(HOUR), good_count: 96, fair_count: 6, poor_count: 2 }],
};

function voicemails(): VoicemailItem[] {
  return [
    {
      id: 'vm_home1',
      owner: 'user_home1',
      from_number: '+14155550102',
      from_name: 'Marco Ruiz',
      duration_seconds: 42,
      audio_url: 'about:blank',
      is_read: false,
      created_at: ago(30 * HOUR),
      summary: 'Asking whether the replacement part shipped and when it will arrive.',
    },
    {
      id: 'vm_home2',
      owner: 'svm_home1',
      from_number: '+14155550101',
      from_name: 'Priya Natarajan',
      duration_seconds: 18,
      audio_url: 'about:blank',
      is_read: false,
      created_at: ago(2 * DAY),
      summary: 'Needs to reschedule Thursday’s appointment.',
    },
    {
      id: 'vm_home3',
      owner: 'user_home2',
      from_number: '+14155550199',
      from_name: null,
      duration_seconds: 7,
      audio_url: 'about:blank',
      is_read: false,
      created_at: ago(45 * MIN),
      summary: null,
    },
  ];
}

function offlineDevices(): Device[] {
  const base = {
    vendor: 'snom',
    status: 'synced',
    registration_status: 'not_registered',
    last_registered_at: null,
    last_call_at: null,
    lines: [],
    created_at: ago(90 * DAY),
    updated_at: ago(DAY),
  };
  return [
    {
      ...base,
      id: 'dev_home1',
      type: 'deskphone',
      mac_address: '00:04:13:aa:00:01',
      model: 'D785',
      name: null,
      offline_since: ago(3 * DAY + 2 * HOUR),
      assignments: [{ user: 'user_home1', user_id: 'user_home1', line_number: 1 }],
    },
    {
      ...base,
      id: 'dectb_home1',
      type: 'dect_base',
      mac_address: '00:04:13:aa:00:02',
      model: 'M500',
      name: 'Warehouse base',
      offline_since: ago(50 * MIN),
    },
    {
      ...base,
      id: 'dev_home2',
      type: 'deskphone',
      mac_address: '00:04:13:aa:00:03',
      model: 'D735',
      name: 'Reception',
      offline_since: null,
      assignments: [{ user: 'user_home2', user_id: 'user_home2', line_number: 1 }],
    },
    // Not shown: nobody uses it.
    {
      ...base,
      id: 'dev_home3',
      type: 'deskphone',
      mac_address: '00:04:13:aa:00:04',
      model: 'D717',
      offline_since: ago(DAY),
    },
  ] as unknown as Device[];
}

/** Gives a mock instance the reads the call activity components make. */
export function withCallActivityData(instance: DialStackInstanceImpl, empty = false): void {
  const i = instance as unknown as Record<string, Record<string, unknown>>;
  // Built now, before any component reads its clock.
  const calls = callerCalls();
  const numbers = remoteNumbers();
  const messages = voicemails();
  const devices = offlineDevices();
  const read = new Set<string>();
  Object.assign(i.calls, {
    summary: async (p: { from_date: string; granularity?: string }) =>
      empty
        ? summary(0, !!p.granularity)
        : summary(Date.parse(p.from_date) < Date.now() - 6 * DAY ? 1.1 : 1, !!p.granularity),
    list: async (p: { direction?: string; from_number?: string[]; to_number?: string[] }) => {
      if (empty) return page([]);
      const numbers = new Set(p.from_number ?? p.to_number ?? []);
      return page(
        calls.filter(
          (c) => c.direction === p.direction && numbers.has(c.remote_number as unknown as string)
        )
      );
    },
  });
  i.remoteNumbers = { list: async () => page(empty ? [] : numbers) };
  // <Voicemails> reads its list through fetchApi: serve it the same messages.
  const unreadPage = () => page(empty ? [] : messages.filter((vm) => !read.has(vm.id)));
  const fetchApi = (i as unknown as { fetchApi: (path: string) => Promise<unknown> }).fetchApi;
  (i as unknown as { fetchApi: (path: string) => Promise<unknown> }).fetchApi = async (
    path: string
  ) =>
    path.startsWith('/v1/voicemails?')
      ? {
          ok: true,
          status: 200,
          json: async () => unreadPage(),
          text: async () => '',
        }
      : fetchApi(path);
  Object.assign(i.voicemails, {
    list: async () => unreadPage(),
    summary: async () => ({
      object: 'voicemail_summary',
      total: empty ? 0 : messages.length - read.size,
      breakdown: [],
    }),
    markAsRead: async (id: string) => void read.add(id),
    markAsUnread: async (id: string) => void read.delete(id),
  });
  i.quality = { summary: async () => (empty ? { kpi: QUALITY.kpi, time_series: [] } : QUALITY) };
  Object.assign(i.devices, { list: async () => (empty ? [] : devices) });
  Object.assign(i.users, {
    list: async () => [
      { id: 'user_home1', name: 'Alice Smith', extensions: { data: [{ number: '101' }] } },
      { id: 'user_home2', name: 'Bob Jones', extensions: { data: [{ number: '102' }] } },
    ],
  });
  i.sharedVoicemailBoxes = {
    list: async () => [{ id: 'svm_home1', name: 'Front Desk', extension_number: '200' }],
  };
}
