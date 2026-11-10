import '../voicemails';
import type { DialStackInstanceImpl } from '../../types/core';

// <Voicemails> set up as a dashboard card: every mailbox, unread only, oldest
// first, the last 7 days, with mailbox names and Mark as read.

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

interface Fixture {
  id: string;
  owner: string;
  from_name: string;
  from_number: string;
  created_at: string;
  duration_seconds: number;
  is_read: boolean;
  audio_url: string;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

function vm(id: string, h: number, owner = 'user_1'): Fixture {
  return {
    id,
    owner,
    from_name: id,
    from_number: '+15145551234',
    created_at: hoursAgo(h),
    duration_seconds: 20,
    is_read: false,
    audio_url: `https://example.com/${id}.wav`,
  };
}

/**
 * pages: what GET /v1/voicemails returns, page by page (the API lists newest
 * first). read: ids marked read through the instance.
 */
function makeInstance(pages: Fixture[][]) {
  const read = new Set<string>();
  const urls: string[] = [];
  const all = pages.flat();
  const unread = () => all.filter((v) => !read.has(v.id));
  const instance = {
    getAppearance: () => undefined,
    fetchApi: jest.fn(async (url: string) => {
      urls.push(url);
      const n = Number(new URL(url, 'http://x').searchParams.get('page') ?? '0');
      const data = pages[n]?.filter((v) => !read.has(v.id)) ?? [];
      const next = n + 1 < pages.length ? `/v1/voicemails?page=${n + 1}` : null;
      return {
        ok: true,
        status: 200,
        json: async () => ({ object: 'list', data, next_page_url: next }),
        text: async () => '',
      };
    }),
    voicemails: {
      summary: jest.fn(async () => ({
        object: 'voicemail_summary',
        total: unread().length,
        breakdown: [],
      })),
      markAsRead: jest.fn(async (id: string) => void read.add(id)),
      markAsUnread: jest.fn(async (id: string) => void read.delete(id)),
      retrieveTranscript: jest.fn(async () => ({ status: 'completed', text: 'hello' })),
    },
    users: {
      list: async () => [
        { id: 'user_1', name: 'Alice Smith', extensions: { data: [{ number: '101' }] } },
      ],
    },
    sharedVoicemailBoxes: {
      list: async () => [{ id: 'svm_1', name: 'Front Desk', extension_number: '200' }],
    },
    calls: { create: jest.fn() },
  };
  return { instance: instance as unknown as DialStackInstanceImpl, mock: instance, urls };
}

type El = HTMLElement & {
  setInstance: (i: DialStackInstanceImpl) => void;
  setMailbox: (owner: string | null) => void;
  setListOptions: (o: object) => void;
  setDisplayOptions: (o: object) => void;
  setBehaviorOptions: (o: object) => void;
  refresh: () => void;
  shadowRoot: ShadowRoot;
};

async function mountCard(
  instance: DialStackInstanceImpl,
  mailbox: string | null = null
): Promise<El> {
  const el = document.createElement('dialstack-voicemails') as El;
  el.setInstance(instance);
  el.setListOptions({ unreadOnly: true, order: 'oldest', receivedWithinDays: 7 });
  el.setDisplayOptions({
    variant: 'card',
    showMailbox: true,
    showMarkAsReadButton: true,
    showDeleteButton: false,
  });
  el.setBehaviorOptions({ markAsReadOnPlay: false, autoPlayOnExpand: false });
  el.setMailbox(mailbox);
  document.body.appendChild(el);
  await flush();
  return el;
}

const names = (el: El) =>
  [...el.shadowRoot.querySelectorAll('.caller-name')].map((n) => n.textContent?.trim());

afterEach(() => {
  document.body.innerHTML = '';
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Voicemails as a card', () => {
  it('reads nothing until a mailbox is given', async () => {
    const { instance, urls } = makeInstance([[vm('a', 1)]]);
    const el = document.createElement('dialstack-voicemails') as El;
    el.setInstance(instance);
    document.body.appendChild(el);
    await flush();
    expect(urls).toEqual([]);
  });

  it('lists every mailbox, unread, from the window, oldest first across pages', async () => {
    const { instance, urls } = makeInstance([[vm('newest', 1)], [vm('oldest', 100, 'svm_1')]]);
    const el = await mountCard(instance);
    const first = new URL(urls[0] ?? '', 'http://x').searchParams;
    expect(first.get('owner')).toBeNull();
    expect(first.get('is_read')).toBe('false');
    expect(first.get('from_date')).not.toBeNull();
    expect(names(el)).toEqual(['oldest', 'newest']);
    expect(el.shadowRoot.querySelector('.card-title')?.textContent).toBe('Unread voicemail');
    expect(el.shadowRoot.textContent).toContain('Front Desk (200)');
    expect(el.shadowRoot.textContent).toContain('Alice Smith (101)');
  });

  it('shows each message at a glance, with its own player, no tap needed', async () => {
    const { instance } = makeInstance([
      [
        {
          ...vm('a', 1),
          summary: 'A long summary that must be shown in full, not cut.',
        } as Fixture,
        vm('b', 2),
      ],
    ]);
    const el = await mountCard(instance);
    const rows = el.shadowRoot.querySelectorAll('.voicemail-item');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.querySelector('.timestamp')?.textContent?.trim()).toMatch(/\d/);
      expect(row.querySelector('button[data-copy]')).not.toBeNull();
      expect(row.querySelector('[data-action="play"]')).not.toBeNull();
      expect(row.querySelector('.progress-bar')).not.toBeNull();
      // The player shows the length; the line above it names only the mailbox.
      expect(row.querySelector('.card-row-meta')?.textContent).not.toMatch(/\d+ s\b/);
      expect(row.querySelector('.chevron')).toBeNull();
      expect(row.querySelector('.unread-dot')).toBeNull();
    }
    expect(el.shadowRoot.querySelector('.card-row-summary')?.textContent).toBe(
      'A long summary that must be shown in full, not cut.'
    );
  });

