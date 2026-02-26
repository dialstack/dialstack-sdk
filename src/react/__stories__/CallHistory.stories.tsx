import type { Meta, StoryObj } from '@storybook/react';
import type { DecoratorArgs } from '../../__storybook__/types';
import { CallHistory } from '../CallHistory';

type Props = React.ComponentProps<typeof CallHistory> & DecoratorArgs;

const meta: Meta<Props> = {
  title: 'React/CallHistory',
  component: CallHistory,
  args: { phoneNumber: '+15559876543' },
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

export const Empty: Story = {
  args: { _empty: true },
};
