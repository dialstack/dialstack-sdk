/**
 * ShadowContainer — wraps children in a Shadow DOM with adopted stylesheets.
 *
 * Uses Constructable Stylesheets (adoptedStyleSheets) for CSS scoping.
 * Children are rendered into the shadow root via React's createPortal.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface ShadowContainerProps {
  children: React.ReactNode;
  stylesheets: string[];
  className?: string;
  style?: React.CSSProperties;
}

/** Apply stylesheets to the shadow root attached to a host element. */
function applyStylesheets(host: HTMLElement, stylesheets: string[]): void {
  const root = host.shadowRoot;
  if (!root) return;
  root.adoptedStyleSheets = stylesheets.map((css) => {
    const s = new CSSStyleSheet();
    s.replaceSync(css);
    return s;
  });
}

// Disable shadow DOM in test environments (jsdom, Storybook test-runner)
// so that test queries (within, querySelector) can access children normally.
const canUseShadowDOM =
  typeof window !== 'undefined' &&
  typeof window.document !== 'undefined' &&
  typeof HTMLElement.prototype.attachShadow === 'function' &&
  typeof navigator !== 'undefined' &&
  !/jsdom/i.test(navigator.userAgent ?? '') &&
  // Storybook injects __STORYBOOK_PREVIEW__ — disable shadow DOM for E2E play tests
  !(typeof window !== 'undefined' && '__STORYBOOK_PREVIEW__' in window);

export const ShadowContainer: React.FC<ShadowContainerProps> = ({
  children,
  stylesheets,
  className,
  style,
}) => {
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const hostRefRef = useRef<HTMLDivElement | null>(null);

  // Callback ref — runs synchronously when the div mounts.
  // Stable (no deps) — the useEffect below handles stylesheet application.
  const hostCallback = useCallback((host: HTMLDivElement | null) => {
    hostRefRef.current = host;
    if (!canUseShadowDOM || !host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    setPortalTarget(root as unknown as Element);
  }, []);

  // Update adopted stylesheets when they change (rare — typically stable).
  useEffect(() => {
    if (!canUseShadowDOM || !hostRefRef.current) return;
    applyStylesheets(hostRefRef.current, stylesheets);
  }, [stylesheets]);

  // Fallback: inject styles into document.head when shadow DOM is disabled.
  // Each ShadowContainer instance gets its own <style> element.
  const fallbackStyleRef = useRef<HTMLStyleElement | null>(null);
  useEffect(() => {
    if (canUseShadowDOM || stylesheets.length === 0) return;
    if (!fallbackStyleRef.current) {
      fallbackStyleRef.current = document.createElement('style');
      document.head.appendChild(fallbackStyleRef.current);
    }
    fallbackStyleRef.current.textContent = stylesheets.join('\n');
    return () => {
      if (fallbackStyleRef.current) {
        fallbackStyleRef.current.remove();
        fallbackStyleRef.current = null;
      }
    };
  }, [stylesheets]);

  if (!canUseShadowDOM) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <div ref={hostCallback} className={className} style={style}>
      {portalTarget && createPortal(children, portalTarget)}
    </div>
  );
};
