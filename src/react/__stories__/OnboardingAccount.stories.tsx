import type { Meta, StoryObj } from '@storybook/react';
import type { DecoratorArgs } from '../../__storybook__/types';
import { OnboardingAccount } from '../OnboardingAccount';

type Props = React.ComponentProps<typeof OnboardingAccount> & DecoratorArgs;

const meta: Meta<Props> = {
  title: 'React/Onboarding/Account',
  component: OnboardingAccount,
};

export default meta;
type Story = StoryObj<Props>;

export const Default: Story = {};
export const DarkTheme: Story = { args: { theme: 'dark' } };
export const Compact: Story = { args: { layoutVariant: 'compact' } };
