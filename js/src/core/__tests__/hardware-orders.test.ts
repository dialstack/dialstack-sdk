import { DialStackInstanceImplClass } from '../instance';

function recordingInstance(status = 200, body: unknown = { id: 'hwo_1' }) {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const instance = new DialStackInstanceImplClass({
    publishableKey: 'pk_test_x',
    fetchClientSecret: async () => ({ client_secret: 's', expires_at: 0 }),
  });
  instance.fetchApi = async (path: string, init?: RequestInit) => {
    calls.push([path, init]);
    return {
      ok: status < 400,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  };
  return { instance, calls };
}

describe('hardwareOrders', () => {
  it('submits a draft for approval', async () => {
    const { instance, calls } = recordingInstance();

    await instance.hardwareOrders.submitForApproval('hwo_1');

    expect(calls[0][0]).toBe('/v1/hardware-orders/hwo_1/submit-for-approval');
    expect(calls[0][1]?.method).toBe('POST');
  });

  it('approves an order', async () => {
    const { instance, calls } = recordingInstance();

    await instance.hardwareOrders.approve('hwo_1');

    expect(calls[0][0]).toBe('/v1/hardware-orders/hwo_1/approve');
    expect(calls[0][1]?.method).toBe('POST');
  });

  it('declines an order with its reason', async () => {
    const { instance, calls } = recordingInstance();

    await instance.hardwareOrders.decline('hwo_1', 'Wrong phones');

    expect(calls[0][0]).toBe('/v1/hardware-orders/hwo_1/decline');
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ reason: 'Wrong phones' });
  });

  it('lists and retrieves orders', async () => {
    const { instance, calls } = recordingInstance(200, { object: 'list', data: [] });

    await instance.hardwareOrders.list();
    await instance.hardwareOrders.retrieve('hwo_1');

    expect(calls[0][0]).toBe('/v1/hardware-orders');
    expect(calls[1][0]).toBe('/v1/hardware-orders/hwo_1');
  });

  it('surfaces the API error code on a refusal', async () => {
    const { instance } = recordingInstance(409, {
      error: 'hardware order approval is out of order',
      code: 'hardware_order_approval_out_of_order',
    });

    await expect(instance.hardwareOrders.approve('hwo_1')).rejects.toMatchObject({
      status: 409,
      code: 'hardware_order_approval_out_of_order',
    });
  });

  it('creates a draft from catalog lines', async () => {
    const { instance, calls } = recordingInstance();

    await instance.hardwareOrders.create({ items: [{ hardware_catalog: 'hwc_1', quantity: 2 }] });

    expect(calls[0][0]).toBe('/v1/hardware-orders');
    expect(calls[0][1]?.method).toBe('POST');
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({
      items: [{ hardware_catalog: 'hwc_1', quantity: 2 }],
    });
  });

  it('updates only the fields given', async () => {
    const { instance, calls } = recordingInstance();

    await instance.hardwareOrders.update('hwo_1', {
      shipping_quote: 'shq_1',
      shipping_method: 'ground',
    });

    expect(calls[0][0]).toBe('/v1/hardware-orders/hwo_1');
    expect(calls[0][1]?.method).toBe('POST');
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({
      shipping_quote: 'shq_1',
      shipping_method: 'ground',
    });
  });

  it('deletes a draft', async () => {
    const { instance, calls } = recordingInstance(204, null);

    await instance.hardwareOrders.del('hwo_1');

    expect(calls[0][0]).toBe('/v1/hardware-orders/hwo_1');
    expect(calls[0][1]?.method).toBe('DELETE');
  });

  it('creates and retrieves a shipping quote', async () => {
    const { instance, calls } = recordingInstance(200, { id: 'shq_1', options: [] });

    await instance.hardwareOrders.shippingQuotes.create('hwo_1');
    await instance.hardwareOrders.shippingQuotes.retrieve('hwo_1', 'shq_1');

    expect(calls[0][0]).toBe('/v1/hardware-orders/hwo_1/shipping-quotes');
    expect(calls[0][1]?.method).toBe('POST');
    expect(calls[1][0]).toBe('/v1/hardware-orders/hwo_1/shipping-quotes/shq_1');
  });
});

describe('hardwareCatalog', () => {
  it('lists the catalog', async () => {
    const { instance, calls } = recordingInstance(200, { object: 'list', data: [] });

    await instance.hardwareCatalog.list();

    expect(calls[0][0]).toBe('/v1/catalog');
  });
});
