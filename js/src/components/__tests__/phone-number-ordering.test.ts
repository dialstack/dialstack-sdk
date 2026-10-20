import '../phone-number-ordering';
import type { DialStackInstanceImpl, RoutingTarget } from '../../types/core';
import type { DIDItem } from '../../types/phone-numbers';
import type { AvailablePhoneNumber, NumberOrder } from '../../types/phone-number-ordering';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async () => {
  await flush();
  await flush();
  await flush();
};

const ORDERED = ['+15145551234', '+15145555678'];

function makeDID(overrides: Partial<DIDItem> = {}): DIDItem {
  return {
    id: 'did_' + overrides.phone_number,
    phone_number: '+15145551234',
    status: 'inactive',
    outbound_enabled: false,
    routing_target: null,
    created_at: '2026-06-03T17:49:00Z',
    updated_at: '2026-06-03T17:49:00Z',
    ...overrides,
  } as DIDItem;
}

/**
 * A test instance modelling the real server's create response: the order comes
 * back `complete` (or `pending`) with `completed_numbers` still empty — that
 * array is filled asynchronously later — while the ordered numbers' DIDs
 * already exist (inactive) and are listable/routable immediately.
 */
function makeInstance(
  updateRoute: jest.Mock,
  orderStatus: NumberOrder['status'] = 'complete',
  didsOverride?: DIDItem[]
) {
  const page = <T>(data: T[]) => ({ data, has_more: false, next_page_url: null });
  const dids = didsOverride ?? ORDERED.map((pn) => makeDID({ phone_number: pn }));
  const routingTargets: RoutingTarget[] = [
    { id: 'user_01alice', name: 'Alice Smith', type: 'user', extension_number: '1001' },
  ];
  const available: AvailablePhoneNumber[] = ORDERED.map((pn) => ({
    phone_number: pn,
    city: 'Montreal',
    state: 'QC',
    rate_center: 'MONTREAL',
    lata: '',
  }));

  return {
    getAppearance: () => undefined,
    availablePhoneNumbers: { search: jest.fn(async () => available) },
    routingTargets: jest.fn(async () => routingTargets),
    phoneNumbers: {
      list: jest.fn(async () => page(dids)),
      updateRoute,
    },
    phoneNumberOrders: {
      create: jest.fn(async (phoneNumbers: string[]): Promise<NumberOrder> => ({
        id: 'ord_01abc',
        order_type: 'purchase',
        status: orderStatus,
        phone_numbers: phoneNumbers,
        // The real API returns this empty and populates it later via a
        // carrier callback — the case the routing fix must not depend on.
        completed_numbers: [],
        failed_numbers: [],
        error_message: null,
        created_at: '2026-06-03T17:49:00Z',
        updated_at: '2026-06-03T17:49:00Z',
      })),
      // The poll path (`pollNext`) fetches the order until it reaches a terminal
      // status; return a resolved order so a pending order can advance.
      retrieve: jest.fn(async (): Promise<NumberOrder> => ({
        id: 'ord_01abc',
        order_type: 'purchase',
        status: 'complete',
        phone_numbers: ORDERED,
        completed_numbers: ORDERED,
        failed_numbers: [],
        error_message: null,
        created_at: '2026-06-03T17:49:00Z',
        updated_at: '2026-06-03T17:49:00Z',
      })),
    },
    fetchAllPages: async <T>(fetcher: (opts: { limit: number }) => Promise<{ data: T[] }>) =>
      (await fetcher({ limit: 100 })).data,
  } as unknown as DialStackInstanceImpl;
}

type OrderingEl = HTMLElement & {
  setInstance: (i: DialStackInstanceImpl) => void;
  shadowRoot: ShadowRoot;
};

async function mount(instance: DialStackInstanceImpl): Promise<OrderingEl> {
  const el = document.createElement('dialstack-phone-number-ordering') as OrderingEl;
  el.setInstance(instance);
  document.body.appendChild(el);
  await settle();
  return el;
}

const click = (el: OrderingEl, action: string) =>
  el.shadowRoot.querySelector<HTMLElement>(`[data-action="${action}"]`)?.click();

/** Drive search → results → select-all → confirm → route step. */
async function advanceToRouteStep(el: OrderingEl): Promise<void> {
  const input = el.shadowRoot.querySelector<HTMLInputElement>('#search-area-code');
  input!.value = '514';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  click(el, 'search');
  await settle();

  click(el, 'select-all');
  await settle();
  click(el, 'continue');
  await settle();
  click(el, 'continue-to-route');
  await settle();
}

async function placeOrder(el: OrderingEl): Promise<void> {
  click(el, 'place-order');
  await settle();
}

