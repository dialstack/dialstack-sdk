/**
 * React hook for creating and managing Web Components
 */

import { useCallback, useRef, useState } from 'react';
import type { ComponentTagName, ComponentElement, DialStackInstance } from '@dialstack/sdk-js';

import { PACKAGE_VERSION } from './version';

/**
 * Return type for useCreateComponent hook - properly typed based on tag name
 */
export interface UseCreateComponentResult<T extends ComponentTagName> {
  containerRef: React.RefCallback<HTMLDivElement>;
  componentInstance: ComponentElement[T] | null;
}

/**
 * Fails loudly when the custom element was never registered.
 *
 * `document.createElement` — which `dialstack.create()` calls — succeeds for any
 * tag name. An unregistered one yields an inert `HTMLUnknownElement`: it appends,
 * occupies no space, renders nothing, and reports no error. Every setter the
 * wrapper then calls silently does nothing, because there is no upgraded element
 * behind them. The symptom is a blank area on the page with a clean console.
 *
 * Registration is a side effect of importing `@dialstack/sdk-js`, which this
 * package declares as a peer rather than a dependency. Two ways it goes missing:
 * the consumer installed this package without the peer, or a bundler dropped the
 * peer's side-effect imports (which is why `@dialstack/sdk-js` declares
 * `sideEffects` as an allowlist naming its component modules, not `false`).
 *
 * The tell is that every DialStack element defines `setInstance`; an unupgraded
 * element has no such method.
 */
function assertUpgraded(element: unknown, tagName: string): void {
  if (element && typeof (element as { setInstance?: unknown }).setInstance === 'function') {
    return;
  }
  throw new Error(
    `<dialstack-${tagName}> was created but is not a registered custom element, so it ` +
      `would render nothing. Install @dialstack/sdk-js alongside @dialstack/sdk-react and ` +
      `import it once at your entry point — importing it is what registers the elements. ` +
      `On @dialstack/sdk-js/pure nothing registers on import: await registerComponents() ` +
      `before rendering. If it is installed, check that your bundler is not dropping its ` +
      `side effects.`
  );
}

/**
 * Hook to create and manage a Web Component instance
 *
 * Uses a callback ref pattern for synchronous component creation when the
 * container mounts. Creates components using dialstack.create() and handles
 * cleanup when the container unmounts or when dependencies change.
 *
 * @param dialstack - The DialStack instance
 * @param tagName - The component tag name (e.g., 'call-logs', 'voicemails')
 * @returns Object with containerRef (callback) and properly typed componentInstance
 *
 * @example
 * ```tsx
 * const { containerRef, componentInstance } = useCreateComponent(dialstack, 'voicemails');
 * // containerRef is a callback ref to attach to the container div
 * // componentInstance is typed as VoicemailsElement | null
 * // TypeScript knows about setUserId, setOnVoicemailPlay, etc.
 * ```
 */
export function useCreateComponent<T extends ComponentTagName>(
  dialstack: DialStackInstance,
  tagName: T
): UseCreateComponentResult<T> {
  const componentRef = useRef<ComponentElement[T] | null>(null);
  // Use state to trigger re-render when component is created
  const [componentInstance, setComponentInstance] = useState<ComponentElement[T] | null>(null);

  // Use callback ref to create component when container mounts
  const containerRef = useCallback(
    (container: HTMLDivElement | null) => {
      // Cleanup previous component if it exists
      if (componentRef.current && componentRef.current.parentNode) {
        componentRef.current.parentNode.removeChild(componentRef.current);
        componentRef.current = null;
        setComponentInstance(null);
      }

      if (!container) return;

      // Create component using DialStack SDK
      const component = dialstack.create(tagName);
      try {
        assertUpgraded(component, tagName);
      } catch (err) {
        // create() has already added the element to the instance's component set,
        // so throwing here would leave an un-upgraded element registered for
        // appearance updates and dialstack-logout events for the life of the
        // instance. Withdraw it before the error propagates.
        dialstack.removeAppearanceTarget(component as HTMLElement);
        throw err;
      }

      // Set SDK version for analytics
      try {
        component.setAttribute('data-dialstack-sdk-version', PACKAGE_VERSION);
      } catch (e) {
        console.log('Error setting SDK version attribute:', e);
      }

      // Append to container
      container.appendChild(component as Node);
      componentRef.current = component;
      setComponentInstance(component);
    },
    [dialstack, tagName]
  );

  return {
    containerRef,
    componentInstance,
  };
}
