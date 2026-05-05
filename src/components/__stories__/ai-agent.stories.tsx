import '../../components/ai-agent';
import type { Meta, StoryObj } from '@storybook/react';
import { WebComponentStory } from './WebComponentStory';

const meta: Meta<typeof WebComponentStory> = {
  title: 'Web Components/AIAgent',
  component: WebComponentStory,
  args: {
    tagName: 'ai-agent',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setup: (el: any) => el.setAgentId?.('aia_01abc'),
  },
};

export default meta;
type Story = StoryObj<typeof WebComponentStory>;

export const Default: Story = {};
export const DarkTheme: Story = { args: { theme: 'dark' } };

// Spineline mounts with `name` hidden because there's exactly one managed
// agent per practice — operators only edit persona/greeting/instructions/FAQ.
export const NameHidden: Story = {
  args: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setup: (el: any) => {
      el.setAgentId?.('aia_01abc');
      el.setHideFields?.(['name']);
    },
  },
};
