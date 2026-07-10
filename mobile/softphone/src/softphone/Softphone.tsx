/**
 * Softphone (RN) — the batteries-included softphone: dial pad, incoming-call
 * answer/decline, and in-call controls, switching between them based on call
 * state. The RN sibling of the web <Softphone>, with the same two forms:
 *
 * 1. Self-contained — pass a `token` (+ options); it mounts its own
 *    <SoftphoneProvider>.
 * 2. Inside a provider — omit `token` and render under a <SoftphoneProvider> you
 *    manage (so the phone stays connected while the UI mounts/unmounts).
 *
 * For a bespoke experience, compose <DialPad> / <IncomingCall> / <OngoingCall>
 * yourself inside a <SoftphoneProvider>.
 */

import React, { useContext, useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { selectScreen } from '@dialstack/sdk/react/softphone';
import {
  SoftphoneProvider,
  SoftphoneContext,
  useSoftphone,
  type SoftphoneProviderProps,
} from '../SoftphoneProvider';
import { DialPad } from './DialPad';
import { IncomingCall } from './IncomingCall';
import { OngoingCall } from './OngoingCall';
import { makeStyles } from './primitives';

export interface SoftphoneProps extends Partial<Omit<SoftphoneProviderProps, 'children'>> {
  autoFocusDestination?: boolean;
}

/** The screen switcher inside the centered card. */
function SoftphoneScreens({
  autoFocusDestination,
}: {
  autoFocusDestination?: boolean;
}): React.JSX.Element {
  const { activeCall, palette } = useSoftphone();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const screen = selectScreen(activeCall);
  const body =
    screen === 'incoming' ? (
      <IncomingCall />
    ) : screen === 'in-call' ? (
      <OngoingCall />
    ) : (
      <DialPad autoFocusDestination={autoFocusDestination} />
    );

  return (
    <View style={[styles.outer, landscape && styles.outerLandscape]}>
      <View style={styles.root}>{body}</View>
    </View>
  );
}

export function Softphone({
  autoFocusDestination,
  ...providerProps
}: SoftphoneProps): React.JSX.Element {
  const hasProvider = useContext(SoftphoneContext) !== null;
  const screens = <SoftphoneScreens autoFocusDestination={autoFocusDestination} />;

  if (hasProvider) return screens;

  if (!providerProps.token) {
    throw new Error(
      '<Softphone> requires either a `token` prop (to manage its own connection) ' +
        'or an ancestor <SoftphoneProvider>.'
    );
  }

  return (
    <SoftphoneProvider {...(providerProps as SoftphoneProviderProps)}>{screens}</SoftphoneProvider>
  );
}
