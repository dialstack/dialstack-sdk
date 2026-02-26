import type { Meta, StoryObj } from '@storybook/react';
import type { DecoratorArgs } from '../../__storybook__/types';
import { Voicemails } from '../Voicemails';

type Props = React.ComponentProps<typeof Voicemails> & DecoratorArgs;

const meta: Meta<Props> = {
  title: 'React/Voicemails',
  component: Voicemails,
  args: { userId: 'user_01mock' },
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
