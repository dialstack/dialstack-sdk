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

export const Default: Story = {};
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
