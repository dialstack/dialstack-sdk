/**
 * Softphone — the batteries-included softphone: dial pad, incoming-call
 * answer/decline, and in-call controls, switching between them based on call
 * state. This is the drop-in "just give me a working softphone" component.
 *
 * Two forms:
 *
 * 1. **Self-contained** — pass a `token` (and any provider options) and it mounts
 *    its own `<SoftphoneProvider>`:
 *    ```tsx
 *    <Softphone token={webrtcToken} />
 *    ```
 *
 * 2. **Inside a provider** — omit `token` and render it under a
 *    `<SoftphoneProvider>` you manage (so the phone stays connected app-wide
 *    while the UI mounts/unmounts):
 *    ```tsx
 *    <SoftphoneProvider token={webrtcToken}>
 *      <Softphone />
 *    </SoftphoneProvider>
 *    ```
 *
 * For a bespoke experience, compose `<DialPad>` / `<IncomingCall>` /
 * `<OngoingCall>` yourself inside a `<SoftphoneProvider>` instead.
 */

import React, { useContext } from 'react';
import {
  SoftphoneProvider,
  useSoftphone,
  SoftphoneContext,
  type SoftphoneProviderProps,
} from '../SoftphoneProvider';
import { selectScreen } from '../softphone-hooks';
import { DialPad } from './DialPad';
import { IncomingCall } from './IncomingCall';
import { OngoingCall } from './OngoingCall';

export interface SoftphoneProps extends Partial<Omit<SoftphoneProviderProps, 'children'>> {
  /**
   * Focus the dial pad's destination field on mount so the user can type
   * immediately (e.g. when the softphone opens in a drawer).
   */
  autoFocusDestination?: boolean;
  /** Optional wrapper class / style for the self-contained form. */
  className?: string;
  style?: React.CSSProperties;
}

/** The screen switcher — renders whichever screen matches the call state. */
function SoftphoneScreens({
  autoFocusDestination,
}: {
  autoFocusDestination?: boolean;
}): React.JSX.Element {
  const { activeCall } = useSoftphone();
  const screen = selectScreen(activeCall);
  if (screen === 'incoming') return <IncomingCall />;
  if (screen === 'in-call') return <OngoingCall />;
  return <DialPad autoFocusDestination={autoFocusDestination} />;
}

export function Softphone({
  autoFocusDestination,
  className,
  style,
  ...providerProps
}: SoftphoneProps): React.JSX.Element {
  const hasProvider = useContext(SoftphoneContext) !== null;

  const screens = <SoftphoneScreens autoFocusDestination={autoFocusDestination} />;

  // Inside an existing provider: render the screens directly.
  if (hasProvider) return screens;

  // Self-contained: a `token` is required to mount our own provider.
  if (!providerProps.token) {
    throw new Error(
      '<Softphone> requires either a `token` prop (to manage its own connection) ' +
        'or an ancestor <SoftphoneProvider>. See https://docs.dialstack.ai/sdk/react.'
    );
  }

  return (
    <div className={className} style={style}>
      <SoftphoneProvider {...(providerProps as SoftphoneProviderProps)}>
        {screens}
      </SoftphoneProvider>
    </div>
  );
}
