/**
 * Layout shell for a wizard step. Renders a sidebar (left) and a content area (right).
 *
 * Styles are scoped via Shadow DOM using Constructable Stylesheets
 * (adoptedStyleSheets) so they never leak into the host document.
 */

import React, { useMemo } from 'react';
import { ShadowContainer } from './ShadowRoot';
import { generateLayoutCssVars } from './design-tokens';
import styles from './styles/styles.css';
import accountStyles from './styles/account-styles.css';

// Default CSS variables — mirrors base-component.ts defaults.
// Theme-sensitive variables read from --ds-portal-* source vars (set by OnboardingPortal)
// with light-theme fallbacks so standalone usage still works.
const DEFAULT_VARS = generateLayoutCssVars();

// Scope generic class names to avoid collisions with host app CSS frameworks.
const scopedStyles =
  '* { box-sizing: border-box; font-family: var(--ds-font-family); }\n' +
  DEFAULT_VARS +
  (styles + accountStyles)
    .replace(/\.container(?![-\w])/g, '.ds-onboarding-container')
    .replace(/\.step-layout(?![-\w])/g, '.ds-onboarding-layout')
    .replace(/\.step-sidebar(?![-\w])/g, '.ds-onboarding-sidebar')
    .replace(/\.step-content(?![-\w])/g, '.ds-onboarding-content');

// Base stylesheets — stable reference so ShadowContainer memoization works.
const BASE_STYLESHEETS = [scopedStyles];

export interface OnboardingLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  extraStylesheets?: string[];
}

const OnboardingLayoutBase: React.FC<OnboardingLayoutProps> = ({
  sidebar,
  children,
  className,
  extraStylesheets,
}) => {
  // Combine base + extra stylesheets — memoize to keep ShadowContainer stable.
  const allStylesheets = useMemo(
    () =>
      extraStylesheets?.length ? [...BASE_STYLESHEETS, ...extraStylesheets] : BASE_STYLESHEETS,
    [extraStylesheets]
  );

  return (
    <ShadowContainer stylesheets={allStylesheets}>
      <div className={`ds-onboarding-root${className ? ` ${className}` : ''}`}>
        <div className="ds-onboarding-container">
          <div className="ds-onboarding-layout">
            <aside className="ds-onboarding-sidebar">{sidebar}</aside>
            <main className="ds-onboarding-content">{children}</main>
          </div>
        </div>
      </div>
    </ShadowContainer>
  );
};
export const OnboardingLayout = React.memo(OnboardingLayoutBase);
