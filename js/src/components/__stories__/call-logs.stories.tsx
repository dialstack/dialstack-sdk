import '../../components/call-logs';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, waitFor } from 'storybook/test';
import { WebComponentStory } from './WebComponentStory';

const meta: Meta<typeof WebComponentStory> = {
  title: 'Web Components/CallLogs',
  component: WebComponentStory,
  args: { tagName: 'call-logs' },
};

export default meta;
type Story = StoryObj<typeof WebComponentStory>;

export const Default: Story = { tags: ['vrt-cross-browser'] };
export const DarkTheme: Story = { args: { theme: 'dark' } };
export const Compact: Story = { args: { layoutVariant: 'compact' } };
export const Empty: Story = { args: { empty: true } };

// The mock data includes an unattributed mailbox-access row (empty direction,
// raw SIP username in From, voicemail presentity in To). The table must render
// it defensively: never the raw i18n key and never the raw identifiers.
export const DefensiveRendering: Story = {
  play: async ({ canvasElement }) => {
    // The component renders into its shadow root, so assert against that.
    const shadow = () => canvasElement.querySelector('dialstack-call-logs')?.shadowRoot ?? null;
    await waitFor(() => expect(shadow()?.querySelector('table')).toBeTruthy());
    const html = shadow()?.innerHTML ?? '';
    // No raw i18n key and no raw internal identifiers leak into the rendered table.
    expect(html).not.toContain('callLogs.directions.');
    expect(html).not.toContain('MoDK2hLJ2JuSTp3aYXziD9qJzzc8McwL');
    expect(html).not.toContain('vm_user_');
    // The voicemail placeholder is shown for the presentity destination.
    expect(html).toContain('Voicemail');
  },
};

// The search and filter toolbar renders above the table, defaulting to the
// last 30 days.
export const Filters: Story = {
  play: async ({ canvasElement }) => {
    const shadow = () => canvasElement.querySelector('dialstack-call-logs')?.shadowRoot ?? null;
    await waitFor(() => expect(shadow()?.querySelector('table')).toBeTruthy());
    expect(shadow()?.querySelector('[part="search-input"]')).toBeTruthy();
    // The date filter is a button that opens a panel, so it names the window.
    const date = shadow()?.getElementById('filter-date');
    expect(date?.textContent).toContain('Last 30 days');
  },
};

const callLogsShadow = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('dialstack-call-logs')?.shadowRoot ?? null;

// The Sentiment button opens a panel with one section per side of the reading:
// a label, then score and magnitude bounds.
export const SentimentFilterPanel: Story = {
  play: async ({ canvasElement }) => {
    const shadow = () => callLogsShadow(canvasElement);
    await waitFor(() => expect(shadow()?.querySelector('table')).toBeTruthy());
    const button = shadow()?.getElementById('filter-sentiment') as HTMLButtonElement;
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    button.click();

    const panel = await waitFor(() => {
      const el = shadow()?.getElementById('sentiment-panel');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.querySelectorAll('fieldset')).toHaveLength(3);
    // Opening re-renders the toolbar, so read the button afresh.
    expect(shadow()?.getElementById('filter-sentiment')?.getAttribute('aria-expanded')).toBe(
      'true'
    );

    (shadow()?.getElementById('sentiment-remote-label-negative') as HTMLInputElement).click();
    // Score and magnitude are tucked away until asked for.
    const advanced = shadow()?.getElementById('sentiment-advanced') as HTMLDetailsElement;
    expect(advanced.open).toBe(false);
    (advanced.querySelector('summary') as HTMLElement).click();
    await waitFor(() => expect(advanced.open).toBe(true));
    const max = shadow()?.getElementById('sentiment-remote-score-max') as HTMLInputElement;
    max.value = '-0.5';
    max.dispatchEvent(new Event('input', { bubbles: true }));
    expect(max.value).toBe('-0.5');
  },
};

// Applied sentiment conditions show as a count on the button and stay
// clearable with the other filters.
export const SentimentFilterApplied: Story = {
  play: async ({ canvasElement }) => {
    const shadow = () => callLogsShadow(canvasElement);
    await waitFor(() => expect(shadow()?.querySelector('table')).toBeTruthy());
    (shadow()?.getElementById('filter-sentiment') as HTMLButtonElement).click();
    await waitFor(() => expect(shadow()?.getElementById('sentiment-panel')).toBeTruthy());

    (shadow()?.getElementById('sentiment-overall-label-negative') as HTMLInputElement).click();
    (shadow()?.getElementById('sentiment-apply') as HTMLButtonElement).click();

    await waitFor(() => {
      expect(shadow()?.getElementById('sentiment-panel')).toBeNull();
      expect(shadow()?.querySelector('[part="filter-count"]')?.textContent).toBe('1');
    });
    await waitFor(() => expect(shadow()?.querySelector('table')).toBeTruthy());
  },
};
