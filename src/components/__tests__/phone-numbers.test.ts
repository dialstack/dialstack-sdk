import '../phone-numbers';
import type { DialStackInstanceImpl } from '../../types/core';
import type { DIDItem, PhoneNumberRowClickEvent } from '../../types/phone-numbers';
import type { NumberOrder, PortOrder } from '../../types/phone-number-ordering';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeDID(overrides: Partial<DIDItem> = {}): DIDItem {
  return {
    id: 'did_01abc',
    phone_number: '+15145551234',
    status: 'inactive',
    outbound_enabled: false,
    routing_target: null,
    created_at: '2026-06-03T17:49:00Z',
    updated_at: '2026-06-03T17:49:00Z',
    ...overrides,
  } as DIDItem;
}

function makeOrder(overrides: Partial<NumberOrder> = {}): NumberOrder {
  return {
    id: 'ord_01abc',
    order_type: 'purchase',
    status: 'pending',
    phone_numbers: ['+15145551234'],
    completed_numbers: [],
    failed_numbers: [],
    error_message: null,
    created_at: '2026-06-03T17:49:00Z',
    updated_at: '2026-06-03T17:49:00Z',
    ...overrides,
  } as NumberOrder;
}

function makePort(overrides: Partial<PortOrder> = {}): PortOrder {
  return {
    id: 'port_01abc',
    status: 'submitted',
    details: {
      phone_numbers: ['+15145551234'],
      requested_foc_date: '2026-06-20',
    },
    submitted_at: '2026-06-03T17:49:00Z',
    created_at: '2026-06-03T17:49:00Z',
    updated_at: '2026-06-03T17:49:00Z',
    ...overrides,
  } as PortOrder;
}

function makeInstance(dids: DIDItem[], orders: NumberOrder[], ports: PortOrder[] = []) {
  const page = <T>(data: T[]) => ({ data, has_more: false, next_page_url: null });
  return {
    getAppearance: () => undefined,
    phoneNumbers: { list: jest.fn(async () => page(dids)) },
    phoneNumberOrders: { list: jest.fn(async () => page(orders)) },
    portOrders: { list: jest.fn(async () => page(ports)) },
    resolveRoutingTarget: jest.fn(async () => null),
  } as unknown as DialStackInstanceImpl;
}

type PhoneNumbersEl = HTMLElement & {
  setInstance: (i: DialStackInstanceImpl) => void;
  setOnRowClick: (cb: (event: PhoneNumberRowClickEvent) => void) => void;
  shadowRoot: ShadowRoot;
};

async function mount(instance: DialStackInstanceImpl): Promise<PhoneNumbersEl> {
  const el = document.createElement('dialstack-phone-numbers') as PhoneNumbersEl;
  el.setInstance(instance);
  document.body.appendChild(el);
  // Let the parallel fetches and render settle
  await flush();
  await flush();
  await flush();
  return el;
}

function clickFilter(el: PhoneNumbersEl, filter: string) {
  const tab = el.shadowRoot.querySelector<HTMLButtonElement>(
    `.segment-btn[data-filter="${filter}"]`
  );
  expect(tab).not.toBeNull();
  tab!.click();
}

function rowsText(el: PhoneNumbersEl): string {
  return el.shadowRoot.querySelector('tbody')?.textContent ?? '';
}

function routingCell(el: PhoneNumbersEl, phone: string): HTMLElement | null {
  return el.shadowRoot.querySelector<HTMLElement>(`td.routing-cell[data-routing-phone="${phone}"]`);
}

