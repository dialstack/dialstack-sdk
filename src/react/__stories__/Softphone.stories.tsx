import type { Meta, StoryObj } from '@storybook/react';
import { Softphone } from '../softphone/Softphone';

// The Softphone owns a live DialStackPhone that opens a WebSocket. Storybook has
// no backend, so these stories render with autoConnect={false}: the dial screen
// is fully rendered (the Call button stays disabled until a real connection). The
// incoming / in-call screens require a live call and are covered by the
// interaction tests in ../__tests__/Softphone.test.tsx (which mock the phone).

type Props = React.ComponentProps<typeof Softphone>;

const meta: Meta<Props> = {
  title: 'React/Softphone',
  component: Softphone,
  args: { token: 'preview-token', autoConnect: false },
};

export default meta;
type Story = StoryObj<Props>;

/** Idle dial pad, light theme. */
export const Dial: Story = {};

/** Idle dial pad, dark theme. */
export const DarkTheme: Story = {
  args: { appearance: { theme: 'dark' } },
};
