import type { Meta, StoryObj } from '@storybook/react';
import type { DecoratorArgs } from '../../__storybook__/types';
import { DialPlanViewer } from '../DialPlanViewer';

type Props = React.ComponentProps<typeof DialPlanViewer> & DecoratorArgs;

const meta: Meta<Props> = {
  title: 'React/DialPlanViewer',
  component: DialPlanViewer,
  args: {
    dialPlanId: 'dp_01abc',
    style: { width: '100%', height: '500px' },
  },
};

export default meta;
type Story = StoryObj<Props>;

export const Default: Story = {};

export const WithMinimap: Story = {
  args: { showMinimap: true },
};

export const DarkTheme: Story = {
  args: { theme: 'dark' },
};
