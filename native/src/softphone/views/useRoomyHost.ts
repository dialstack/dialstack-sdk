import { createContext, useCallback, useContext, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  HOST_MIN_HEIGHT,
  HOST_MIN_WIDTH,
  SoftphoneContext,
  isRoomyLayout,
} from '@dialstack/sdk-react/core';

/**
 * Whether the softphone's own box is roomy (null outside a softphone). The
 * `<Softphone>` root measures itself and provides it, so the pieces that do not
 * measure (the E911 banner, chips, the call-waiting card) follow the same tier.
 */
export const HostTierContext = createContext<boolean | null>(null);

// The same limit measured inside a screen view, which sits within the host's
// padding.
const VIEW_MIN_WIDTH = 280;
const VIEW_MIN_HEIGHT = 440;

function useMeasured(minWidth: number, minHeight: number) {
  // A pinned layoutVariant overrides the size; outside a provider, size decides.
  const variant = useContext(SoftphoneContext)?.layoutVariant ?? 'auto';
  const [measured, setRoomy] = useState(true);
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setRoomy(width >= minWidth && height >= minHeight);
    },
    [minWidth, minHeight]
  );
  return { roomy: isRoomyLayout(variant, measured), onLayout };
}

/** Measures the softphone's own box; for the root that provides HostTierContext. */
export function useHostTierBox() {
  return useMeasured(HOST_MIN_WIDTH, HOST_MIN_HEIGHT);
}

/**
 * Whether a view has room for the full-size tier (and the peer's avatar): the
 * enclosing softphone's answer when there is one, else the view's own box.
 */
export function useRoomyHost() {
  const host = useContext(HostTierContext);
  const own = useMeasured(VIEW_MIN_WIDTH, VIEW_MIN_HEIGHT);
  return { roomy: host ?? own.roomy, onLayout: own.onLayout };
}
