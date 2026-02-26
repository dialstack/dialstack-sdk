import type { Meta, StoryObj } from '@storybook/react';
import type { DecoratorArgs } from '../../__storybook__/types';
import { PhoneNumberOrdering } from '../PhoneNumberOrdering';

type Props = React.ComponentProps<typeof PhoneNumberOrdering> & DecoratorArgs;

const meta: Meta<Props> = {
  title: 'React/PhoneNumberOrdering',
  component: PhoneNumberOrdering,
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
