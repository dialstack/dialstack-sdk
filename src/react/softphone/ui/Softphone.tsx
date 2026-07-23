/**
 * Softphone — the batteries-included softphone: dial pad, incoming-call
 * answer/decline, and in-call controls, switching between them based on call
 * state. This is the drop-in "just give me a working softphone" UI.
 *
 * `<Softphone>` is a pure consumer of `<SoftphoneProvider>` — the provider owns
 * the connection and the `token`, and is the SINGLE place credentials enter.
 * Render it under a provider:
 *
 * ```tsx
 * <SoftphoneProvider token={webrtcToken} apiBaseUrl={apiBaseUrl}>
 *   <Softphone />
 * </SoftphoneProvider>
 * ```
 *
 * Because the connection lives in the provider (not this component), the
 * softphone stays connected app-wide while `<Softphone>` mounts/unmounts (e.g.
 * inside a drawer). `useSoftphone().dial(...)` places calls from anywhere under
 * the provider. For a bespoke UI, compose `<DialPad>` / `<IncomingCall>` /
 * `<OngoingCall>` yourself under the same provider instead.
 */

import React, { useContext } from 'react';
import { useSoftphone, SoftphoneContext } from '../provider/SoftphoneProvider';
import { selectLayout } from '../hooks';
import { DialPad } from './DialPad';
import { EmergencyBanner } from './EmergencyBanner';
import { IncomingCall, IncomingStack } from './IncomingCall';
import { OngoingCall } from './OngoingCall';

export interface SoftphoneProps {
  /**
   * Focus the dial pad's destination field on mount so the user can type
   * immediately (e.g. when the softphone opens in a drawer).
   */
  autoFocusDestination?: boolean;
}

/**
 * The composite multi-call view: a single base screen (dial pad or the in-call
 * screen) with any ringing inbound calls layered on top. `selectLayout` decides
 * the base + how the incoming cards present:
 *
 * - Idle, one inbound → single full-screen incoming card (the original design),
 *   rendered as its own screen.
 * - Idle, several inbound → the compact incoming stack as its own screen (no
 *   dial pad behind it — you're being called, not dialing).
 * - During a call, an inbound interrupt → the in-call screen with a small
 *   call-waiting card overlaid (non-intrusive), compact and stacked if several.
 */
const SoftphoneScreens: React.FC<{ autoFocusDestination?: boolean }> = ({
  autoFocusDestination,
}) => {
  const { calls, activeCall, scope } = useSoftphone();
  const layout = selectLayout(calls, activeCall);

  // Idle (no answered call) with ringing inbound calls: the incoming UI IS the
  // whole screen — no dial pad behind it (you're being called, not dialing).
  // One caller → the original full-screen incoming card; several → the compact
  // stack. This is a dedicated screen, not an overlay.
  if (layout.base === 'dial' && layout.incoming.length > 0) {
    if (layout.incoming.length === 1) return <IncomingCall />;
    // IncomingStack is self-contained (own scoped wrapper), so render it directly.
    return <IncomingStack compact={layout.compact} />;
  }

  const base =
    layout.base === 'in-call' ? (
      <OngoingCall />
    ) : (
      <DialScreen autoFocusDestination={autoFocusDestination} />
    );

  // No ringing calls → just the base screen (dial pad or the in-call screen).
  if (layout.incoming.length === 0) return base;

  // An interrupt DURING a call: the ringing card(s) as a small, non-intrusive
  // call-waiting banner ABOVE the in-call screen. In normal flow (not absolutely
  // positioned) so the banner and the in-call UI never overlap. The wrapper
  // carries the scope so the layout `.ds-*` rules resolve.
  return (
    <div className={`${scope} ds-softphone-layout`}>
      <div className="ds-incoming-overlay">
        <IncomingStack compact={layout.compact} />
      </div>
      {base}
    </div>
  );
};

/**
 * The batteries-included dial screen: the E911 prompt above the dial pad. Since
 * `DialPad` no longer bundles the banner (so a modular consumer can place it
 * anywhere), the drop-in composes the two here — `<EmergencyBanner>` in its own
 * scoped wrapper above `<DialPad>`. Each piece brings its own `.ds-softphone`
 * scope wrapper (the banner's is empty and collapses to nothing when the banner
 * self-hides), so this changes no `DialPad` contract. The banner self-hides when
 * E911 doesn't apply (host-managed, already bound, or a call is active).
 */
const DialScreen: React.FC<{ autoFocusDestination?: boolean }> = ({ autoFocusDestination }) => {
  const { scope } = useSoftphone();
  return (
    <div className={`${scope} ds-dial-screen`}>
      <EmergencyBanner />
      <DialPad autoFocusDestination={autoFocusDestination} />
    </div>
  );
};

export const Softphone: React.FC<SoftphoneProps> = ({ autoFocusDestination }) => {
  // Pure consumer: the connection + token live in <SoftphoneProvider>, the single
  // credential/connection entry point. Requiring an ancestor provider (rather
  // than self-provisioning from a `token` prop) means there is exactly one way to
  // wire the softphone and exactly one place the token enters — no ambiguity, and
  // no risk of two <Softphone token> mounts opening two connections/registrations.
  if (useContext(SoftphoneContext) === null) {
    throw new Error(
      '<Softphone> must be rendered inside a <SoftphoneProvider>. The provider owns ' +
        'the connection and the token. See https://docs.dialstack.ai/sdk/react.'
    );
  }
  return <SoftphoneScreens autoFocusDestination={autoFocusDestination} />;
};
