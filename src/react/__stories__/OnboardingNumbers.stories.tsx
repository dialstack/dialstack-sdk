import type { Meta, StoryObj } from '@storybook/react';
import type { DecoratorArgs } from '../../__storybook__/types';
import { OnboardingNumbers } from '../OnboardingNumbers';

type Props = React.ComponentProps<typeof OnboardingNumbers> & DecoratorArgs;

const meta: Meta<Props> = {
  title: 'React/Onboarding/Numbers',
  component: OnboardingNumbers,
};

export default meta;
type Story = StoryObj<Props>;

export const Default: Story = {};
export const DarkTheme: Story = { args: { theme: 'dark' } };
export const Compact: Story = { args: { layoutVariant: 'compact' } };
