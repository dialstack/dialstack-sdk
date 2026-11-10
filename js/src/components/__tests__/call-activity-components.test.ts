import '../to-call-back';
import { createMockInstance } from '../../__mocks__/mock-instance';
import { withCallActivityData } from '../../__mocks__/call-activity-mock';
import type { DialStackInstanceImpl } from '../../types/core';

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

function mount<T extends HTMLElement>(tag: string, instance: DialStackInstanceImpl): T {
  const el = document.createElement(tag) as T & {
    setInstance: (i: DialStackInstanceImpl) => void;
    setPollInterval: (ms: number | null) => void;
  };
  el.setPollInterval(null);
  document.body.appendChild(el);
  el.setInstance(instance);
  return el;
}

function dataInstance(): DialStackInstanceImpl {
  const instance = createMockInstance();
  withCallActivityData(instance);
  return instance;
}

afterEach(() => {
  document.body.innerHTML = '';
  jest.useRealTimers();
});

describe('To call back', () => {
  it('re-reads the list only when the inbound counts change', async () => {
    const instance = dataInstance();
    const list = jest.spyOn(instance.remoteNumbers, 'list');
    const summary = jest.spyOn(instance.calls, 'summary');
    const el = mount<HTMLElement & { tick: (force: boolean) => Promise<void> }>(
      'dialstack-to-call-back',
      instance
    );
    await settle();
    expect(list).toHaveBeenCalledTimes(1);

    await el.tick(false);
    expect(summary).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenCalledTimes(1);

    summary.mockResolvedValueOnce({
      object: 'call_summary',
      total_calls: 1,
      breakdown: [{ direction: 'inbound', status: 'no-answer', connected: false, count: 1 }],
      sentiment: { overall: [], local: [], remote: [] },
    });
    await el.tick(false);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('re-reads the list when a call-back changes the outbound counts', async () => {
    const instance = dataInstance();
    const list = jest.spyOn(instance.remoteNumbers, 'list');
    const summary = jest.spyOn(instance.calls, 'summary');
    const el = mount<HTMLElement & { tick: (force: boolean) => Promise<void> }>(
      'dialstack-to-call-back',
      instance
    );
    await settle();
    const before = await summary.mock.results[0]?.value;
    summary.mockResolvedValueOnce({
      ...before,
      breakdown: [
        ...before.breakdown,
        { direction: 'outbound', status: 'completed', connected: true, count: 1 },
      ],
    });
    await el.tick(false);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('does not redraw when nothing changed, so playback and focus survive a poll', async () => {
    const instance = dataInstance();
    const el = mount<HTMLElement & { tick: (force: boolean) => Promise<void> }>(
      'dialstack-to-call-back',
      instance
    );
    await settle();
    const card = el.shadowRoot?.querySelector('.card');
    await el.tick(false);
    expect(el.shadowRoot?.querySelector('.card')).toBe(card);
  });

  it('tries a failed read again on the next tick', async () => {
    const instance = dataInstance();
    const list = jest.spyOn(instance.remoteNumbers, 'list');
    list.mockRejectedValueOnce(new Error('boom'));
    const el = mount<HTMLElement & { tick: (force: boolean) => Promise<void> }>(
      'dialstack-to-call-back',
      instance
    );
    await settle();
    expect(el.shadowRoot?.querySelector('[role="alert"]')).not.toBeNull();
    await el.tick(false);
    expect(list).toHaveBeenCalledTimes(2);
    expect(el.shadowRoot?.querySelector('[role="alert"]')).toBeNull();
  });

  it('runs a refresh that arrives during a read once the read ends', async () => {
    const instance = dataInstance();
    const list = jest.spyOn(instance.remoteNumbers, 'list');
    const el = mount<HTMLElement & { refresh: () => void }>('dialstack-to-call-back', instance);
    el.refresh(); // the first read is still running
    await settle();
    await settle();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('runs a refresh queued during a poll that found nothing new', async () => {
    const instance = dataInstance();
    const list = jest.spyOn(instance.remoteNumbers, 'list');
    const summary = jest.spyOn(instance.calls, 'summary');
    const el = mount<
      HTMLElement & { tick: (force: boolean) => Promise<void>; refresh: () => void }
    >('dialstack-to-call-back', instance);
    await settle();
    expect(list).toHaveBeenCalledTimes(1);
    // The poll's signature read is in flight, and will match: no reload of its own.
    let release: (v: unknown) => void = () => {};
    const same = await summary.mock.results[0]?.value;
    summary.mockImplementationOnce(() => new Promise((r) => (release = () => r(same))) as never);
    const poll = el.tick(false);
    el.refresh();
    release(undefined);
    await poll;
    await settle();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('copies on Enter from the copy button without selecting the caller', async () => {
    const instance = dataInstance();
    const el = mount<HTMLElement & { setOnCallerSelect: (cb: unknown) => void }>(
      'dialstack-to-call-back',
      instance
    );
    const select = jest.fn();
    el.setOnCallerSelect(select);
    await settle();
    const copy = el.shadowRoot?.querySelector<HTMLButtonElement>('button[data-copy]');
    expect(copy).not.toBeNull();
    copy?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(select).not.toHaveBeenCalled();
  });

  it("takes the host's classes, and exposes parts, on its frame and rows", async () => {
    const el = mount<HTMLElement & { setClasses: (c: object) => void }>(
      'dialstack-to-call-back',
      dataInstance()
    );
    el.setClasses({ card: 'host-card', title: 'host-title', item: 'host-row' });
    await settle();
    const root = el.shadowRoot;
    expect(root?.querySelector('[part="card"]')?.classList.contains('host-card')).toBe(true);
    expect(root?.querySelector('[part="card-title"]')?.classList.contains('host-title')).toBe(true);
    const rows = root?.querySelectorAll('[part~="item"]') ?? [];
    expect(rows.length).toBeGreaterThan(0);
    expect([...rows].every((r) => r.classList.contains('host-row'))).toBe(true);
  });

  it('says a failed read in words, not a key', async () => {
    const instance = dataInstance();
    jest.spyOn(instance.remoteNumbers, 'list').mockRejectedValue(new Error('boom'));
    const el = mount('dialstack-to-call-back', instance);
    await settle();
    expect(el.shadowRoot?.querySelector('[role="alert"]')?.textContent).toBe(
      'Could not load this card.'
    );
  });

  it('draws one mark per try, ours hollow, each titled', async () => {
    const el = mount('dialstack-to-call-back', dataInstance());
    await settle();
    const marks =
      el.shadowRoot?.querySelectorAll<HTMLElement>('[data-testid="to-call-back-mark"]') ?? [];
    expect(marks.length).toBe(11);
    expect([...marks].filter((m) => m.classList.contains('call-back'))).toHaveLength(2);
    expect([...marks].every((m) => (m.getAttribute('title') ?? '').length > 0)).toBe(true);
    expect([...marks].some((m) => m.getAttribute('title')?.startsWith('Failed (Busy)'))).toBe(true);
  });
});
