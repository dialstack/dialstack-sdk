import '../voicemails';
import type { DialStackInstanceImpl } from '../../types/core';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const VOICEMAIL = {
  id: 'vm_01abc',
  from_name: 'Pat Acme',
  from_number: '+15145551234',
  created_at: '2026-07-20T17:49:00Z',
  duration_seconds: 22,
  is_read: false,
  audio_url: 'https://example.com/vm.wav',
};

type VoicemailsEl = HTMLElement & {
  setInstance: (i: DialStackInstanceImpl) => void;
  setMailbox: (owner: string | null) => void;
  setBehaviorOptions: (o: { autoPlayOnExpand: boolean }) => void;
  shadowRoot: ShadowRoot;
};

describe('<Voicemails> list transcript', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  async function openWithTranscript(text: string): Promise<VoicemailsEl> {
    const instance = {
      getAppearance: () => undefined,
      fetchApi: jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ object: 'list', data: [VOICEMAIL], next_page_url: null }),
        text: async () => '',
      })),
      voicemails: {
        retrieveTranscript: jest.fn(async () => ({
          status: 'completed',
          text,
        })),
      },
    } as unknown as DialStackInstanceImpl;
    const el = document.createElement('dialstack-voicemails') as VoicemailsEl;
    el.setInstance(instance);
    el.setBehaviorOptions({ autoPlayOnExpand: false });
    el.setMailbox('user_01abc');
    document.body.appendChild(el);
    for (let i = 0; i < 3; i++) await flush();

    el.shadowRoot.querySelector<HTMLElement>('[data-id]')!.click();
    for (let i = 0; i < 3; i++) await flush();
    return el;
  }

  it('shows the transcript in the opened message once it arrives', async () => {
    const el = await openWithTranscript('Please call me back.');
    expect(el.shadowRoot.querySelector('.transcript-section .transcript-text')?.textContent).toBe(
      'Please call me back.'
    );
  });

  // A transcript is what a caller said: it is text, never markup.
  it('shows a transcript as text', async () => {
    const el = await openWithTranscript('<img src=x onerror="alert(1)">');
    const text = el.shadowRoot.querySelector('.transcript-section .transcript-text');
    expect(text?.textContent).toBe('<img src=x onerror="alert(1)">');
    expect(text?.querySelector('img')).toBeNull();
  });
});
