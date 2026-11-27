import '../call-logs';
import type { DialStackInstanceImpl } from '../../types/core';
import type { CallBlockedReason, CallLog, PaginatedResponse } from '../../types';

const flush = async () => {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

const aCall = (id: string, blockedReason: CallBlockedReason | null): CallLog =>
  ({
    id,
    direction: 'inbound',
    from_number: '+14155550100',
    from_label: null,
    to_number: null,
    to_label: null,
    started_at: '2026-10-20T15:00:00Z',
    duration_seconds: null,
    status: blockedReason ? 'blocked' : 'failed',
    hangup_cause: 21,
    blocked_reason: blockedReason,
    quality_metrics: [],
  }) as unknown as CallLog;

async function statusCells(calls: CallLog[]): Promise<string[]> {
  const response: PaginatedResponse<CallLog> = {
    object: 'list',
    url: '/v1/calls',
    next_page_url: null,
    previous_page_url: null,
    data: calls,
  };
  const instance = {
    getAppearance: () => undefined,
    calls: { list: jest.fn(async () => response) },
    fetchApi: jest.fn(),
  } as unknown as DialStackInstanceImpl;
  const el = document.createElement('dialstack-call-logs') as HTMLElement & {
    setInstance: (i: DialStackInstanceImpl) => void;
    shadowRoot: ShadowRoot;
  };
  el.setInstance(instance);
  document.body.appendChild(el);
  await flush();
  return Array.from(el.shadowRoot.querySelectorAll('td[part~="cell-status"]')).map(
    (td) => td.textContent?.trim() ?? ''
  );
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CallLogs status of a refused call', () => {
  it('reads Blocked rather than Failed, whatever refused it', async () => {
    expect(
      await statusCells([
        aCall('a', 'minute_cap'),
        aCall('b', 'invalid_caller_id'),
        aCall('c', 'blocklist'),
        aCall('d', null),
      ])
    ).toEqual(['Blocked', 'Blocked', 'Blocked', 'Failed']);
  });

  it('reads Blocked for a reason it does not know yet', async () => {
    expect(await statusCells([aCall('a', 'some_future_reason' as CallBlockedReason)])).toEqual([
      'Blocked',
    ]);
  });
});
