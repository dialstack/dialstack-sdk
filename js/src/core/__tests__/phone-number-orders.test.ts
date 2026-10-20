import { DialStackInstanceImplClass, isApiError } from '../instance';

function instanceAnswering(status: number, body: string): DialStackInstanceImplClass {
  const instance = new DialStackInstanceImplClass({
    publishableKey: 'pk_test_x',
    fetchClientSecret: async () => ({ client_secret: 's', expires_at: 0 }),
  });
  instance.fetchApi = async () =>
    ({ ok: false, status, text: async () => body }) as unknown as Response;
  return instance;
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected a rejection');
}

describe('phoneNumberOrders.create', () => {
  it('rejects with an ApiError carrying the code, not the raw body', async () => {
    const instance = instanceAnswering(
      409,
      JSON.stringify({ error: 'phone number limit reached', code: 'phone_number_limit_exceeded' })
    );

    const err = await rejectionOf(instance.phoneNumberOrders.create(['+15145551234']));

    expect(isApiError(err)).toBe(true);
    expect(err).toMatchObject({
      status: 409,
      code: 'phone_number_limit_exceeded',
      message: 'phone number limit reached',
    });
  });

  it('keeps the details a claimed-numbers conflict sends', async () => {
    const details = { phone_numbers: ['+15145551234'] };
    const instance = instanceAnswering(
      409,
      JSON.stringify({ error: 'taken', code: 'phone_numbers_already_claimed', details })
    );

    const err = await rejectionOf(instance.phoneNumberOrders.create(['+15145551234']));

    expect(err).toMatchObject({ code: 'phone_numbers_already_claimed', details });
  });
});

describe('phoneNumberOrders.retrieve', () => {
  it('rejects with an ApiError', async () => {
    const instance = instanceAnswering(404, JSON.stringify({ error: 'not found' }));

    const err = await rejectionOf(instance.phoneNumberOrders.retrieve('order_1'));

    expect(isApiError(err)).toBe(true);
    expect(err).toMatchObject({ status: 404, message: 'not found' });
  });
});

describe('availablePhoneNumbers.search', () => {
  it('rejects with an ApiError whose message is the API error text', async () => {
    const instance = instanceAnswering(400, JSON.stringify({ error: 'invalid area code' }));

    const err = await rejectionOf(instance.availablePhoneNumbers.search({ areaCode: '0' }));

    expect(isApiError(err)).toBe(true);
    expect(err).toMatchObject({ status: 400, message: 'invalid area code' });
  });
});