  it('opens a transcript under its row, text only', async () => {
    const { instance } = makeInstance([[vm('a', 1)]]);
    const el = await mountCard(instance);
    el.shadowRoot.querySelector<HTMLButtonElement>('[data-action="toggle-transcript"]')?.click();
    await flush();
    expect(el.shadowRoot.querySelector('[data-transcript-for="a"]')?.textContent?.trim()).toBe(
      'hello'
    );
  });

  it('offers no call back without a user to call from', async () => {
    const { instance } = makeInstance([[vm('a', 1)]]);
    const el = await mountCard(instance);
    el.shadowRoot.querySelector<HTMLElement>('.voicemail-item')?.click();
    await flush();
    expect(el.shadowRoot.querySelector('[data-action="call"]')).toBeNull();
  });

  it('marks read at once, offers Undo, and Undo marks it unread again', async () => {
    const { instance, mock } = makeInstance([[vm('a', 2), vm('b', 1)]]);
    const el = await mountCard(instance);
    el.shadowRoot.querySelector<HTMLButtonElement>('[data-action="mark-read"]')?.click();
    await flush();
    expect(mock.voicemails.markAsRead).toHaveBeenCalledWith('a');
    el.shadowRoot.querySelector<HTMLButtonElement>('[data-action="undo-read"]')?.click();
    await flush();
    expect(mock.voicemails.markAsUnread).toHaveBeenCalledWith('a');
    expect(el.shadowRoot.querySelector('[data-action="undo-read"]')).toBeNull();
    expect(names(el)).toEqual(['a', 'b']);
  });

  it('keeps the Undo through a reload, and drops the message when time is up', async () => {
    const { instance } = makeInstance([[vm('a', 2), vm('b', 1)]]);
    const el = await mountCard(instance);
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    el.shadowRoot.querySelector<HTMLButtonElement>('[data-action="mark-read"]')?.click();
    await jest.advanceTimersByTimeAsync(10);
    el.refresh(); // the list no longer has it as unread
    await jest.advanceTimersByTimeAsync(10);
    expect(el.shadowRoot.querySelector('[data-action="undo-read"]')).not.toBeNull();
    await jest.advanceTimersByTimeAsync(6_100);
    expect(names(el)).toEqual(['b']);
  });

  it('keeps playing through a redraw', async () => {
    const pause = jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const { instance } = makeInstance([[vm('a', 2), vm('b', 1)]]);
    const el = await mountCard(instance);
    el.shadowRoot.querySelector<HTMLButtonElement>('[data-action="play"][data-id="a"]')?.click();
    // Marking the other message read redraws the whole list.
    el.shadowRoot
      .querySelector<HTMLButtonElement>('[data-action="mark-read"][data-id="b"]')
      ?.click();
    await flush();
    expect(pause).not.toHaveBeenCalled();
    expect(el.shadowRoot.querySelector('audio')).toBeNull();
    expect(el.shadowRoot.querySelector('[data-action="play"]')?.getAttribute('aria-label')).toBe(
      'Pause'
    );
  });

  it('stops the message playing when it is marked read', async () => {
    const pause = jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const { instance } = makeInstance([[vm('a', 1)]]);
    const el = await mountCard(instance);
    el.shadowRoot.querySelector<HTMLButtonElement>('[data-action="play"]')?.click();
    el.shadowRoot.querySelector<HTMLButtonElement>('[data-action="mark-read"]')?.click();
    await flush();
    expect(pause).toHaveBeenCalled();
  });
});
