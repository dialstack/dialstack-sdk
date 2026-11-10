import '../../components/voicemails';
import { waitFor } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react';
import { withCallActivityData } from '../../__mocks__/call-activity-mock';
import type { DialStackInstanceImpl } from '../../types/core';
import { WebComponentStory } from './WebComponentStory';

const meta: Meta<typeof WebComponentStory> = {
  title: 'Web Components/Voicemails',
  component: WebComponentStory,
  args: {
    tagName: 'voicemails',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setup: (el: any) => el.setUserId?.('user_01mock'),
  },
};

export default meta;
type Story = StoryObj<typeof WebComponentStory>;

export const Default: Story = { tags: ['vrt-cross-browser'] };
export const DarkTheme: Story = { args: { theme: 'dark' } };
export const Empty: Story = { args: { empty: true } };

const shadow = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('dialstack-voicemails')?.shadowRoot ?? null;
// Waits for an element in the component, which renders after its data loads.
const find = (canvasElement: HTMLElement, selector: string) =>
  waitFor(() => {
    const el = shadow(canvasElement)?.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`${selector} not rendered yet`);
    return el;
  });

// The first message opened: player, summary and transcript. Nothing plays, so
// the screenshot holds still.
export const Expanded: Story = {
  args: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setup: (el: any) => {
      el.setUserId?.('user_01mock');
      el.setBehaviorOptions?.({ autoPlayOnExpand: false });
    },
  },
  play: async ({ canvasElement }) => {
    (await find(canvasElement, '.voicemail-item')).click();
    await find(canvasElement, '.voicemail-item.expanded .transcript-text');
  },
};

// As a dashboard card: every mailbox, unread only, oldest first, the last 7
// days, with mailbox names and Mark as read (the admin Home's Unread voicemail).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asCard = (el: any) => {
  el.setListOptions?.({ unreadOnly: true, order: 'oldest', receivedWithinDays: 7 });
  el.setDisplayOptions?.({
    variant: 'card',
    showMailbox: true,
    showMarkAsReadButton: true,
    showDeleteButton: false,
  });
  el.setBehaviorOptions?.({ markAsReadOnPlay: false, autoPlayOnExpand: false });
  el.setMailbox?.(null);
};
const withData = (i: DialStackInstanceImpl) => withCallActivityData(i);
const withNoData = (i: DialStackInstanceImpl) => withCallActivityData(i, true);

export const Card: Story = {
  tags: ['vrt-cross-browser'],
  args: { setup: asCard, extendInstance: withData },
};
export const CardDarkTheme: Story = {
  args: { setup: asCard, extendInstance: withData, theme: 'dark' },
};
export const CardEmpty: Story = { args: { setup: asCard, extendInstance: withNoData } };

// The first message's transcript open under its row.
export const CardExpanded: Story = {
  args: { setup: asCard, extendInstance: withData },
  play: async ({ canvasElement }) => {
    (await find(canvasElement, '[data-action="toggle-transcript"]')).click();
    await find(canvasElement, '.card-row-transcript .transcript-text');
  },
};

// Marked read, with Undo still offered.
export const CardMarkedRead: Story = {
  args: { setup: asCard, extendInstance: withData },
  play: async ({ canvasElement }) => {
    (await find(canvasElement, '[data-action="mark-read"]')).click();
    await find(canvasElement, '[data-action="undo-read"]');
  },
};
