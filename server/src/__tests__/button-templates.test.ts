import { DialStack } from '../index';
import type { ButtonTemplateWithDetails } from '../index';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Button templates', () => {
  let dialstack: DialStack;
  const acct = { dialstackAccount: 'acct_test123' };

  beforeEach(() => {
    dialstack = new DialStack('sk_test_xxx');
    mockFetch.mockReset();
  });

  function mockJSON(body: unknown, status = 200) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: new Headers({ 'x-request-id': 'req_123' }),
    });
  }

  function mockNoContent() {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => ({}),
      text: async () => '',
      headers: new Headers(),
    });
  }

  function mockEmptyList(url: string) {
    mockJSON({ object: 'list', url, data: [], next_page_url: null, previous_page_url: null });
  }

  function requestedUrl(): string {
    return mockFetch.mock.calls[0][0];
  }

  function requestInit(): { method: string; body?: string } {
    return mockFetch.mock.calls[0][1];
  }

  it('creates a template', async () => {
    mockJSON({ id: 'btpl_123', name: 'Front desk' }, 201);

    await dialstack.buttonTemplates.create({ name: 'Front desk', description: 'Lobby' }, acct);

    expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/button_templates');
    expect(requestInit().method).toBe('POST');
    expect(JSON.parse(requestInit().body as string)).toEqual({
      name: 'Front desk',
      description: 'Lobby',
    });
  });

  it('lists templates with pagination', async () => {
    mockEmptyList('/v1/button_templates');

    await dialstack.buttonTemplates.list({ limit: 10, page: 'cursor_abc' }, acct);

    expect(requestedUrl()).toBe(
      'https://api.dialstack.ai/v1/button_templates?limit=10&page=cursor_abc'
    );
  });

  describe('buttonTemplates.retrieve', () => {
    it('forwards expand and for_device together', async () => {
      mockJSON({ id: 'btpl_123', name: 'Front desk' });

      await dialstack.buttonTemplates.retrieve('btpl_123', {
        ...acct,
        for_device: 'dev_123',
        expand: ['buttons'],
      });

      expect(requestedUrl()).toBe(
        'https://api.dialstack.ai/v1/button_templates/btpl_123?for_device=dev_123&expand%5B%5D=buttons'
      );
    });

    it('sends no query string when neither is requested', async () => {
      mockJSON({ id: 'btpl_123', name: 'Front desk' });

      await dialstack.buttonTemplates.retrieve('btpl_123', acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/button_templates/btpl_123');
    });

    it('exposes the embedded buttons as a bare array', async () => {
      mockJSON({
        id: 'btpl_123',
        name: 'Front desk',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        buttons: [
          {
            id: 'tbtn_1',
            template: 'btpl_123',
            position: 1,
            label: 'Reception',
            type: 'blf_extension',
            target: { user: 'user_123' },
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      });

      const template: ButtonTemplateWithDetails = await dialstack.buttonTemplates.retrieve(
        'btpl_123',
        { ...acct, expand: ['buttons'] }
      );

      // The API embeds these as a plain array, not a list envelope.
      expect(template.buttons?.[0].label).toBe('Reception');
      expect(template.buttons?.[0].type).toBe('blf_extension');
    });
  });

  it('updates a template, clearing the description with null', async () => {
    mockJSON({ id: 'btpl_123', name: 'Front desk', description: null });

    await dialstack.buttonTemplates.update('btpl_123', { description: null }, acct);

    expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/button_templates/btpl_123');
    expect(JSON.parse(requestInit().body as string)).toEqual({ description: null });
  });

  it('deletes a template', async () => {
    mockNoContent();

    await dialstack.buttonTemplates.del('btpl_123', acct);

    expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/button_templates/btpl_123');
    expect(requestInit().method).toBe('DELETE');
  });

  describe('template buttons', () => {
    it('lists buttons', async () => {
      mockEmptyList('/v1/button_templates/btpl_123/buttons');

      await dialstack.buttonTemplates.listButtons('btpl_123', { limit: 20 }, acct);

      expect(requestedUrl()).toBe(
        'https://api.dialstack.ai/v1/button_templates/btpl_123/buttons?limit=20'
      );
    });

    it('creates a button with a type-narrowed target', async () => {
      mockJSON({ id: 'tbtn_1', position: 2, label: 'Sales', type: 'blf_queue_depth' }, 201);

      await dialstack.buttonTemplates.createButton(
        'btpl_123',
        { position: 2, label: 'Sales', type: 'blf_queue_depth', target: { queue: 'qu_123' } },
        acct
      );

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/button_templates/btpl_123/buttons');
      expect(JSON.parse(requestInit().body as string)).toEqual({
        position: 2,
        label: 'Sales',
        type: 'blf_queue_depth',
        target: { queue: 'qu_123' },
      });
    });

    it('moves a button', async () => {
      mockJSON({ id: 'tbtn_1', position: 5 });

      await dialstack.buttonTemplates.updateButton('btpl_123', 'tbtn_1', { position: 5 }, acct);

      expect(requestedUrl()).toBe(
        'https://api.dialstack.ai/v1/button_templates/btpl_123/buttons/tbtn_1'
      );
      expect(JSON.parse(requestInit().body as string)).toEqual({ position: 5 });
    });

    it('deletes a button', async () => {
      mockNoContent();

      await dialstack.buttonTemplates.delButton('btpl_123', 'tbtn_1', acct);

      expect(requestedUrl()).toBe(
        'https://api.dialstack.ai/v1/button_templates/btpl_123/buttons/tbtn_1'
      );
      expect(requestInit().method).toBe('DELETE');
    });
  });
});
