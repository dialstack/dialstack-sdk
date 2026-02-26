import type { Meta, StoryObj } from '@storybook/react';
import type { DecoratorArgs } from '../../__storybook__/types';
import { PhoneNumbers } from '../PhoneNumbers';

type Props = React.ComponentProps<typeof PhoneNumbers> & DecoratorArgs;

const meta: Meta<Props> = {
  title: 'React/PhoneNumbers',
  component: PhoneNumbers,
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
