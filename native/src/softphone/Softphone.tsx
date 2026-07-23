/**
 * Softphone (RN) — the batteries-included softphone: dial pad, incoming-call
 * answer/decline, and in-call controls, switching between them based on call
 * state. The RN sibling of the web <Softphone>: a pure consumer of
 * <SoftphoneProvider>, which owns the connection and the `token` (the single
 * credential/connection entry point). Render it under a provider:
 *
 * ```tsx
 * <SoftphoneProvider token={webrtcToken} apiBaseUrl={apiBaseUrl}>
 *   <Softphone />
 * </SoftphoneProvider>
 * ```
 *
 * For a bespoke UI, compose <DialPad> / <IncomingCall> / <OngoingCall> yourself
 * under the same provider.
 */

import React, { useContext, useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { selectLayout } from '@dialstack/sdk/react/core';
import { SoftphoneContext, useSoftphone } from '../SoftphoneProvider';
import { DialPad } from './DialPad';
import { EmergencyBanner } from './EmergencyBanner';
import { IncomingCall, IncomingStack } from './IncomingCall';
import { OngoingCall } from './OngoingCall';
import { makeStyles } from './primitives';

export interface SoftphoneProps {
  autoFocusDestination?: boolean;
}

/**
 * The composite multi-call view inside the centered card: a base screen with any
 * ringing inbound calls layered on top. `selectLayout` decides the base + how the
 * incoming cards present (RN mirror of the web SoftphoneScreens):
 * - idle, one inbound → single full-screen incoming card;
 * - idle, several → the compact incoming stack as its own screen (no dial pad);
 * - during a call → in-call screen with a small compact call-waiting overlay.
 */
function SoftphoneScreens({
  autoFocusDestination,
}: {
  autoFocusDestination?: boolean;
}): React.JSX.Element {
  const { calls, palette } = useSoftphone();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const layout = selectLayout(calls);

  const base =
    layout.base === 'in-call' ? <OngoingCall /> : <DialScreen autoFocusDestination={autoFocusDestination} />;

  let body: React.JSX.Element;
  if (layout.base === 'dial' && layout.incoming.length > 0) {
    // Idle (no answered call) with ringing inbound: the incoming UI IS the whole
    // screen — no dial pad behind it (you're being called, not dialing). One
    // caller → the full-screen card; several → the compact stack.
    body = layout.incoming.length === 1 ? <IncomingCall /> : <IncomingStack compact />;
  } else if (layout.incoming.length === 0) {
    body = base;
  } else {
    // An interrupt DURING a call → the compact call-waiting card(s) as a banner
    // ABOVE the in-call screen (in normal flow, so it never overlaps the peer /
    // controls below).
    body = (
      <View style={styles.layoutWithBanner}>
        <IncomingStack compact={layout.compact} />
        {base}
      </View>
    );
  }

  return (
    <View style={[styles.outer, landscape && styles.outerLandscape]}>
      <View style={styles.root}>{body}</View>
    </View>
  );
}

/**
 * The batteries-included dial screen: the E911 prompt above the dial pad. Since
 * DialPad no longer bundles the banner (so a modular consumer can place it
 * anywhere), the drop-in composes the two here — <EmergencyBanner> as a sibling
 * above <DialPad>. Mirrors the web <Softphone>'s DialScreen so the two platforms
 * share one modular contract. The banner self-hides when E911 doesn't apply.
 */
function DialScreen({ autoFocusDestination }: { autoFocusDestination?: boolean }): React.JSX.Element {
  return (
    <>
      <EmergencyBanner />
      <DialPad autoFocusDestination={autoFocusDestination} />
    </>
  );
}

export function Softphone({ autoFocusDestination }: SoftphoneProps): React.JSX.Element {
  // Pure consumer: the connection + token live in <SoftphoneProvider>, the single
  // credential/connection entry point. Requiring an ancestor provider keeps one
  // way to wire the softphone and one place the token enters.
  if (useContext(SoftphoneContext) === null) {
    throw new Error(
      '<Softphone> must be rendered inside a <SoftphoneProvider>. The provider owns ' +
        'the connection and the token.'
    );
  }
  return <SoftphoneScreens autoFocusDestination={autoFocusDestination} />;
}
