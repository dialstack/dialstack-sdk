import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { expect, within, userEvent, waitFor, fireEvent } from 'storybook/test';
import { Softphone } from '../softphone/ui/Softphone';
import { SoftphoneProvider } from '../softphone/provider/SoftphoneProvider';
import { __setPhoneFactory } from '../softphone/hooks/useCalls';
import { MockPhoneController } from './support/mock-phone';

// Interaction ("e2e") stories that drive the batteries-included <Softphone>
// through real user flows against an in-memory fake phone (../support/mock-phone),
// injected via the internal __setPhoneFactory seam. Unlike the static
// Softphone.stories.tsx (idle only, autoConnect=false), these connect and
// exercise dial / incoming / answer / hang up / call-waiting / attended transfer.

// The controller the current story's play function drives. Stories run
// sequentially, so a module-level handle is safe. It MUST be installed before
// the provider constructs its phone (during the story render) and before the
// play function runs — so the decorator installs the factory + sets the handle
// synchronously in its body, NOT in a useState initializer (whose timing relative
// to the play function is not guaranteed and flaked under CI). An unmount effect
// restores the default factory so the mock can't leak into later stories.
let currentController: MockPhoneController | null = null;

function installMockPhone(): void {
  const c = new MockPhoneController();
  __setPhoneFactory(c.factory);
  currentController = c;
}

const WithMockPhone = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
  React.useEffect(
    () => () => {
      __setPhoneFactory(null);
      currentController = null;
    },
    []
  );
  return <>{children}</>;
};

const meta: Meta = {
  title: 'React/Softphone (flows)',
  decorators: [
    (Story) => {
      installMockPhone();
      return (
        <WithMockPhone>
          <Story />
        </WithMockPhone>
      );
    },
  ],
  render: () => (
    <SoftphoneProvider token="preview-token">
      <Softphone />
    </SoftphoneProvider>
  ),
  parameters: { chromatic: { disableSnapshot: true } },
};

export default meta;
type Story = StoryObj;

async function connected(canvas: ReturnType<typeof within>) {
  // Wait for the provider to construct the mock phone (so ringIncoming can't race
  // ahead of the mount), then until the dial pad's Call control exists (the
  // connecting chip has cleared).
  await currentController!.waitForPhone();
  await waitFor(() => expect(canvas.getByLabelText('Call')).toBeInTheDocument());
}

/** Type a number and place an outbound call → in-call screen with Hang up. */
export const DialAndCall: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await connected(canvas);

    fireEvent.change(canvas.getByLabelText('Enter a number'), { target: { value: '5551234' } });
    await userEvent.click(canvas.getByLabelText('Call'));

    await waitFor(() => expect(canvas.getByLabelText('Hang up')).toBeInTheDocument());
    // In-call controls are present.
    expect(canvas.getByLabelText('Mute')).toBeInTheDocument();
    expect(canvas.getByLabelText('Hold')).toBeInTheDocument();
  },
};

/** An inbound call rings → Answer → in-call → Hang up → back to the dial pad. */
export const IncomingAnswer: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const controller = currentController!;
    await connected(canvas);

    controller.ringIncoming('+14155552671', 'Alice');
    await waitFor(() => expect(canvas.getByText('Incoming call')).toBeInTheDocument());
    expect(canvas.getByText('Alice')).toBeInTheDocument();

    await userEvent.click(canvas.getByLabelText('Answer'));
    await waitFor(() => expect(canvas.getByLabelText('Hang up')).toBeInTheDocument());

    await userEvent.click(canvas.getByLabelText('Hang up'));
    await waitFor(() => expect(canvas.getByLabelText('Call')).toBeInTheDocument());
  },
};

/** An inbound call rings → Decline → back to the dial pad. */
export const IncomingDecline: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const controller = currentController!;
    await connected(canvas);

    controller.ringIncoming('+14155552671', 'Alice');
    await waitFor(() => expect(canvas.getByLabelText('Decline')).toBeInTheDocument());

    await userEvent.click(canvas.getByLabelText('Decline'));
    await waitFor(() => expect(canvas.getByLabelText('Call')).toBeInTheDocument());
  },
};

/** During an active call, a second inbound rings as a call-waiting card. */
export const CallWaiting: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const controller = currentController!;
    await connected(canvas);

    // First call, answered → in-call.
    controller.ringIncoming('+14155550001', 'Alice');
    await waitFor(() => expect(canvas.getByLabelText('Answer')).toBeInTheDocument());
    await userEvent.click(canvas.getByLabelText('Answer'));
    await waitFor(() => expect(canvas.getByLabelText('Hang up')).toBeInTheDocument());

    // Second inbound interrupts — a call-waiting card appears over the in-call UI.
    controller.ringIncoming('+14155550002', 'Bob');
    await waitFor(() => expect(canvas.getByText('Bob')).toBeInTheDocument());
    // The in-call screen is still there behind the waiting card.
    expect(canvas.getByLabelText('Hang up')).toBeInTheDocument();
  },
};

/** In a call → open Transfer → consult → the Complete/Cancel banner AND the
 *  normal in-call controls are both present (guards the transfer-banner fix). */
export const AttendedTransfer: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const controller = currentController!;
    await connected(canvas);

    controller.ringIncoming('+14155552671', 'Alice');
    await waitFor(() => expect(canvas.getByLabelText('Answer')).toBeInTheDocument());
    await userEvent.click(canvas.getByLabelText('Answer'));
    await waitFor(() => expect(canvas.getByLabelText('Transfer')).toBeInTheDocument());

    await userEvent.click(canvas.getByLabelText('Transfer'));
    fireEvent.change(canvas.getByLabelText('Transfer to…'), { target: { value: '7042510351' } });
    await userEvent.click(canvas.getByText('Consult first'));

    // The transfer banner (Complete/Cancel) AND the in-call controls both show.
    await waitFor(() => expect(canvas.getByText('Complete transfer')).toBeInTheDocument());
    expect(canvas.getByText('Cancel')).toBeInTheDocument();
    expect(canvas.getByLabelText('Mute')).toBeInTheDocument();
    expect(canvas.getByLabelText('Hold')).toBeInTheDocument();
  },
};
