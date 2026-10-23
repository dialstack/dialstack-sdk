import '../call-logs';
import type { DialStackInstanceImpl } from '../../types/core';
import type { CallListParams, CallLog, CallLogFilters, PaginatedResponse } from '../../types';

const flush = async () => {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

const page = (calls: CallLog[], next: string | null = null): PaginatedResponse<CallLog> => ({
  object: 'list',
  url: '/v1/calls',
  next_page_url: next,
  previous_page_url: null,
  data: calls,
});

const aCall = (id: string): CallLog =>
  ({
    id,
    direction: 'inbound',
    from_number: '+14155550100',
    from_label: null,
    to_number: '1001',
    to_label: null,
    started_at: '2026-10-20T15:00:00Z',
    duration_seconds: 30,
    status: 'completed',
  }) as unknown as CallLog;

type CallLogsEl = HTMLElement & {
  setInstance: (i: DialStackInstanceImpl) => void;
  setDisplayOptions: (o: { showFilters?: boolean }) => void;
  setDateRange: (r: { start?: string; end?: string }) => void;
  setFilters: (f: CallLogFilters) => void;
  setOnFiltersChange: (cb: (f: CallLogFilters) => void) => void;
  shadowRoot: ShadowRoot;
};

function setup(responses: Array<PaginatedResponse<CallLog>> = []) {
  const list = jest.fn(async (_params?: CallListParams) => responses.shift() ?? page([]));
  const instance = {
    getAppearance: () => undefined,
    calls: { list },
    fetchApi: jest.fn(),
  } as unknown as DialStackInstanceImpl;
  const el = document.createElement('dialstack-call-logs') as CallLogsEl;
  el.setInstance(instance);
  return { el, list };
}

const lastParams = (list: jest.Mock) => list.mock.calls[list.mock.calls.length - 1][0];

const daysAgo = (iso: string) => (Date.now() - Date.parse(iso)) / (24 * 60 * 60 * 1000);

function select(el: CallLogsEl, id: string, value: string) {
  const s = el.shadowRoot.getElementById(id) as HTMLSelectElement;
  s.value = value;
  s.dispatchEvent(new Event('change'));
}

afterEach(() => {
  document.body.innerHTML = '';
  jest.useRealTimers();
});

describe('CallLogsComponent filters', () => {
  it('defaults to the last 30 days through the typed list method', async () => {
    const { el, list } = setup([page([aCall('call_1')])]);
    document.body.appendChild(el);
    await flush();

    const params = lastParams(list);
    expect(params.expand).toEqual(['did']);
    expect(daysAgo(params.from_date)).toBeCloseTo(30, 1);
    expect(params.search).toBeUndefined();
    expect(el.shadowRoot.getElementById('filter-date')).toHaveProperty('value', '30d');
  });

  it('covers all history when the toolbar is hidden, since nothing could widen it', async () => {
    const { el, list } = setup();
    el.setDisplayOptions({ showFilters: false });
    document.body.appendChild(el);
    await flush();

    expect(lastParams(list).from_date).toBeUndefined();
    expect(el.shadowRoot.querySelector('[part="toolbar"]')).toBeNull();
  });

  it('widens to all history when the toolbar is hidden after connecting', async () => {
    const { el, list } = setup();
    document.body.appendChild(el);
    await flush();
    expect(daysAgo(lastParams(list).from_date)).toBeCloseTo(30, 1);

    el.setDisplayOptions({ showFilters: false });
    await flush();
    expect(lastParams(list).from_date).toBeUndefined();
  });

  it('drops a pending search when removed, so the host is not told after it left', async () => {
    jest.useFakeTimers();
    const { el, list } = setup();
    const onChange = jest.fn();
    el.setOnFiltersChange(onChange);
    document.body.appendChild(el);
    await jest.runAllTimersAsync();
    list.mockClear();

    const input = el.shadowRoot.getElementById('ds-call-logs-search') as HTMLInputElement;
    input.value = 'dana';
    input.dispatchEvent(new Event('input'));
    el.remove();
    await jest.runAllTimersAsync();

    expect(onChange).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('returns to the host range on Clear filters, and treats it as the baseline', async () => {
    const { el, list } = setup();
    el.setDateRange({ start: '2026-01-01T00:00:00Z' });
    document.body.appendChild(el);
    await flush();
    // The host's own range is not a filter Clear could undo.
    expect(el.shadowRoot.getElementById('clear-filters-btn')).toBeNull();

    select(el, 'filter-date', '7d');
    await flush();
    (el.shadowRoot.getElementById('clear-filters-btn') as HTMLButtonElement).click();
    await flush();

    expect(lastParams(list).from_date).toBe('2026-01-01T00:00:00Z');
    expect(el.shadowRoot.getElementById('filter-date')).toHaveProperty('value', 'custom');
  });

  it('pages through the typed list method with the token from next_page_url', async () => {
    const { el, list } = setup([
      page([aCall('call_1')], '/v1/calls?page=tok_next&search=dana&expand%5B%5D=did'),
      page([aCall('call_2')]),
    ]);
    el.setFilters({ search: 'dana' });
    document.body.appendChild(el);
    await flush();

    (el.shadowRoot.getElementById('next-btn') as HTMLButtonElement).click();
    await flush();

    expect(lastParams(list)).toMatchObject({ page: 'tok_next', search: 'dana', expand: ['did'] });
    expect(el.shadowRoot.querySelector('tr[data-call-id="call_2"]')).not.toBeNull();
  });

  it('reloads when reattached after being removed mid-load', async () => {
    const { el, list } = setup();
    list.mockImplementationOnce(() => new Promise(() => {}));
    document.body.appendChild(el);
    await flush();
    el.remove();

    list.mockImplementationOnce(async () => page([aCall('call_1')]));
    document.body.appendChild(el);
    await flush();

    expect(list).toHaveBeenCalledTimes(2);
    expect(el.shadowRoot.querySelector('[part="loading"]')).toBeNull();
    expect(el.shadowRoot.querySelector('tr[data-call-id="call_1"]')).not.toBeNull();
  });

  it('keeps a picked preset when the host re-sends the same range', async () => {
    const { el, list } = setup();
    el.setDateRange({ start: '2026-01-01T00:00:00Z' });
    document.body.appendChild(el);
    await flush();
    select(el, 'filter-date', '7d');
    await flush();
    list.mockClear();

    el.setDateRange({ start: '2026-01-01T00:00:00Z' });
    await flush();
    expect(list).not.toHaveBeenCalled();
    expect(el.shadowRoot.getElementById('filter-date')).toHaveProperty('value', '7d');
  });

  it('debounces search and reports the change to the host', async () => {
    jest.useFakeTimers();
    const { el, list } = setup();
    const onChange = jest.fn();
    el.setOnFiltersChange(onChange);
    document.body.appendChild(el);
    await jest.runAllTimersAsync();
    list.mockClear();

    const input = el.shadowRoot.getElementById('ds-call-logs-search') as HTMLInputElement;
    for (const value of ['s', 'sm', 'smith ']) {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      jest.advanceTimersByTime(100);
    }
    expect(list).not.toHaveBeenCalled();

    await jest.runAllTimersAsync();
    expect(list).toHaveBeenCalledTimes(1);
    expect(lastParams(list).search).toBe('smith');
    expect(onChange).toHaveBeenLastCalledWith({ search: 'smith' });
  });

  it('sends direction, status and date preset, restarting from the first page', async () => {
    const { el, list } = setup([page([aCall('call_1')], '/v1/calls?page=tok_next')]);
    document.body.appendChild(el);
    await flush();

    select(el, 'filter-direction', 'outbound');
    await flush();
    select(el, 'filter-status', 'no-answer');
    await flush();
    select(el, 'filter-date', 'all');
    await flush();

    const params = lastParams(list);
    expect(params).toMatchObject({ direction: 'outbound', status: 'no-answer' });
    expect(params.from_date).toBeUndefined();
    expect(list.mock.calls.every(([p]) => !p?.page)).toBe(true);
  });

  it('clears an empty filtered result back to the default view', async () => {
    const { el, list } = setup();
    const onChange = jest.fn();
    el.setOnFiltersChange(onChange);
    document.body.appendChild(el);
    await flush();
    el.setFilters({ search: 'nobody', datePreset: 'all' });
    await flush();

    expect(el.shadowRoot.textContent).toContain('No calls match these filters');
    (el.shadowRoot.getElementById('clear-filters-btn') as HTMLButtonElement).click();
    await flush();

    expect(lastParams(list).search).toBeUndefined();
    expect(daysAgo(lastParams(list).from_date)).toBeCloseTo(30, 1);
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  // Older calls may exist, so an empty default window must not claim there are
  // none; Clear filters would change nothing, so it is not offered.
  it('names the date range when the default window alone is empty', async () => {
    const { el } = setup();
    document.body.appendChild(el);
    await flush();

    expect(el.shadowRoot.textContent).toContain('No calls in this date range');
    expect(el.shadowRoot.getElementById('clear-filters-btn')).toBeNull();
  });

  it('says there are no calls only when all time is empty', async () => {
    const { el } = setup();
    document.body.appendChild(el);
    await flush();
    select(el, 'filter-date', 'all');
    await flush();

    expect(el.shadowRoot.textContent).toContain('No call logs found');
  });

  it('shows a host-set range as custom until a preset replaces it', async () => {
    const { el, list } = setup();
    document.body.appendChild(el);
    await flush();
    el.setDateRange({ start: '2026-01-01T00:00:00Z', end: '2026-02-01T00:00:00Z' });
    await flush();

    expect(lastParams(list)).toMatchObject({
      from_date: '2026-01-01T00:00:00Z',
      to_date: '2026-02-01T00:00:00Z',
    });
    expect(el.shadowRoot.getElementById('filter-date')).toHaveProperty('value', 'custom');

    select(el, 'filter-date', '7d');
    await flush();
    expect(lastParams(list).to_date).toBeUndefined();
    expect(daysAgo(lastParams(list).from_date)).toBeCloseTo(7, 1);
  });

  it('ignores a stale response that lands after a newer one', async () => {
    let resolveFirst: (p: PaginatedResponse<CallLog>) => void = () => {};
    const { el, list } = setup();
    document.body.appendChild(el);
    await flush();
    list.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
    list.mockImplementationOnce(async () => page([aCall('call_new')]));

    select(el, 'filter-direction', 'inbound');
    select(el, 'filter-direction', 'outbound');
    await flush();
    resolveFirst(page([aCall('call_stale')]));
    await flush();

    const rows = [...el.shadowRoot.querySelectorAll('tr[data-call-id]')].map((r) =>
      r.getAttribute('data-call-id')
    );
    expect(rows).toEqual(['call_new']);
  });

  it('keeps the current rows on screen while a filter change loads', async () => {
    const { el, list } = setup([page([aCall('call_1')])]);
    document.body.appendChild(el);
    await flush();
    list.mockImplementationOnce(() => new Promise(() => {}));

    select(el, 'filter-status', 'busy');
    await flush();

    expect(el.shadowRoot.querySelector('[part="loading"]')).toBeNull();
    expect(el.shadowRoot.querySelector('tr[data-call-id="call_1"]')).not.toBeNull();
    expect(el.shadowRoot.querySelector('.container')?.classList).toContain('is-paginating');
  });

  it('does not reload when the host feeds the same filters back', async () => {
    const { el, list } = setup();
    document.body.appendChild(el);
    await flush();
    el.setFilters({ search: 'smith' });
    await flush();
    list.mockClear();

    el.setFilters({ search: 'smith' });
    await flush();
    expect(list).not.toHaveBeenCalled();
  });
});