describe('PhoneNumberOrdering routing application', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('routes every ordered number to the chosen target even though completed_numbers is empty', async () => {
    const updateRoute = jest.fn(async () => makeDID());
    const el = await mount(makeInstance(updateRoute));

    await advanceToRouteStep(el);
    click(el, 'select-route-target'); // picks the single target (user_01alice)
    await settle();
    await placeOrder(el);

    const routed = updateRoute.mock.calls.map((c) => c[0]).sort();
    expect(routed).toEqual(['did_+15145551234', 'did_+15145555678']);
    for (const c of updateRoute.mock.calls) {
      expect(c[1]).toBe('user_01alice');
    }
  });

  it('applies routing once on a still-pending order and does not re-fire when polling resolves it', async () => {
    const updateRoute = jest.fn(async () => makeDID());
    const instance = makeInstance(updateRoute, 'pending');
    const el = await mount(instance);

    await advanceToRouteStep(el);
    click(el, 'select-route-target');
    await settle();

    // Fake timers must be installed BEFORE placing the order so the poll's
    // setTimeout (scheduled inside placeOrder → startPolling) is captured and
    // drivable. advanceTimersByTimeAsync also flushes the awaited create/route
    // microtasks.
    jest.useFakeTimers();
    try {
      click(el, 'place-order');
      await jest.advanceTimersByTimeAsync(0);

      // Routing fires immediately at placement — the pending order's inactive
      // DIDs already exist, so we don't wait for the poll to resolve it.
      expect(updateRoute).toHaveBeenCalledTimes(ORDERED.length);

      // Drive the poll path (pollNext): advancing past the interval runs the
      // retrieve → terminal-status transition this PR touched. Routing must NOT
      // re-fire — polling only advances the UI status now.
      await jest.advanceTimersByTimeAsync(2000);
      expect(instance.phoneNumberOrders.retrieve).toHaveBeenCalled();
      expect(updateRoute).toHaveBeenCalledTimes(ORDERED.length);
    } finally {
      jest.useRealTimers();
    }
  });

  it('routes nothing when "set up routing later" is chosen', async () => {
    const updateRoute = jest.fn(async () => makeDID());
    const el = await mount(makeInstance(updateRoute));

    await advanceToRouteStep(el);
    click(el, 'route-skip'); // "route later" → null target
    await settle();
    await placeOrder(el);

    expect(updateRoute).not.toHaveBeenCalled();
  });

  it('routes the live DID, not a lingering released row, for a reacquired number', async () => {
    // A reacquired number can have both a stale released DID and a fresh
    // active/inactive one. list() is newest-first, so the live row comes first;
    // routing must target it, not the released row (which would 404).
    const phone = ORDERED[0];
    const updateRoute = jest.fn(async () => makeDID());
    const el = await mount(
      makeInstance(updateRoute, 'complete', [
        makeDID({ id: 'did_live', phone_number: phone, status: 'inactive' }),
        makeDID({ id: 'did_released', phone_number: phone, status: 'released' }),
      ])
    );

    await advanceToRouteStep(el);
    click(el, 'select-route-target');
    await settle();
    await placeOrder(el);

    const routedIds = updateRoute.mock.calls.map((c) => c[0]);
    expect(routedIds).toContain('did_live');
    expect(routedIds).not.toContain('did_released');
  });
});

type CallbackEl = OrderingEl & {
  setOnOrderComplete: (cb: (e: unknown) => void) => void;
  setOnOrderError: (cb: (e: unknown) => void) => void;
  setOnOrderPending: (cb: (e: unknown) => void) => void;
  setOnLoadError: (cb: (e: unknown) => void) => void;
};

/** What `instance.ts` throws for a non-2xx response; built by hand to keep the
 * test off the network layer. */
function apiError(
  status: number,
  message: string,
  code?: string,
  details?: Record<string, unknown>
): Error {
  return Object.assign(new Error(message), { name: 'ApiError', status, code, details });
}

const pendingOrder = (): NumberOrder => ({
  id: 'ord_01abc',
  order_type: 'purchase',
  status: 'pending',
  phone_numbers: ORDERED,
  completed_numbers: [],
  failed_numbers: [],
  error_message: null,
  created_at: '2026-06-03T17:49:00Z',
  updated_at: '2026-06-03T17:49:00Z',
});

const text = (el: OrderingEl) => el.shadowRoot.textContent ?? '';

