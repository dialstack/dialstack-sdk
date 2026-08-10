import { DialStack, type Device, type DeviceExpand, type DeviceListExpand } from '../index.js';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Devices', () => {
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

  describe('devices.create', () => {
    it('posts a deskphone and reads back the minimal response', async () => {
      mockJSON({ id: 'dev_123', type: 'deskphone' }, 201);

      const created = await dialstack.devices.create(
        { mac_address: '00:04:13:aa:bb:cc', name: 'Front desk', location: 'loc_123' },
        acct
      );

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/devices');
      expect(JSON.parse(requestInit().body as string)).toEqual({
        mac_address: '00:04:13:aa:bb:cc',
        name: 'Front desk',
        location: 'loc_123',
      });
      expect(created).toEqual({ id: 'dev_123', type: 'deskphone' });
    });
  });

  describe('devices.list', () => {
    it('forwards filters and the users expansion', async () => {
      mockEmptyList('/v1/devices');

      await dialstack.devices.list(
        { limit: 50, type: 'deskphone', location: 'loc_123', expand: ['users'] },
        acct
      );

      const query = new URL(requestedUrl()).searchParams;
      expect(query.getAll('expand[]')).toEqual(['users']);
      expect(query.get('type')).toBe('deskphone');
      expect(query.get('location')).toBe('loc_123');
      expect(query.get('limit')).toBe('50');
    });

    it('accepts button_template only on the single-device read', () => {
      // The list handler hydrates `users` only; a button_template expand there
      // would be silently ignored, so the list params must not offer it.
      const listExpand: DeviceListExpand[] = ['users'];
      const retrieveExpand: DeviceExpand[] = ['users', 'button_template'];
      expect(listExpand).not.toContain('button_template');
      expect(retrieveExpand).toContain('button_template');
    });
  });

  describe('devices.retrieve', () => {
    it('forwards expand', async () => {
      mockJSON({ id: 'dev_123', type: 'deskphone' });

      await dialstack.devices.retrieve('dev_123', { ...acct, expand: ['users'] });

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/devices/dev_123?expand%5B%5D=users');
    });

    it('exposes the expanded assignments', async () => {
      mockJSON({
        id: 'dev_123',
        type: 'deskphone',
        mac_address: '00:04:13:aa:bb:cc',
        vendor: 'snom',
        status: 'provisioned',
        registration_status: 'registered',
        last_registered_at: '2026-01-01T00:00:00Z',
        last_call_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        assignments: [
          {
            user: 'user_123',
            device: 'dev_123',
            line_number: 1,
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      });

      const device: Device = await dialstack.devices.retrieve('dev_123', {
        ...acct,
        expand: ['users'],
      });

      expect(device.assignments?.[0].line_number).toBe(1);
    });
  });

  describe('devices.update', () => {
    it('sends tri-state nulls to clear fields', async () => {
      mockJSON({ id: 'dev_123', type: 'deskphone' });

      await dialstack.devices.update(
        'dev_123',
        { name: null, location: null, button_template: 'btpl_123' },
        acct
      );

      expect(requestInit().method).toBe('POST');
      expect(JSON.parse(requestInit().body as string)).toEqual({
        name: null,
        location: null,
        button_template: 'btpl_123',
      });
    });
  });

  it('deletes a device', async () => {
    mockNoContent();

    await dialstack.devices.del('dev_123', acct);

    expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/devices/dev_123');
    expect(requestInit().method).toBe('DELETE');
  });

  describe('buttons', () => {
    it('lists compatible button templates', async () => {
      mockEmptyList('/v1/devices/dev_123/compatible_button_templates');

      await dialstack.devices.listCompatibleButtonTemplates('dev_123', { limit: 10 }, acct);

      expect(requestedUrl()).toBe(
        'https://api.dialstack.ai/v1/devices/dev_123/compatible_button_templates?limit=10'
      );
    });

    it('returns effective buttons as a non-paginating envelope', async () => {
      mockJSON({
        object: 'list',
        url: '/v1/devices/dev_123/buttons',
        next_page_url: null,
        previous_page_url: null,
        data: [
          {
            position: 1,
            label: 'Reception',
            type: 'blf_extension',
            target: { user: 'user_123' },
            source: 'template',
            compatibility: { supported: true },
          },
        ],
      });

      const buttons = await dialstack.devices.listButtons('dev_123', acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/devices/dev_123/buttons');
      expect(buttons.data[0].source).toBe('template');
      expect(buttons.data[0].compatibility.supported).toBe(true);
    });

    it('lists button overrides with pagination', async () => {
      mockEmptyList('/v1/devices/dev_123/button_overrides');

      await dialstack.devices.listButtonOverrides('dev_123', { limit: 5 }, acct);

      expect(requestedUrl()).toBe(
        'https://api.dialstack.ai/v1/devices/dev_123/button_overrides?limit=5'
      );
    });

    it('suppresses a position with an override', async () => {
      mockJSON({ id: 'dbo_1', position: 3, suppressed: true }, 201);

      await dialstack.devices.createButtonOverride(
        'dev_123',
        { position: 3, suppressed: true },
        acct
      );

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/devices/dev_123/button_overrides');
      expect(JSON.parse(requestInit().body as string)).toEqual({ position: 3, suppressed: true });
    });

    it('replaces a position with a type-narrowed override', async () => {
      mockJSON({ id: 'dbo_2', position: 4, suppressed: false }, 201);

      await dialstack.devices.createButtonOverride(
        'dev_123',
        { position: 4, label: 'Warehouse', type: 'speed_dial', target: { destination: '2001' } },
        acct
      );

      expect(JSON.parse(requestInit().body as string)).toEqual({
        position: 4,
        label: 'Warehouse',
        type: 'speed_dial',
        target: { destination: '2001' },
      });
    });

    it('deletes an override', async () => {
      mockNoContent();

      await dialstack.devices.delButtonOverride('dev_123', 'dbo_1', acct);

      expect(requestedUrl()).toBe(
        'https://api.dialstack.ai/v1/devices/dev_123/button_overrides/dbo_1'
      );
      expect(requestInit().method).toBe('DELETE');
    });
  });

  describe('user assignments', () => {
    it('assigns a user', async () => {
      mockJSON({ user: 'user_123', device: 'dev_123', created_at: '2026-01-01T00:00:00Z' }, 201);

      await dialstack.devices.assignUser('dev_123', { user: 'user_123' }, acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/devices/dev_123/users');
      expect(JSON.parse(requestInit().body as string)).toEqual({ user: 'user_123' });
    });

    it('lists assignments as a non-paginating envelope', async () => {
      mockJSON({
        object: 'list',
        url: '/v1/devices/dev_123/users',
        next_page_url: null,
        previous_page_url: null,
        data: [{ user: 'user_123', device: 'dev_123', created_at: '2026-01-01T00:00:00Z' }],
      });

      const assignments = await dialstack.devices.listUsers('dev_123', acct);

      expect(assignments.data).toHaveLength(1);
    });

    it('removes a user', async () => {
      mockNoContent();

      await dialstack.devices.removeUser('dev_123', 'user_123', acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/devices/dev_123/users/user_123');
      expect(requestInit().method).toBe('DELETE');
    });
  });

  describe('devices.checkSync', () => {
    it('sends an empty body by default', async () => {
      mockJSON({ success: true, lines_notified: 1, lines: [] });

      await dialstack.devices.checkSync('dev_123', undefined, acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/devices/dev_123/status/check-sync');
      expect(JSON.parse(requestInit().body as string)).toEqual({});
    });

    it('forwards reboot and reads the per-line outcome', async () => {
      mockJSON({
        success: true,
        lines_notified: 2,
        lines: [
          { line_number: 1, status: 'delivered' },
          { line_number: 0, status: 'delivered', management: true },
        ],
      });

      const result = await dialstack.devices.checkSync('dev_123', { reboot: true }, acct);

      expect(JSON.parse(requestInit().body as string)).toEqual({ reboot: true });
      expect(result.lines[1].management).toBe(true);
    });
  });
});
