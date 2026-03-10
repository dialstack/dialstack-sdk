import '../../components/account-onboarding/step-account';
import type { Meta, StoryObj } from '@storybook/react';
import { WebComponentStory } from './WebComponentStory';

const meta: Meta<typeof WebComponentStory> = {
  title: 'Web Components/Onboarding/Account',
  component: WebComponentStory,
  args: { tagName: 'onboarding-account' },
};

export default meta;
type Story = StoryObj<typeof WebComponentStory>;

export const Default: Story = {};
export const DarkTheme: Story = { args: { theme: 'dark' } };
export const Compact: Story = { args: { layoutVariant: 'compact' } };