describe('PhoneNumberOrdering errors', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('shows a translated message for a known conflict code and hands the host the code', async () => {
    const instance = makeInstance(jest.fn());
    const raw = 'phone number limit reached: 25 of 25 in use';
    (instance.phoneNumberOrders.create as jest.Mock).mockRejectedValue(
      apiError(409, raw, 'phone_number_limit_exceeded')
    );
    const el = (await mount(instance)) as CallbackEl;
    const onOrderError = jest.fn();
    el.setOnOrderError(onOrderError);

    await advanceToRouteStep(el);
    await placeOrder(el);

    expect(text(el)).toContain('Order Failed');
    expect(text(el)).toContain("You've reached the number of phone numbers this account can hold");
    expect(text(el)).not.toContain(raw);
    expect(onOrderError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'phone_number_limit_exceeded',
        status: 409,
        error: expect.not.stringContaining(raw),
      })
    );
  });

  it('falls back to a generic message rather than the raw response', async () => {
    const instance = makeInstance(jest.fn());
    const raw = 'Failed to create phone number order: 500 {"error":"boom"}';
    (instance.phoneNumberOrders.create as jest.Mock).mockRejectedValue(apiError(500, raw));
    const el = (await mount(instance)) as CallbackEl;
    const onOrderError = jest.fn();
    el.setOnOrderError(onOrderError);

    await advanceToRouteStep(el);
    await placeOrder(el);

    expect(text(el)).toContain("We couldn't place your order.");
    expect(text(el)).not.toContain('boom');
    expect(onOrderError).toHaveBeenCalledWith(
      // The API's text reaches the host for its logs, never the screen.
      expect.objectContaining({ status: 500, code: undefined, message: raw })
    );
  });

  it('gives a failed search its own title instead of "Order Failed"', async () => {
    const instance = makeInstance(jest.fn());
    (instance.availablePhoneNumbers.search as jest.Mock).mockRejectedValue(
      apiError(502, 'Failed to search available phone numbers')
    );
    const el = (await mount(instance)) as CallbackEl;
    const onLoadError = jest.fn();
    const onOrderError = jest.fn();
    el.setOnLoadError(onLoadError);
    el.setOnOrderError(onOrderError);

    await advanceToRouteStep(el);

    expect(text(el)).toContain('Search Failed');
    expect(text(el)).not.toContain('Order Failed');
    expect(text(el)).toContain("Number search isn't available right now.");
    expect(onLoadError).toHaveBeenCalled();
    expect(onOrderError).not.toHaveBeenCalled();
  });

  it('tells the user to fix a search the API rejected', async () => {
    const instance = makeInstance(jest.fn());
    (instance.availablePhoneNumbers.search as jest.Mock).mockRejectedValue(
      apiError(400, 'invalid area code')
    );
    const el = await mount(instance);

    await advanceToRouteStep(el);

    expect(text(el)).toContain('Search Failed');
    expect(text(el)).toContain('Check it and try again.');
    expect(text(el)).not.toContain('invalid area code');
  });
});

describe('PhoneNumberOrdering search error codes', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  async function searchFailingWith(err: Error) {
    const instance = makeInstance(jest.fn());
    (instance.availablePhoneNumbers.search as jest.Mock).mockRejectedValue(err);
    const el = await mount(instance);
    await advanceToRouteStep(el);
    return el;
  }

  it('names the ZIP code the search does not cover, in its own words', async () => {
    const raw = 'No phone numbers are available for ZIP code 78702. Try a nearby ZIP code.';
    const el = await searchFailingWith(apiError(400, raw, 'zip_not_available', { zip: '78702' }));

    expect(text(el)).toContain('Search Failed');
    expect(text(el)).toContain('No numbers are available for ZIP code 78702.');
    expect(text(el)).not.toContain(raw);
  });

  it('treats an unavailable search as unavailable, not as bad input', async () => {
    const el = await searchFailingWith(
      apiError(503, 'Phone number search is not available', 'search_unavailable')
    );

    expect(text(el)).toContain("Number search isn't available right now.");
    expect(text(el)).not.toContain('Check it and try again.');
  });

  it('asks the user to change a rejected search', async () => {
    const el = await searchFailingWith(
      apiError(400, 'The search parameters were not accepted.', 'search_rejected')
    );

    expect(text(el)).toContain('Check it and try again.');
    expect(text(el)).not.toContain('not accepted');
  });
});

