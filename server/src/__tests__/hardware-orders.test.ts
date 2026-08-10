import { DialStack, type Device, type HardwareOrder } from '../index.js';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Hardware orders', () => {
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

  function requestedUrl(): string {
    return mockFetch.mock.calls[0][0];
  }

  function requestInit(): { method: string; body?: string } {
    return mockFetch.mock.calls[0][1];
  }

  it('creates an order from quantities', async () => {
    mockJSON({ id: 'hwo_123', status: 'submitted', items: [] }, 201);

    await dialstack.hardwareOrders.create(
      { items: [{ hardware_catalog: 'hwc_1', quantity: 3 }] },
      acct
    );

    expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/hardware-orders');
    expect(JSON.parse(requestInit().body as string)).toEqual({
      items: [{ hardware_catalog: 'hwc_1', quantity: 3 }],
    });
  });

  describe('hardwareOrders.list', () => {
    it('forwards the location filter and expand', async () => {
      mockJSON({ object: 'list', url: '/v1/hardware-orders', data: [] });

      await dialstack.hardwareOrders.list({ location: 'loc_123', expand: ['items.device'] }, acct);

      expect(requestedUrl()).toBe(
        'https://api.dialstack.ai/v1/hardware-orders?location=loc_123&expand%5B%5D=items.device'
      );
    });

    it('returns a plain envelope, since the API emits no page URLs', async () => {
      mockJSON({
        object: 'list',
        url: '/v1/hardware-orders',
        data: [{ id: 'hwo_123', status: 'submitted', rejection_reason: null, items: [] }],
      });

      const orders = await dialstack.hardwareOrders.list(undefined, acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/hardware-orders');
      expect(orders.data[0].id).toBe('hwo_123');
    });
  });

  describe('hardwareOrders.retrieve', () => {
    it('forwards expand', async () => {
      mockJSON({ id: 'hwo_123' });

      await dialstack.hardwareOrders.retrieve('hwo_123', {
        ...acct,
        expand: ['items.device'],
      });

      expect(requestedUrl()).toBe(
        'https://api.dialstack.ai/v1/hardware-orders/hwo_123?expand%5B%5D=items.device'
      );
    });

    it('narrows an expanded item device to the full object', async () => {
      mockJSON({
        id: 'hwo_123',
        status: 'fulfilled',
        rejection_reason: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        items: [
          {
            id: 'hwoi_1',
            user: 'user_123',
            location: null,
            base_item: null,
            device: { id: 'dev_123', type: 'deskphone', mac_address: '00:04:13:aa:bb:cc' },
            fulfilled_at: '2026-01-02T00:00:00Z',
            hardware_catalog: {
              id: 'hwc_1',
              manufacturer: 'SNOM',
              model: 'M500',
              sku: null,
              device_type: 'dect_base',
              active: true,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
      });

      const order: HardwareOrder = await dialstack.hardwareOrders.retrieve('hwo_123', {
        ...acct,
        expand: ['items.device'],
      });

      expect((order.items[0].device as Device).mac_address).toBe('00:04:13:aa:bb:cc');
      expect(order.items[0].hardware_catalog.model).toBe('M500');
    });
  });

  it('replaces the order items', async () => {
    mockJSON({ id: 'hwo_123', status: 'draft', items: [] });

    await dialstack.hardwareOrders.update(
      'hwo_123',
      { items: [{ hardware_catalog: 'hwc_2', quantity: 1 }] },
      acct
    );

    expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/hardware-orders/hwo_123');
    expect(requestInit().method).toBe('POST');
  });

  describe('hardwareOrders.updateItem', () => {
    it('sets a unit assignment', async () => {
      mockJSON({ id: 'hwoi_1', user: 'user_123' });

      await dialstack.hardwareOrders.updateItem(
        'hwo_123',
        'hwoi_1',
        { user: 'user_123', location: 'loc_1' },
        acct
      );

      expect(requestedUrl()).toBe(
        'https://api.dialstack.ai/v1/hardware-orders/hwo_123/items/hwoi_1'
      );
      expect(JSON.parse(requestInit().body as string)).toEqual({
        user: 'user_123',
        location: 'loc_1',
      });
    });

    it('clears a unit assignment with an explicit null', async () => {
      mockJSON({ id: 'hwoi_1', user: null });

      await dialstack.hardwareOrders.updateItem('hwo_123', 'hwoi_1', { user: null }, acct);

      expect(JSON.parse(requestInit().body as string)).toEqual({ user: null });
    });
  });
});
