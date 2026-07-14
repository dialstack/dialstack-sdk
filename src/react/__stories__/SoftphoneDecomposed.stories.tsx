import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { DialPad } from '../softphone/DialPad';
import { IncomingCall } from '../softphone/IncomingCall';
import { OngoingCall } from '../softphone/OngoingCall';
import { SoftphoneProvider } from '../SoftphoneProvider';
import { useActiveCall, useIncomingCall } from '../SoftphoneProvider';
import type { AppearanceOptions } from '../../types';

// The "build your own" path: instead of the batteries-included <Softphone>, a
// host composes the exported pieces (DialPad / IncomingCall / OngoingCall) under
// the same <SoftphoneProvider> and picks which to show using the convenience
// accessors (useIncomingCall / useActiveCall). This story documents that wiring.
//
// Like the <Softphone> story, these render with autoConnect={false}: the provider
// opens a real WebSocket when connected, so the previewable state is the idle
// dial pad. The incoming / in-call pieces self-hide with no live call (they
// return null), so only the dial pad shows here; those live states are covered
// by the interaction tests in ../__tests__/SoftphoneAccessors.test.tsx and
// ../__tests__/Softphone.test.tsx, which mock the phone.

// A minimal host-authored layout that switches pieces off the accessors — the
// same decision the batteries-included <Softphone> makes internally, but written
// out so consumers can see how to assemble their own.
function BuildYourOwnSoftphone(): React.JSX.Element {
  const incoming = useIncomingCall();
  const { activeCall } = useActiveCall();

  if (incoming) return <IncomingCall />;
  if (activeCall) return <OngoingCall />;
  return <DialPad />;
}

interface StoryArgs {
  appearance?: AppearanceOptions;
}

const meta: Meta<StoryArgs> = {
  title: 'React/Softphone (build your own)',
  render: ({ appearance }) => (
    <SoftphoneProvider token="preview-token" autoConnect={false} appearance={appearance}>
      <BuildYourOwnSoftphone />
    </SoftphoneProvider>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

/** Idle dial pad composed from the exported pieces, light theme. */
export const Dial: Story = {};

/** Idle dial pad composed from the exported pieces, dark theme. */
export const DarkTheme: Story = {
  args: { appearance: { theme: 'dark' } },
};
