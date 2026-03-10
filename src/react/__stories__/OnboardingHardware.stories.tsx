import type { Meta, StoryObj } from '@storybook/react';
import type { DecoratorArgs } from '../../__storybook__/types';
import { OnboardingHardware } from '../OnboardingHardware';

type Props = React.ComponentProps<typeof OnboardingHardware> & DecoratorArgs;

const meta: Meta<Props> = {
  title: 'React/Onboarding/Hardware',
  component: OnboardingHardware,
};

export default meta;
type Story = StoryObj<Props>;

export const Default: Story = {};
export const DarkTheme: Story = { args: { theme: 'dark' } };
export const Compact: Story = { args: { layoutVariant: 'compact' } };
