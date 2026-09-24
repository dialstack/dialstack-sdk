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
import { selectLayout } from '@dialstack/sdk-react/core';
import { SoftphoneContext, useSoftphone } from '../SoftphoneProvider';
import { DialPad } from './DialPad';
import { EmergencyBanner } from './EmergencyBanner';
import { IncomingCall, IncomingStack } from './IncomingCall';
import { OngoingCall } from './OngoingCall';
import { makeStyles } from './primitives';

export interface SoftphoneProps {
  autoFocusDestination?: boolean;
}

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
    layout.base === 'in-call' ? (
      <OngoingCall />
    ) : (
      <DialScreen autoFocusDestination={autoFocusDestination} />
    );

  let body: React.JSX.Element;
  if (layout.base === 'dial' && layout.incoming.length > 0) {
    body = layout.incoming.length === 1 ? <IncomingCall /> : <IncomingStack compact />;
  } else if (layout.incoming.length === 0) {
    body = base;
  } else {
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

function DialScreen({
  autoFocusDestination,
}: {
  autoFocusDestination?: boolean;
}): React.JSX.Element {
  const { emergency, emergencyManagedByHost, activeCall } = useSoftphone();
  const banner = !emergencyManagedByHost && !emergency.loading && !emergency.bound && !activeCall;

  return (
    <>
      <EmergencyBanner />
      <DialPad autoFocusDestination={autoFocusDestination} compact={banner} />
    </>
  );
}

export function Softphone({ autoFocusDestination }: SoftphoneProps): React.JSX.Element {
  if (useContext(SoftphoneContext) === null) {
    throw new Error(
      '<Softphone> must be rendered inside a <SoftphoneProvider>. The provider owns ' +
        'the connection and the token.'
    );
  }
  return <SoftphoneScreens autoFocusDestination={autoFocusDestination} />;
}
