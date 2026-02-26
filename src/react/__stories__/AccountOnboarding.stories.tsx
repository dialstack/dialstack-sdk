import type { Meta, StoryObj } from '@storybook/react';
import type { DecoratorArgs } from '../../__storybook__/types';
import { AccountOnboarding } from '../AccountOnboarding';

type Props = React.ComponentProps<typeof AccountOnboarding> & DecoratorArgs;

const meta: Meta<Props> = {
  title: 'React/AccountOnboarding',
  component: AccountOnboarding,
};

export default meta;
type Story = StoryObj<Props>;

export const Default: Story = {};

export const Compact: Story = {
  args: { layoutVariant: 'compact' },
};

export const DarkTheme: Story = {
  args: { theme: 'dark' },
};