describe('PhoneNumbersComponent merge', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('shows a pre-created inactive DID with a pending order under In Progress, not Cancelled', async () => {
    const el = await mount(makeInstance([makeDID()], [makeOrder()]));

    clickFilter(el, 'cancelled');
    expect(rowsText(el)).not.toContain('555-1234');

    clickFilter(el, 'in_progress');
    expect(rowsText(el)).toContain('555-1234');
    expect(rowsText(el)).toContain('Ordering');
  });

  it('keeps a genuinely inactive DID (no pending order) under Cancelled', async () => {
    const el = await mount(makeInstance([makeDID()], []));

    clickFilter(el, 'cancelled');
    expect(rowsText(el)).toContain('555-1234');

    clickFilter(el, 'in_progress');
    expect(rowsText(el)).not.toContain('555-1234');
  });

  it('keeps a re-ported number under In Progress when a released DID lingers from a cancelled order', async () => {
    // A combined order was cancelled (leaving a `released` DID behind) and the
    // number was re-submitted in a new port order (with a fresh `inactive`
    // backing DID). The stale released DID must not mask the active port —
    // otherwise the number shows under Cancelled and the in-flight port (here
    // an exception needing customer action) is hidden.
    const el = await mount(
      makeInstance(
        [
          makeDID({ id: 'did_released', status: 'released' }),
          makeDID({ id: 'did_inactive', status: 'inactive' }),
        ],
        [],
        [makePort({ status: 'exception' })]
      )
    );

    clickFilter(el, 'cancelled');
    expect(rowsText(el)).not.toContain('555-1234');

    clickFilter(el, 'in_progress');
    expect(rowsText(el)).toContain('555-1234');
    // ...and with the port's own status, not a stray order row — the whole
    // point is surfacing the exception that needs customer action.
    expect(rowsText(el)).toContain('Port Issue');
  });

  it('shows a re-ported number under Active once the port completes, despite a lingering released DID', async () => {
    // The re-port from the previous case has now completed: the inactive backing
    // DID was activated, but the stale `released` DID from the cancelled order
    // still lingers (port completion does not clean it up). With no in-flight
    // order, the released DID must still be superseded by the live `active` DID —
    // otherwise the number is stuck under Cancelled and cannot be routed.
    const el = await mount(
      makeInstance(
        [
          makeDID({ id: 'did_released', status: 'released' }),
          makeDID({ id: 'did_active', status: 'active' }),
        ],
        [],
        [makePort({ status: 'complete' })]
      )
    );

    clickFilter(el, 'cancelled');
    expect(rowsText(el)).not.toContain('555-1234');

    clickFilter(el, 'active');
    expect(rowsText(el)).toContain('555-1234');
  });

  it('shows the DID (not the order row) once its number is in completed_numbers', async () => {
    const el = await mount(
      makeInstance(
        [makeDID({ status: 'active' })],
        [makeOrder({ status: 'partial', completed_numbers: ['+15145551234'] })]
      )
    );

    clickFilter(el, 'active');
    expect(rowsText(el)).toContain('555-1234');

    clickFilter(el, 'in_progress');
    expect(rowsText(el)).not.toContain('555-1234');
  });

  it('surfaces the routing target pre-assigned to an in-progress port number', async () => {
    const el = await mount(
      makeInstance([makeDID({ routing_target: 'vapp_01abc' })], [], [makePort()])
    );
    el.setOnRowClick(() => {});

    clickFilter(el, 'in_progress');
    const target = el.shadowRoot.querySelector('tbody dialstack-routing-target');
    expect(target?.getAttribute('target')).toBe('vapp_01abc');
  });

  it('lets an in-progress port row be routed: routing cell deep-links via section=routing with the backing DID id', async () => {
    const el = await mount(makeInstance([makeDID({ routing_target: null })], [], [makePort()]));
    const events: PhoneNumberRowClickEvent[] = [];
    el.setOnRowClick((e) => events.push(e));

    clickFilter(el, 'in_progress');

    const cell = routingCell(el, '+15145551234');
    expect(cell).not.toBeNull();
    expect(cell?.textContent).toContain('Set routing');

    cell!.click();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      section: 'routing',
      item: { did_id: 'did_01abc', port_order_id: 'port_01abc', source: 'port_order' },
    });
  });

  it('the row body of an in-progress port targets the port detail (section=detail)', async () => {
    const el = await mount(makeInstance([makeDID()], [], [makePort()]));
    const events: PhoneNumberRowClickEvent[] = [];
    el.setOnRowClick((e) => events.push(e));

    clickFilter(el, 'in_progress');
    el.shadowRoot.querySelector<HTMLElement>('tbody tr[data-phone]')?.click();

    expect(events[0]?.section).toBe('detail');
    expect(events[0]?.item.port_order_id).toBe('port_01abc');
  });

  it('re-renders so the routing cell becomes actionable when onRowClick is wired after load', async () => {
    const el = await mount(makeInstance([makeDID({ routing_target: null })], [], [makePort()]));

    clickFilter(el, 'in_progress');
    // No handler wired yet → the cell is inert (no listener, no marker).
    expect(routingCell(el, '+15145551234')).toBeNull();

    // Wiring the handler must trigger a re-render that marks the cell routable,
    // without waiting for an unrelated filter/paginate re-render.
    el.setOnRowClick(() => {});
    expect(routingCell(el, '+15145551234')).not.toBeNull();
  });

  it('carries the backing DID id and routing target onto an in-progress number-order row', async () => {
    const el = await mount(makeInstance([makeDID({ routing_target: 'rg_01abc' })], [makeOrder()]));
    const events: PhoneNumberRowClickEvent[] = [];
    el.setOnRowClick((e) => events.push(e));

    clickFilter(el, 'in_progress');
    routingCell(el, '+15145551234')?.click();

    expect(events[0]).toMatchObject({
      section: 'routing',
      item: { did_id: 'did_01abc', source: 'number_order' },
    });
    expect(events[0]?.item.port_order_id).toBeUndefined();
  });
});
