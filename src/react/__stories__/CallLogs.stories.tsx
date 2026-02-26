import type { Meta, StoryObj } from '@storybook/react';
import type { DecoratorArgs } from '../../__storybook__/types';
import { CallLogs } from '../CallLogs';

type Props = React.ComponentProps<typeof CallLogs> & DecoratorArgs;

const meta: Meta<Props> = {
  title: 'React/CallLogs',
  component: CallLogs,
  argTypes: {
    layoutVariant: {
      control: 'select',
      options: ['default', 'compact', 'comfortable'],
    },
  },
};

export default meta;
type Story = StoryObj<Props>;

export const Default: Story = {};

export const Compact: Story = {
  args: { layoutVariant: 'compact' },
};

export const Comfortable: Story = {
  args: { layoutVariant: 'comfortable' },
};

export const DarkTheme: Story = {
  args: { theme: 'dark' },
};

export const Empty: Story = {
  args: { _empty: true },
};
