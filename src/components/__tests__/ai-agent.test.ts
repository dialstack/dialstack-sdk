import '../ai-agent';
import type { DialStackInstanceImpl } from '../../types/core';
import type { AIAgent } from '../../types/ai-agent';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeAgent(overrides: Partial<AIAgent> = {}): AIAgent {
  return {
    id: 'aia_01abc',
    name: 'Front Desk Agent',
    voice_app_id: 'va_01abc',
    persona_name: 'Tony',
    greeting_name: 'Jones Family Dental',
    instructions: 'Be helpful.',
    faq_responses: [],
    scheduling: { webhook_url: 'https://example.com/hooks' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeInstance(agent = makeAgent()) {
  const update = jest.fn(async (_id: string, data: unknown) => ({ ...agent, ...data }));
  const instance = {
    getAppearance: () => undefined,
    aiAgents: {
      retrieve: jest.fn(async () => agent),
      update,
    },
  } as unknown as DialStackInstanceImpl;
  return { instance, update };
}

describe('AIAgentComponent', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('delegates create payloads to the host without calling the component-scoped API', async () => {
    const { instance, update } = makeInstance();
    const onCreateRequested = jest.fn(async () => ({
      agentId: 'aia_new',
      voiceAppId: 'va_new',
      name: 'Front Desk Agent',
    }));
    const el = document.createElement('dialstack-ai-agent') as HTMLElement & {
      setInstance: (i: DialStackInstanceImpl) => void;
      setMode: (mode: 'create' | 'edit') => void;
      setSubmitMode: (mode: 'sdk' | 'host') => void;
      setInitialValues: (values: Record<string, unknown>) => void;
      setOnCreateRequested: (handler: typeof onCreateRequested) => void;
    };

    el.setInstance(instance);
    el.setMode('create');
    el.setSubmitMode('host');
    el.setInitialValues({
      name: 'Front Desk Agent',
      extension_number: '700',
      persona_name: 'Tony',
      greeting_name: 'Jones Family Dental',
      instructions: 'Be helpful.',
      faq_responses: [{ question: 'Hours?', answer: '9 to 5.' }],
      scheduling: { webhook_url: 'https://example.com/hooks' },
    });
    el.setOnCreateRequested(onCreateRequested);
    document.body.appendChild(el);

    el.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
    await flush();

    expect(update).not.toHaveBeenCalled();
    expect(onCreateRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Front Desk Agent',
        extension_number: '700',
        scheduling: { webhook_url: 'https://example.com/hooks' },
      })
    );
  });

  it('blocks host saves when the extension is unavailable', async () => {
    const { instance } = makeInstance();
    const onCreateRequested = jest.fn(async () => ({
      agentId: 'aia_new',
      voiceAppId: 'va_new',
      name: 'Front Desk Agent',
    }));
    const onCheckExtensionAvailability = jest.fn(async () => ({
      available: false,
      message: 'Extension number is already in use',
    }));
    const el = document.createElement('dialstack-ai-agent') as HTMLElement & {
      setInstance: (i: DialStackInstanceImpl) => void;
      setMode: (mode: 'create' | 'edit') => void;
      setSubmitMode: (mode: 'sdk' | 'host') => void;
      setInitialValues: (values: Record<string, unknown>) => void;
      setOnCreateRequested: (handler: typeof onCreateRequested) => void;
      setOnCheckExtensionAvailability: (handler: typeof onCheckExtensionAvailability) => void;
    };

    el.setInstance(instance);
    el.setMode('create');
    el.setSubmitMode('host');
    el.setInitialValues({
      name: 'Front Desk Agent',
      extension_number: '700',
      faq_responses: [],
    });
    el.setOnCreateRequested(onCreateRequested);
    el.setOnCheckExtensionAvailability(onCheckExtensionAvailability);
    document.body.appendChild(el);

    el.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
    await flush();
    await flush();

    expect(onCheckExtensionAvailability).toHaveBeenCalledWith('700');
    expect(onCreateRequested).not.toHaveBeenCalled();
    expect(el.shadowRoot?.textContent).toContain('Extension number is already in use');
  });

  it('keeps privileged scheduling out of default SDK edit saves', async () => {
    const { instance, update } = makeInstance();
    const el = document.createElement('dialstack-ai-agent') as HTMLElement & {
      setInstance: (i: DialStackInstanceImpl) => void;
      setAgentId: (id: string) => void;
    };

    el.setInstance(instance);
    el.setAgentId('aia_01abc');
    document.body.appendChild(el);
    await flush();

    el.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
    await flush();

    expect(update).toHaveBeenCalledWith(
      'aia_01abc',
      expect.not.objectContaining({ scheduling: expect.anything() })
    );
  });

  it('does not reset edited form values when only submit mode changes', async () => {
    const { instance } = makeInstance();
    const el = document.createElement('dialstack-ai-agent') as HTMLElement & {
      setInstance: (i: DialStackInstanceImpl) => void;
      setMode: (mode: 'create' | 'edit') => void;
      setSubmitMode: (mode: 'sdk' | 'host') => void;
      setInitialValues: (values: Record<string, unknown>) => void;
    };

    el.setInstance(instance);
    el.setMode('create');
    el.setSubmitMode('host');
    el.setInitialValues({ name: 'Front Desk Agent', faq_responses: [] });
    document.body.appendChild(el);

    const nameInput = el.shadowRoot?.querySelector<HTMLInputElement>('[data-field="name"]');
    expect(nameInput).toBeTruthy();
    nameInput!.value = 'Edited Agent';
    nameInput!.dispatchEvent(new Event('input'));

    el.setSubmitMode('sdk');

    expect(el.shadowRoot?.querySelector<HTMLInputElement>('[data-field="name"]')?.value).toBe(
      'Edited Agent'
    );
  });

  it('shows host-required errors when host callbacks are missing', async () => {
    const { instance } = makeInstance();
    const el = document.createElement('dialstack-ai-agent') as HTMLElement & {
      setInstance: (i: DialStackInstanceImpl) => void;
      setMode: (mode: 'create' | 'edit') => void;
      setSubmitMode: (mode: 'sdk' | 'host') => void;
      setInitialValues: (values: Record<string, unknown>) => void;
      setAgentId: (id: string) => void;
    };

    el.setInstance(instance);
    el.setMode('create');
    el.setSubmitMode('host');
    el.setInitialValues({ name: 'Front Desk Agent', faq_responses: [] });
    document.body.appendChild(el);

    el.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
    await flush();

    expect(el.shadowRoot?.textContent).toContain(
      'This form is waiting for the host app to create the AI agent.'
    );

    el.setMode('edit');
    el.setAgentId('aia_01abc');
    el.setSubmitMode('host');
    el.setInitialValues({ name: 'Front Desk Agent', faq_responses: [] });
    await flush();

    el.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
    await flush();

    expect(el.shadowRoot?.textContent).toContain(
      'This form is waiting for the host app to save the AI agent.'
    );
  });

  it('does not let stale SDK save responses overwrite a newly selected agent', async () => {
    const firstAgent = makeAgent({ id: 'aia_first', name: 'First Agent' });
    const secondAgent = makeAgent({ id: 'aia_second', name: 'Second Agent' });
    let resolveUpdate: ((agent: AIAgent) => void) | undefined;
    const update = jest.fn(
      () =>
        new Promise<AIAgent>((resolve) => {
          resolveUpdate = resolve;
        })
    );
    const retrieve = jest.fn().mockResolvedValueOnce(firstAgent).mockResolvedValueOnce(secondAgent);
    const instance = {
      getAppearance: () => undefined,
      aiAgents: { retrieve, update },
    } as unknown as DialStackInstanceImpl;
    const el = document.createElement('dialstack-ai-agent') as HTMLElement & {
      setInstance: (i: DialStackInstanceImpl) => void;
      setAgentId: (id: string) => void;
    };

    el.setInstance(instance);
    el.setAgentId('aia_first');
    document.body.appendChild(el);
    await flush();

    el.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
    await flush();
    el.setAgentId('aia_second');
    await flush();
    resolveUpdate?.(makeAgent({ id: 'aia_first', name: 'Stale Update' }));
    await flush();

    expect(el.shadowRoot?.querySelector<HTMLInputElement>('[data-field="name"]')?.value).toBe(
      'Second Agent'
    );
  });
});
