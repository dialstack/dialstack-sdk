import '../call-logs';
import type { DialStackInstanceImpl } from '../../types/core';
import type { CallListParams, CallLog, CallLogFilters, PaginatedResponse } from '../../types';

const flush = async () => {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

const page = (calls: CallLog[]): PaginatedResponse<CallLog> => ({
  object: 'list',
  url: '/v1/calls',
  next_page_url: null,
  previous_page_url: null,
  data: calls,
});

const aCall = (id: string, mos?: number): CallLog =>
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
    quality_metrics: mos === undefined ? [] : [{ leg: 'pstn', mos }],
  }) as unknown as CallLog;

type CallLogsEl = HTMLElement & {
  setInstance: (i: DialStackInstanceImpl) => void;
  setFilters: (f: CallLogFilters) => void;
  setOnFiltersChange: (cb: (f: CallLogFilters) => void) => void;
  setDisplayOptions: (o: { showSentiment?: boolean }) => void;
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

const lastParams = (list: jest.Mock): CallListParams =>
  list.mock.calls[list.mock.calls.length - 1][0];

const byId = <T extends HTMLElement>(el: CallLogsEl, id: string) =>
  el.shadowRoot.getElementById(id) as T | null;

function openPanel(el: CallLogsEl) {
  byId<HTMLButtonElement>(el, 'filter-sentiment')!.click();
}

function type(el: CallLogsEl, id: string, value: string) {
  const input = byId<HTMLInputElement>(el, id)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// Each side's label is a radio group named after the side; its choices are
// `${name}-${value}`, with `any` for no condition.
function choose(el: CallLogsEl, name: string, value: string) {
  byId<HTMLInputElement>(el, `${name}-${value || 'any'}`)!.click();
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CallLogs sentiment filter', () => {
  it('opens a dialog per side and applies labels and inclusive bounds', async () => {
    const { el, list } = setup();
    const onChange = jest.fn();
    el.setOnFiltersChange(onChange);
    document.body.appendChild(el);
    await flush();

    const button = byId<HTMLButtonElement>(el, 'filter-sentiment')!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    openPanel(el);

    const panel = byId(el, 'sentiment-panel')!;
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.querySelectorAll('fieldset')).toHaveLength(3);
    expect(byId(el, 'filter-sentiment')!.getAttribute('aria-expanded')).toBe('true');
    expect(el.shadowRoot.activeElement?.id).toBe('sentiment-overall-label-any');

    choose(el, 'sentiment-remote-label', 'negative');
    type(el, 'sentiment-remote-score-max', '-0.5');
    type(el, 'sentiment-overall-magnitude-min', '0.6');
    list.mockClear();
    byId<HTMLButtonElement>(el, 'sentiment-apply')!.click();
    await flush();

    expect(byId(el, 'sentiment-panel')).toBeNull();
    const params = lastParams(list);
    expect(params.remote_sentiment).toBe('negative');
    expect(params.remote_sentiment_score).toEqual({ lte: -0.5 });
    expect(params.sentiment_magnitude).toEqual({ gte: 0.6 });
    expect(params.local_sentiment).toBeUndefined();
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        remote_sentiment: 'negative',
        remote_sentiment_score: { lte: -0.5 },
        sentiment_magnitude: { gte: 0.6 },
      })
    );
    expect(el.shadowRoot.querySelector('.filter-count')?.textContent).toBe('3');
    expect(el.shadowRoot.activeElement?.id).toBe('filter-sentiment');
  });

  it('rejects a minimum above its maximum without reloading', async () => {
    const { el, list } = setup();
    document.body.appendChild(el);
    await flush();
    openPanel(el);
    type(el, 'sentiment-local-score-min', '0.5');
    type(el, 'sentiment-local-score-max', '0.1');
    list.mockClear();

    byId<HTMLButtonElement>(el, 'sentiment-apply')!.click();
    await flush();

    expect(list).not.toHaveBeenCalled();
    expect(el.shadowRoot.querySelector('[role="alert"]')?.textContent).toContain('Min');
    expect(byId<HTMLInputElement>(el, 'sentiment-local-score-min')!.value).toBe('0.5');
  });

  it('rejects a bound outside the field range', async () => {
    const { el, list } = setup();
    document.body.appendChild(el);
    await flush();
    openPanel(el);
    type(el, 'sentiment-overall-magnitude-min', '-0.2');
    list.mockClear();

    byId<HTMLButtonElement>(el, 'sentiment-apply')!.click();
    await flush();

    expect(list).not.toHaveBeenCalled();
    expect(el.shadowRoot.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('closes on Escape without applying the draft', async () => {
    const { el, list } = setup();
    document.body.appendChild(el);
    await flush();
    openPanel(el);
    choose(el, 'sentiment-overall-label', 'positive');
    list.mockClear();

    byId(el, 'sentiment-panel')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    await flush();

    expect(byId(el, 'sentiment-panel')).toBeNull();
    expect(list).not.toHaveBeenCalled();
    expect(el.shadowRoot.activeElement?.id).toBe('filter-sentiment');
  });

  it('keeps score and magnitude collapsed unless a range is set', async () => {
    const { el } = setup();
    document.body.appendChild(el);
    await flush();
    openPanel(el);
    expect(byId<HTMLDetailsElement>(el, 'sentiment-advanced')!.open).toBe(false);
    byId<HTMLButtonElement>(el, 'filter-sentiment')!.click();

    el.setFilters({ remote_sentiment_score: { lte: -0.5 } });
    await flush();
    openPanel(el);
    expect(byId<HTMLDetailsElement>(el, 'sentiment-advanced')!.open).toBe(true);
    expect(byId<HTMLInputElement>(el, 'sentiment-remote-score-max')!.value).toBe('-0.5');
  });

  it('closes on a press outside the panel', async () => {
    const { el } = setup();
    document.body.appendChild(el);
    await flush();
    openPanel(el);

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));

    expect(byId(el, 'sentiment-panel')).toBeNull();
  });

  it('shows host-preset conditions and clears them from the panel', async () => {
    const { el, list } = setup();
    el.setFilters({ direction: 'inbound', remote_sentiment: 'negative' });
    document.body.appendChild(el);
    await flush();

    expect(lastParams(list)).toMatchObject({ direction: 'inbound', remote_sentiment: 'negative' });
    expect(el.shadowRoot.querySelector('.filter-count')?.textContent).toBe('1');

    openPanel(el);
    expect(byId<HTMLInputElement>(el, 'sentiment-remote-label-negative')!.checked).toBe(true);
    list.mockClear();
    byId<HTMLButtonElement>(el, 'sentiment-clear')!.click();
    await flush();

    const params = lastParams(list);
    expect(params.remote_sentiment).toBeUndefined();
    expect(params.direction).toBe('inbound');
    expect(el.shadowRoot.querySelector('.filter-count')).toBeNull();
  });

  it('does not reload when the host feeds the same sentiment filters back', async () => {
    const { el, list } = setup();
    document.body.appendChild(el);
    await flush();
    el.setFilters({ remote_sentiment_score: { gte: -1, lte: -0.5 } });
    await flush();
    list.mockClear();

    el.setFilters({ remote_sentiment_score: { lte: -0.5, gte: -1 } });
    await flush();
    expect(list).not.toHaveBeenCalled();
  });

  it('counts sentiment conditions as filters Clear filters undoes', async () => {
    const { el, list } = setup();
    el.setFilters({ sentiment: 'negative' });
    document.body.appendChild(el);
    await flush();

    const clear = byId<HTMLButtonElement>(el, 'clear-filters-btn');
    expect(clear).not.toBeNull();
    list.mockClear();
    clear!.click();
    await flush();
    expect(lastParams(list).sentiment).toBeUndefined();
  });
});

