import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { SoftphoneContext } from '../../provider/SoftphoneProviderBase';
import { HOST_MIN_HEIGHT, HOST_MIN_WIDTH, isRoomyLayout } from '../../core/view-model';

/**
 * The drop-in `<Softphone>`'s tier, measured once on the element it is rendered
 * into, so the dial pad, in-call screen, call-waiting card and E911 banner all
 * agree (null outside it). Each of those has its own nested box, none of which
 * is the host.
 */
export const HostTierContext = createContext<boolean | null>(null);

/**
 * Observes the target and keeps `ds-host-small` (the compact tier, see
 * styles.ts) on it while it is under the host minimum or the variant pins compact.
 */
function useTier(
  target: () => HTMLElement | null | undefined,
  enabled: boolean,
  // Re-measures when the element itself changes (the probe's callback ref).
  element?: unknown
) {
  const variant = useContext(SoftphoneContext)?.layoutVariant ?? 'auto';
  const [roomy, setRoomy] = useState(variant !== 'compact');

  useEffect(() => {
    const el = enabled ? target() : null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      const fits = isRoomyLayout(variant, width >= HOST_MIN_WIDTH && height >= HOST_MIN_HEIGHT);
      el.classList.toggle('ds-host-small', !fits);
      setRoomy(fits);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      el.classList.remove('ds-host-small');
    };
    // `target` reads a ref or `element`, both covered here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, enabled, element]);

  return roomy;
}

/**
 * For `<Softphone>`: attach `ref` to a hidden element rendered directly in the
 * host; the host (its parent) is measured and tagged.
 */
export function useHostTierProbe<T extends HTMLElement>() {
  // A callback ref held in state: the effect must run once the probe is in the
  // DOM, which an object ref read in a mount effect did not guarantee here.
  const [probe, ref] = useState<T | null>(null);
  const roomy = useTier(() => probe?.parentElement, true, probe);
  return { ref, roomy };
}

/**
 * Whether the softphone this element sits in is big enough for the full-size
 * tier and the peer's avatar. Inside `<Softphone>` that is the host's answer;
 * a view rendered on its own measures its own outermost `.ds-softphone`.
 */
export function useRoomyHost<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const host = useContext(HostTierContext);
  const own = useTier(() => {
    let box = (ref.current?.closest('.ds-softphone') as HTMLElement | null) ?? ref.current;
    for (
      let up = box?.parentElement?.closest('.ds-softphone') as HTMLElement | null;
      up;
      up = up.parentElement?.closest('.ds-softphone') as HTMLElement | null
    )
      box = up;
    return box;
  }, host === null);
  return { ref, roomy: host ?? own };
}
