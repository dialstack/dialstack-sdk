/**
 * Dev harness for PhoneNumberOrdering component.
 * Mock API — no backend required.
 *
 * Run:  cd sdk && npx vite serve dev
 */

// Side-effect import: registers the <dialstack-phone-number-ordering> custom element
import '../src/components/phone-number-ordering';

import type { AvailablePhoneNumber, NumberOrder, SearchAvailableNumbersOptions } from '../src/types';
import type { DialStackInstanceImpl } from '../src/types/core';
import type { AppearanceOptions } from '../src/types/appearance';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_NUMBERS: AvailablePhoneNumber[] = [
  { phone_number: '+12125551001', city: 'New York', state: 'NY', rate_center: 'NWYRCYZN01', lata: '132' },
  { phone_number: '+12125551002', city: 'New York', state: 'NY', rate_center: 'NWYRCYZN01', lata: '132' },
  { phone_number: '+12125551003', city: 'New York', state: 'NY', rate_center: 'NWYRCYZN01', lata: '132' },
  { phone_number: '+12125551004', city: 'Brooklyn', state: 'NY', rate_center: 'BRKLYN', lata: '132' },
  { phone_number: '+12125551005', city: 'Brooklyn', state: 'NY', rate_center: 'BRKLYN', lata: '132' },
  { phone_number: '+14155550101', city: 'San Francisco', state: 'CA', rate_center: 'SNFCCA01', lata: '722' },
  { phone_number: '+14155550102', city: 'San Francisco', state: 'CA', rate_center: 'SNFCCA01', lata: '722' },
  { phone_number: '+13105550201', city: 'Los Angeles', state: 'CA', rate_center: 'LSAN DA01', lata: '730' },
  { phone_number: '+13105550202', city: 'Los Angeles', state: 'CA', rate_center: 'LSAN DA01', lata: '730' },
  { phone_number: '+17735550301', city: 'Chicago', state: 'IL', rate_center: 'CHCGIL01', lata: '358' },
];

// Track mock orders so GET can return updated status
const mockOrders = new Map<string, NumberOrder>();

function mockOrder(phoneNumbers: string[]): NumberOrder {
  const order: NumberOrder = {
    id: 'ord_' + Math.random().toString(36).slice(2, 10),
    order_type: 'purchase',
    status: 'pending',
    phone_numbers: phoneNumbers,
    completed_numbers: [],
    failed_numbers: [],
    error_message: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  mockOrders.set(order.id, order);

  // Simulate carrier fulfillment after ~4 seconds
  setTimeout(() => {
    order.status = 'complete';
    order.completed_numbers = phoneNumbers;
    order.updated_at = new Date().toISOString();
  }, 4000);

  return order;
}

// ---------------------------------------------------------------------------
// Mock DialStack instance
// ---------------------------------------------------------------------------

let currentAppearance: AppearanceOptions = { theme: 'light' };

function createMockInstance(): DialStackInstanceImpl {
  const delay = () => new Promise((r) => setTimeout(r, 600 + Math.random() * 400));

  return {
    getAppearance: () => currentAppearance,

    searchAvailableNumbers: async (options: SearchAvailableNumbersOptions) => {
      await delay();
      const quantity = options.quantity || 10;
      return MOCK_NUMBERS.slice(0, Math.min(quantity, MOCK_NUMBERS.length));
    },

    createPhoneNumberOrder: async (phoneNumbers: string[]) => {
      await delay();
      return mockOrder(phoneNumbers);
    },

    getPhoneNumberOrder: async (orderId: string) => {
      await delay();
      const order = mockOrders.get(orderId);
      if (!order) throw new Error(`Order ${orderId} not found`);
      return order;
    },

    fetchApi: async () => {
      return new Response('Not found', { status: 404 });
    },
  } as unknown as DialStackInstanceImpl;
}

// ---------------------------------------------------------------------------
// Mount component
// ---------------------------------------------------------------------------

const container = document.getElementById('container')!;
const el = document.createElement('dialstack-phone-number-ordering') as HTMLElement & {
  setInstance: (i: DialStackInstanceImpl) => void;
};
el.setInstance(createMockInstance());
container.appendChild(el);

// ---------------------------------------------------------------------------
// Theme toggle
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    setTheme: (theme: 'light' | 'dark') => void;
  }
}

window.setTheme = (theme: 'light' | 'dark') => {
  currentAppearance = { theme };

  // Update wrapper background
  const wrapper = document.querySelector('.wrapper') as HTMLElement;
  wrapper.style.background = theme === 'dark' ? '#1a1a1a' : '#fff';
  document.body.style.background = theme === 'dark' ? '#111' : '#f5f5f7';

  // Dispatch appearance update to component
  el.dispatchEvent(
    new CustomEvent('dialstack-appearance-update', {
      detail: { appearance: currentAppearance },
    })
  );

  // Toggle button state
  document.getElementById('btn-light')!.classList.toggle('active', theme === 'light');
  document.getElementById('btn-dark')!.classList.toggle('active', theme === 'dark');
};
