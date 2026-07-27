import '../voicemails';
import type { DialStackInstanceImpl } from '../../types/core';
import type { Sentiment } from '../../types/components';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

interface VoicemailFixture {
  id: string;
  from_name: string;
  from_number: string;
  created_at: string;
  duration_seconds: number;
  is_read: boolean;
  audio_url: string;
  summary?: string;
  sentiment?: Sentiment | null;
}

function makeVoicemail(overrides: Partial<VoicemailFixture> = {}): VoicemailFixture {
  return {
    id: 'vm_01abc',
    from_name: 'Pat Acme',
    from_number: '+15145551234',
    created_at: '2026-07-20T17:49:00Z',
    duration_seconds: 22,
    is_read: false,
    audio_url: 'https://example.com/vm.wav',
    ...overrides,
  };
}

function makeInstance(voicemails: VoicemailFixture[]): DialStackInstanceImpl {
  return {
    getAppearance: () => undefined,
    fetchApi: jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ object: 'list', data: voicemails, next_page_url: null }),
      text: async () => '',
    })),
  } as unknown as DialStackInstanceImpl;
}

type VoicemailsEl = HTMLElement & {
  setInstance: (i: DialStackInstanceImpl) => void;
  setUserId: (id: string) => void;
  shadowRoot: ShadowRoot;
};

async function mount(voicemails: VoicemailFixture[]): Promise<VoicemailsEl> {
  const el = document.createElement('dialstack-voicemails') as VoicemailsEl;
  el.setInstance(makeInstance(voicemails));
  el.setUserId('user_01abc');
  document.body.appendChild(el);
  await flush();
  await flush();
  await flush();
  return el;
}

/** Expand the row so the detail block (where the badge lives) renders. */
function expandFirstRow(el: VoicemailsEl) {
  const row = el.shadowRoot.querySelector<HTMLElement>('[data-id]');
  expect(row).not.toBeNull();
  row!.click();
}

function badge(el: VoicemailsEl): HTMLElement | null {
  return el.shadowRoot.querySelector<HTMLElement>('.sentiment-badge');
}

const NEGATIVE: Sentiment = { overall: 'negative', score: -0.8, magnitude: 0.85 };
const POLARIZED: Sentiment = { overall: 'neutral', score: 0.0, magnitude: 0.9 };
const FLAT: Sentiment = { overall: 'neutral', score: 0.0, magnitude: 0.05 };

describe('voicemails sentiment badge', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the badge when sentiment arrived without a summary', async () => {
    // Summary and sentiment are independent best-effort outputs. A short angry
    // voicemail can produce sentiment and no summary, and that badge is the
    // signal the feature exists for — it must not be gated on the summary.
    const el = await mount([makeVoicemail({ sentiment: NEGATIVE, summary: undefined })]);
    expandFirstRow(el);
    await flush();

    const found = badge(el);
    expect(found).not.toBeNull();
    expect(found!.textContent?.trim()).toBe('Negative');
  });

  it('renders the badge alongside a summary', async () => {
    const el = await mount([
      makeVoicemail({ sentiment: NEGATIVE, summary: 'Caller reported an outage.' }),
    ]);
    expandFirstRow(el);
    await flush();

    expect(badge(el)).not.toBeNull();
    expect(el.shadowRoot.querySelector('.summary-text')?.textContent).toContain('outage');
  });

  it('shows no badge for a flat neutral reading', async () => {
    // The scale is calibrated so routine voicemails land neutral; a badge on
    // every one of them would be noise.
    const el = await mount([makeVoicemail({ sentiment: FLAT, summary: 'Routine callback.' })]);
    expandFirstRow(el);
    await flush();

    expect(badge(el)).toBeNull();
  });

  it('shows Mixed for a neutral score with high magnitude', async () => {
    // Score alone cannot separate "nobody cared" from "both sides cared, in
    // opposite directions" — magnitude does, and the label is derived from it.
    const el = await mount([makeVoicemail({ sentiment: POLARIZED, summary: 'Heated call.' })]);
    expandFirstRow(el);
    await flush();

    expect(badge(el)?.textContent?.trim()).toBe('Mixed');
  });

  it('shows no badge when sentiment was never analyzed', async () => {
    const el = await mount([makeVoicemail({ sentiment: null, summary: 'Routine callback.' })]);
    expandFirstRow(el);
    await flush();

    expect(badge(el)).toBeNull();
  });
});
