import '../../components/voicemails';
import type { Meta, StoryObj } from '@storybook/react';
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

export const Default: Story = {};
export const DarkTheme: Story = { args: { theme: 'dark' } };
export const Empty: Story = { args: { empty: true } };
