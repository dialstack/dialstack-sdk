import '../../components/onboarding-portal';
import type { Meta, StoryObj } from '@storybook/react';
import { WebComponentStory } from './WebComponentStory';

const meta: Meta<typeof WebComponentStory> = {
  title: 'Web Components/Onboarding/Portal',
  component: WebComponentStory,
  args: { tagName: 'onboarding-portal' },
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof WebComponentStory>;

export const Default: Story = {};
export const DarkTheme: Story = { args: { theme: 'dark' } };
