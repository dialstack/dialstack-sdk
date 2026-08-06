import '../../components/phone-numbers';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, waitFor } from 'storybook/test';
import { MOCK_PHONE_NUMBERS } from '../../__mocks__/mock-data';
import { WebComponentStory } from './WebComponentStory';

const meta: Meta<typeof WebComponentStory> = {
  title: 'Web Components/PhoneNumbers',
  component: WebComponentStory,
  args: { tagName: 'phone-numbers' },
};

export default meta;
type Story = StoryObj<typeof WebComponentStory>;

export const Default: Story = {};
export const DarkTheme: Story = { args: { theme: 'dark' } };
export const Compact: Story = { args: { layoutVariant: 'compact' } };
export const Empty: Story = { args: { empty: true } };

export const InProgressWithPreAssignedRouting: Story = {
  args: {
    // The routing cell is only an actionable deep-link when a host has wired the
    // row-click callback; mirror that here so the affordance renders.
    setup: (el: { setOnRowClick: (cb: () => void) => void }) => el.setOnRowClick(() => {}),
    dids: [
      {
        id: 'did_04porting',
        phone_number: '+16194444792',
        status: 'inactive',
        outbound_enabled: false,
        routing_target: 'vapp_01abc',
        created_at: '2026-06-16T10:00:00Z',
        updated_at: '2026-06-16T10:00:00Z',
      },
    ],
    ports: [
      {
        id: 'po_porting',
        status: 'foc',
        details: {
          phone_numbers: ['+16194444792'],
          requested_foc_date: '2026-06-20',
          losing_carrier: { name: 'Old Telco' },
        },
        submitted_at: '2026-06-16T10:00:00Z',
        created_at: '2026-06-16T10:00:00Z',
        updated_at: '2026-06-16T10:00:00Z',
      },
    ],
  },
  play: async ({ canvasElement, step }) => {
    await step('The in-flight port number shows its pre-assigned routing target', async () => {
      await waitFor(() => {
        const el = canvasElement.querySelector('dialstack-phone-numbers');
        const inProgressTab = el?.shadowRoot?.querySelector<HTMLButtonElement>(
          '.segment-btn[data-filter="in_progress"]'
        );
        expect(inProgressTab).toBeTruthy();
        inProgressTab?.click();
      });
      await waitFor(() => {
        const el = canvasElement.querySelector('dialstack-phone-numbers');
        const cell = el?.shadowRoot?.querySelector('td.routing-cell[data-routing-phone]');
        expect(cell).toBeTruthy();
        expect(cell?.querySelector('dialstack-routing-target')?.getAttribute('target')).toBe(
          'vapp_01abc'
        );
      });
    });
  },
};

export const Search: Story = {
  args: {
    dids: [
      {
        id: 'did_search_a',
        phone_number: '+19162377753',
        status: 'active',
        outbound_enabled: true,
        caller_id_name: 'ARMSTRONG',
        created_at: '2026-06-16T10:00:00Z',
        updated_at: '2026-06-16T10:00:00Z',
      },
      {
        id: 'did_search_b',
        phone_number: '+15145559999',
        status: 'active',
        outbound_enabled: true,
        caller_id_name: 'Broccoli Co',
        created_at: '2026-06-16T10:00:00Z',
        updated_at: '2026-06-16T10:00:00Z',
      },
    ],
  },
  play: async ({ canvasElement, step }) => {
    await step('Typing in the search box filters the list to matching rows', async () => {
      // The story appends the element in an effect, so re-query it inside each
      // waitFor rather than capturing it once (it may be absent on the first tick).
      const input = await waitFor(() => {
        const el = canvasElement.querySelector('dialstack-phone-numbers');
        const found = el?.shadowRoot?.querySelector<HTMLInputElement>('#ds-phone-numbers-search');
        expect(found).toBeTruthy();
        return found as HTMLInputElement;
      });
      input.focus();
      input.value = 'armstrong';
      input.dispatchEvent(new Event('input'));
      await waitFor(() => {
        const el = canvasElement.querySelector('dialstack-phone-numbers');
        const body = el?.shadowRoot?.querySelector('tbody')?.textContent ?? '';
        expect(body).toContain('(916) 237-7753');
        expect(body).not.toContain('(514) 555-9999');
      });
    });
  },
};

export const WithTemporaryNumber: Story = {
  args: {
    dids: [
      ...MOCK_PHONE_NUMBERS.data,
      {
        id: 'did_03temp',
        phone_number: '+15553334444',
        status: 'active',
        number_class: 'temporary',
        expires_at: '2026-03-01T10:00:00Z',
        outbound_enabled: true,
        created_at: '2026-01-25T10:00:00Z',
        updated_at: '2026-01-25T10:00:00Z',
      },
    ],
  },
  play: async ({ canvasElement, step }) => {
    await step('Temporary badge shows next to the number on the Active tab', async () => {
      await waitFor(() => {
        const el = canvasElement.querySelector('dialstack-phone-numbers');
        const badge = el?.shadowRoot?.querySelector('.badge-temporary');
        expect(badge).toBeTruthy();
        expect(badge?.textContent).toContain('Temporary');
        expect(badge?.closest('td')?.textContent).toContain('(555) 333-4444');
      });
    });
  },
};