describe('CallLogs quality badge', () => {
  it.each([
    [4.2, 'badge-quality-good'],
    [4.0, 'badge-quality-good'],
    [3.7, 'badge-quality-fair'],
    [3.5, 'badge-quality-fair'],
    [3.4, 'badge-quality-poor'],
    [3.0, 'badge-quality-poor'],
  ])('marks MOS %s as %s, matching the API quality tiers', async (mos, cls) => {
    const { el } = setup([page([aCall('call_1', mos)])]);
    document.body.appendChild(el);
    await flush();

    expect(el.shadowRoot.querySelector(`.${cls}`)).not.toBeNull();
  });
});

describe('CallLogs sentiment column', () => {
  it('shows the side the list is filtered on, named in the header', async () => {
    const reading = {
      overall: 'neutral',
      score: 0,
      magnitude: 0.3,
      local: { sentiment: 'positive', score: 0.5, magnitude: 0.4 },
      remote: { sentiment: 'negative', score: -0.6, magnitude: 0.7 },
    };
    const row = { ...aCall('call_a'), sentiment: reading } as unknown as CallLog;
    const { el } = setup([page([row]), page([row])]);
    el.setFilters({ remote_sentiment: 'negative' });
    document.body.appendChild(el);
    await flush();
    const badges = () =>
      [...el.shadowRoot.querySelectorAll('[part~="cell-sentiment"] .badge')].map(
        (b) => b.textContent
      );
    const header = () =>
      [...el.shadowRoot.querySelectorAll('th')].map((th) => th.textContent?.trim()).at(-1);
    expect(badges()).toEqual(['Negative']);
    expect(header()).toBe('Remote sentiment');

    el.setFilters({ remote_sentiment: 'negative', local_sentiment: 'positive' });
    await flush();
    expect(badges()).toEqual(['Local: Positive', 'Remote: Negative']);
    expect(header()).toBe('Sentiment');
  });

  const withSentiment = (call: CallLog, sentiment: unknown): CallLog =>
    ({ ...call, sentiment }) as unknown as CallLog;

  it("shows the overall label, each side's in its tooltip, and a dash with no reading", async () => {
    const { el } = setup([
      page([
        withSentiment(aCall('call_a'), {
          overall: 'negative',
          score: -0.5,
          magnitude: 0.6,
          local: { sentiment: 'neutral', score: 0, magnitude: 0.2 },
          remote: { sentiment: 'negative', score: -0.7, magnitude: 0.8 },
        }),
        withSentiment(aCall('call_b'), null),
      ]),
    ]);
    document.body.appendChild(el);
    await flush();

    const cells = [...el.shadowRoot.querySelectorAll('[part~="cell-sentiment"] .badge')];
    expect(cells.map((c) => c.textContent)).toEqual(['Negative', '—']);
    expect(cells[0]!.classList.contains('badge-sentiment-negative')).toBe(true);
    expect(cells[0]!.parentElement!.getAttribute('title')).toBe(
      'Overall: Negative, Local: Neutral, Remote: Negative'
    );
  });

  it('offers the sentiment filter only alongside the column', async () => {
    const { el } = setup();
    document.body.appendChild(el);
    await flush();
    expect(byId(el, 'filter-sentiment')).not.toBeNull();
    expect(byId(el, 'filter-sentiment')!.querySelector('[part="filter-chevron"]')).not.toBeNull();

    el.setDisplayOptions({ showSentiment: false });
    await flush();
    expect(byId(el, 'filter-sentiment')).toBeNull();
    expect(el.shadowRoot.querySelector('[part~="cell-sentiment"]')).toBeNull();
  });
});

describe('CallLogs filter highlighting', () => {
  it('marks every filter away from its default, and only those', async () => {
    const { el } = setup();
    document.body.appendChild(el);
    await flush();
    const ids = [
      'ds-call-logs-search',
      'filter-direction',
      'filter-status',
      'filter-date',
      'filter-sentiment',
    ];
    const activeOnes = () =>
      ids.filter((id) => el.shadowRoot.getElementById(id)?.classList.contains('is-active'));
    expect(activeOnes()).toEqual([]);

    el.setFilters({ search: 'dana', direction: 'inbound', status: 'no-answer', datePreset: '7d' });
    await flush();
    expect(activeOnes()).toEqual([
      'ds-call-logs-search',
      'filter-direction',
      'filter-status',
      'filter-date',
    ]);
  });
});
