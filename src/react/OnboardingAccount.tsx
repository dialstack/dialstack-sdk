/**
 * React wrapper for the standalone OnboardingAccount step.
 * Internal only — for Storybook testing, not exported from the public SDK API.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useDialstackComponents } from './DialstackComponentsProvider';
import { useUpdateWithSetter } from './useUpdateWithSetter';
import type {
  LoaderStart,
  LoadError,
  FormattingOptions,
  ComponentIcons,
  LayoutVariant,
  AccountOnboardingClasses,
} from '../types';
import type { Locale } from '../locales';
import type { OnboardingAccountStep } from '../components/account-onboarding/step-account';
import type { DialStackInstanceImpl } from '../types/core';

// Ensure the custom element is registered
import '../components/account-onboarding/step-account';

export interface OnboardingAccountProps {
  className?: string;
  style?: React.CSSProperties;
  locale?: Locale;
  formatting?: FormattingOptions;
  icons?: ComponentIcons;
  layoutVariant?: LayoutVariant;
  classes?: AccountOnboardingClasses;
  onLoaderStart?: (event: LoaderStart) => void;
  onLoadError?: (event: LoadError) => void;
  onComplete?: () => void;
}

export const OnboardingAccount: React.FC<OnboardingAccountProps> = ({
  className,
  style,
  locale,
  formatting,
  icons,
  layoutVariant,
  classes,
  onLoaderStart,
  onLoadError,
  onComplete,
}) => {
  const { dialstack } = useDialstackComponents();
  const componentRef = useRef<OnboardingAccountStep | null>(null);
  const [instance, setInstance] = useState<OnboardingAccountStep | null>(null);

  const containerRef = useCallback(
    (container: HTMLDivElement | null) => {
      if (componentRef.current?.parentNode) {
        componentRef.current.parentNode.removeChild(componentRef.current);
        componentRef.current = null;
        setInstance(null);
      }
      if (!container) return;

      const el = document.createElement('dialstack-onboarding-account') as OnboardingAccountStep;
      el.setInstance(dialstack as unknown as DialStackInstanceImpl);
      container.appendChild(el);
      componentRef.current = el;
      setInstance(el);
    },
    [dialstack]
  );

  useUpdateWithSetter(instance, locale, (c, v) => c.setLocale(v));
  useUpdateWithSetter(instance, formatting, (c, v) => c.setFormatting(v));
  useUpdateWithSetter(instance, icons, (c, v) => c.setIcons(v));
  useUpdateWithSetter(instance, layoutVariant, (c, v) => c.setLayoutVariant(v));
  useUpdateWithSetter(instance, classes, (c, v) => c.setClasses(v));
  useUpdateWithSetter(instance, onLoaderStart, (c, v) => c.setOnLoaderStart(v));
  useUpdateWithSetter(instance, onLoadError, (c, v) => c.setOnLoadError(v));

  useEffect(() => {
    if (!instance) return;
    instance.setOnComplete(onComplete);
  }, [instance, onComplete]);

  return <div ref={containerRef} className={className} style={style} />;
};
