import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, within, userEvent, waitFor } from 'storybook/test';
import type { DecoratorArgs } from '../../../__storybook__/types';
import { SsaAcceptanceGate, SsaGateLoadError } from '../SsaAcceptanceGate';
import { OnboardingPortal } from '../OnboardingPortal';
import { DialstackComponentsProvider } from '../../DialstackComponentsProvider';
import { createMockInstance } from '../../../__mocks__/mock-instance';
import { defaultLocale } from '../../../locales';
import type { Tos } from '../../../types';

const ssa = defaultLocale.accountOnboarding.ssa;

const SSA_PRICING = { per_user_rate: 1500, per_did_rate: 200, per_voiceai_location_rate: 5000 };

const SSA_TOS: Tos = {
  version: '0-draft',
  // The agreement body is served by the tos API; this URL only backs the
  // secondary "open the hosted copy" link.
  url: 'https://www.dialstack.ai/ssa',
  content:
    'I have read, understood, and agree to the Service Subscription Agreement, including its ' +
    '911/E911 limitations, such as that 911 may not work during a power or internet outage.',
  body:
    '<p class="ssa-intro">Mock agreement body for the gate story.</p>' +
    '<h2 id="s1">1. The Service</h2><p>We provide a hosted internet phone (VoIP) service.</p>' +
    '<h2 id="s7">7. Emergency Calls (911): Please Read This</h2>' +
    '<p>911 on internet phone service has real limitations.</p>',
  acceptance: null,
  pricing: SSA_PRICING,
};

type GateProps = React.ComponentProps<typeof SsaAcceptanceGate> & DecoratorArgs;

const meta: Meta<GateProps> = {
  title: 'React/Onboarding/SSA Acceptance Gate',
  component: SsaAcceptanceGate,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type GateStory = StoryObj<GateProps>;

/** The agreement embedded with pricing and the affirmation checkbox. */
export const Default: GateStory = {
  args: { tos: SSA_TOS, locale: defaultLocale, onAccepted: () => {} },
};

/** Pricing not finalized — a dead-end with no Accept action. */
export const PricingNotSet: GateStory = {
  args: {
    tos: {
      ...SSA_TOS,
      pricing: { per_user_rate: null, per_did_rate: null, per_voiceai_location_rate: null },
    },
    locale: defaultLocale,
    onAccepted: () => {},
  },
};

/** The agreement could not be loaded — a blocking, fail-closed retry screen. */
export const LoadError: StoryObj<React.ComponentProps<typeof SsaGateLoadError> & DecoratorArgs> = {
  render: () => <SsaGateLoadError locale={defaultLocale} onRetry={() => {}} />,
};

// ============================================================================
// Portal-level E2E: the gate blocks the whole portal until accepted.
// ============================================================================

type PortalProps = React.ComponentProps<typeof OnboardingPortal> & DecoratorArgs;

export const BlocksPortalUntilAccepted: StoryObj<PortalProps> = {
  render: () => {
    // Empty account so that, once accepted, the portal lands on the splash
    // ("Get Started") rather than the overview — an unambiguous "past the gate"
    // signal. The agreement starts unaccepted so the gate is shown.
    const instance = createMockInstance(
      { theme: 'light' },
      { empty: true, tos: { acceptance: null, url: 'about:blank' } }
    );
    return (
      <DialstackComponentsProvider dialstack={instance}>
        <OnboardingPortal />
      </DialstackComponentsProvider>
    );
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('the gate blocks the portal on first login', async () => {
      await waitFor(() => expect(canvas.getByText(ssa.title)).toBeInTheDocument(), {
        timeout: 5000,
      });
      // No portal sidebar / exit while the gate is up.
      expect(canvas.queryByText(/start onboarding/i)).not.toBeInTheDocument();
    });

    await step('Accept is disabled until the affirmation is checked', async () => {
      const accept = canvas.getByRole('button', { name: ssa.accept });
      expect(accept).toBeDisabled();
      await userEvent.click(canvas.getByRole('checkbox'));
      expect(accept).toBeEnabled();
    });

    await step('accepting dismisses the gate and reveals the portal', async () => {
      await userEvent.click(canvas.getByRole('button', { name: ssa.accept }));
      await waitFor(() => expect(canvas.queryByText(ssa.title)).not.toBeInTheDocument(), {
        timeout: 5000,
      });
      await waitFor(() => expect(canvas.getByText(/start onboarding/i)).toBeInTheDocument(), {
        timeout: 5000,
      });
    });
  },
};
