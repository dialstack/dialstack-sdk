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
