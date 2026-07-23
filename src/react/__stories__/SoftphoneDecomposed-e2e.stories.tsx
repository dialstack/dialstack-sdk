import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { expect, within, userEvent, waitFor } from 'storybook/test';
import { DialPad } from '../softphone/ui/DialPad';
import { IncomingCall } from '../softphone/ui/IncomingCall';
import { OngoingCall } from '../softphone/ui/OngoingCall';
import { SoftphoneProvider } from '../softphone/provider/SoftphoneProvider';
import { useActiveCall, useIncomingCall } from '../softphone/provider/SoftphoneProvider';
import { __setPhoneFactory } from '../softphone/hooks/useCalls';
import { MockPhoneController } from './support/mock-phone';

// Interaction ("e2e") story for the DECOMPOSED / build-your-own path: a host
// composes the exported pieces (DialPad / IncomingCall / OngoingCall) and picks
// which to show off the convenience accessors (useIncomingCall / useActiveCall).
//
// This is the story that would have caught bug #1 (useIncomingCall reading
// activeCall): the incoming screen renders ONLY if useIncomingCall() returns the
// ringing call, so a regression there makes the flow below fail at "Incoming
// call" instead of silently rendering a still-idle dial pad.

// The host-authored layout — the same decision <Softphone> makes internally,
// written out so the accessors are exercised the way a consumer would use them.
const BuildYourOwnSoftphone = (): React.JSX.Element => {
  const incoming = useIncomingCall();
  const { activeCall } = useActiveCall();
  if (incoming) return <IncomingCall />;
  if (activeCall) return <OngoingCall />;
  return <DialPad />;
};

// The controller the current story's play function drives (stories run
// sequentially, so a module-level handle is safe). It MUST be installed before
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
  title: 'React/Softphone (build your own) (flows)',
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
      <BuildYourOwnSoftphone />
    </SoftphoneProvider>
  ),
  parameters: { chromatic: { disableSnapshot: true } },
};

export default meta;
type Story = StoryObj;

/** Inbound rings (via useIncomingCall) → Answer → in-call (via useActiveCall) →
 *  Hang up → back to the dial pad. Exercises both convenience accessors. */
export const IncomingAnswerHangup: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const controller = currentController!;
    await controller.waitForPhone();

    // Connected → the composed dial pad shows.
    await waitFor(() => expect(canvas.getByLabelText('Call')).toBeInTheDocument());

    // Ring an inbound: useIncomingCall must surface it → IncomingCall renders.
    controller.ringIncoming('+14155552671', 'Alice');
    await waitFor(() => expect(canvas.getByText('Incoming call')).toBeInTheDocument());
    expect(canvas.getByText('Alice')).toBeInTheDocument();

    // Answer: the call moves to useActiveCall → OngoingCall renders.
    await userEvent.click(canvas.getByLabelText('Answer'));
    await waitFor(() => expect(canvas.getByLabelText('Hang up')).toBeInTheDocument());

    // Hang up → useActiveCall clears → back to the dial pad.
    await userEvent.click(canvas.getByLabelText('Hang up'));
    await waitFor(() => expect(canvas.getByLabelText('Call')).toBeInTheDocument());
  },
};
