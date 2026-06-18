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
