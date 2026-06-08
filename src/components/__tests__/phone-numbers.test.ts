import '../phone-numbers';
import type { DialStackInstanceImpl } from '../../types/core';
import type { DIDItem } from '../../types/phone-numbers';
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

describe('PhoneNumbersComponent merge (DIA-1390)', () => {
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
});