describe('PhoneNumberOrdering slow orders', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  async function placePendingOrder(instance: DialStackInstanceImpl) {
    const el = (await mount(instance)) as CallbackEl;
    const callbacks = {
      complete: jest.fn(),
      error: jest.fn(),
      pending: jest.fn(),
    };
    el.setOnOrderComplete(callbacks.complete);
    el.setOnOrderError(callbacks.error);
    el.setOnOrderPending(callbacks.pending);
    await advanceToRouteStep(el);
    jest.useFakeTimers();
    click(el, 'place-order');
    await jest.advanceTimersByTimeAsync(0);
    return { el, callbacks };
  }

  it('fires onOrderPending and says so once polling gives up on a pending order', async () => {
    const instance = makeInstance(
      jest.fn(async () => makeDID()),
      'pending'
    );
    (instance.phoneNumberOrders.retrieve as jest.Mock).mockImplementation(async () =>
      pendingOrder()
    );
    const { el, callbacks } = await placePendingOrder(instance);

    expect(text(el)).not.toContain('taking longer than usual');

    await jest.advanceTimersByTimeAsync(2000 * 5);

    expect(instance.phoneNumberOrders.retrieve).toHaveBeenCalledTimes(5);
    expect(callbacks.pending).toHaveBeenCalledTimes(1);
    expect(callbacks.pending).toHaveBeenCalledWith({
      orderId: 'ord_01abc',
      order: expect.objectContaining({ status: 'pending' }),
    });
    expect(callbacks.complete).not.toHaveBeenCalled();
    expect(callbacks.error).not.toHaveBeenCalled();
    expect(text(el)).toContain('taking longer than usual');
    expect(text(el)).not.toContain('Checking order status');

    // Polling is over: no further checks or callbacks.
    await jest.advanceTimersByTimeAsync(2000 * 5);
    expect(instance.phoneNumberOrders.retrieve).toHaveBeenCalledTimes(5);
    expect(callbacks.pending).toHaveBeenCalledTimes(1);
  });

  it('reports a pending order, not an error, when a status check fails', async () => {
    const instance = makeInstance(
      jest.fn(async () => makeDID()),
      'pending'
    );
    (instance.phoneNumberOrders.retrieve as jest.Mock).mockRejectedValue(
      apiError(503, 'unavailable')
    );
    const { el, callbacks } = await placePendingOrder(instance);

    await jest.advanceTimersByTimeAsync(2000);

    expect(callbacks.pending).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'ord_01abc' })
    );
    expect(callbacks.error).not.toHaveBeenCalled();
    expect(text(el)).toContain('taking longer than usual');
  });

  it('does not report a pending order when the host onOrderComplete throws', async () => {
    const instance = makeInstance(
      jest.fn(async () => makeDID()),
      'pending'
    );
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { el, callbacks } = await placePendingOrder(instance);
    callbacks.complete.mockImplementation(() => {
      throw new Error('host bug');
    });

    await jest.advanceTimersByTimeAsync(2000);

    expect(callbacks.complete).toHaveBeenCalledTimes(1);
    expect(callbacks.pending).not.toHaveBeenCalled();
    expect(callbacks.error).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    expect(text(el)).not.toContain('taking longer than usual');
    expect(text(el)).not.toContain('Order Failed');
  });

  it('ignores a status check that lands after the user started over', async () => {
    const instance = makeInstance(
      jest.fn(async () => makeDID()),
      'pending'
    );
    let resolveRetrieve: (order: NumberOrder) => void = () => {};
    (instance.phoneNumberOrders.retrieve as jest.Mock).mockImplementation(
      () => new Promise<NumberOrder>((resolve) => (resolveRetrieve = resolve))
    );
    const { el, callbacks } = await placePendingOrder(instance);

    await jest.advanceTimersByTimeAsync(2000); // the check is now in flight
    expect(instance.phoneNumberOrders.retrieve).toHaveBeenCalledTimes(1);
    click(el, 'order-more');
    resolveRetrieve({ ...pendingOrder(), status: 'complete' });
    await jest.advanceTimersByTimeAsync(2000 * 5);

    expect(callbacks.complete).not.toHaveBeenCalled();
    expect(callbacks.pending).not.toHaveBeenCalled();
    expect(instance.phoneNumberOrders.retrieve).toHaveBeenCalledTimes(1);
    // Still on the fresh search step, not pulled back to the abandoned order.
    expect(el.shadowRoot.querySelector('#search-area-code')).not.toBeNull();
  });

  it('fires onOrderError with the order when polling finds it failed', async () => {
    const instance = makeInstance(
      jest.fn(async () => makeDID()),
      'pending'
    );
    (instance.phoneNumberOrders.retrieve as jest.Mock).mockImplementation(async () => ({
      ...pendingOrder(),
      status: 'failed',
    }));
    const { el, callbacks } = await placePendingOrder(instance);

    await jest.advanceTimersByTimeAsync(2000);

    expect(callbacks.error).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'The carrier was unable to fulfill your order.',
        order: expect.objectContaining({ status: 'failed' }),
      })
    );
    expect(callbacks.pending).not.toHaveBeenCalled();
    expect(text(el)).toContain('Order Failed');
  });
});
