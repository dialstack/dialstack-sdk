/**
 * React wrapper for OnboardingPortal Web Component
 */

import React from 'react';
import { useDialstackComponents } from './DialstackComponentsProvider';
import { useCreateComponent } from './useCreateComponent';
import { useUpdateWithSetter } from './useUpdateWithSetter';
import type {
  LoaderStart,
  LoadError,
  FormattingOptions,
  ComponentIcons,
  LayoutVariant,
  OnboardingPortalClasses,
  AccountOnboardingStep,
  OnboardingCollectionOptions,
} from '../types';
import type { Locale } from '../locales';

export interface OnboardingPortalProps {
  className?: string;
  style?: React.CSSProperties;
  locale?: Locale;
  formatting?: FormattingOptions;
  icons?: ComponentIcons;
  layoutVariant?: LayoutVariant;
  classes?: OnboardingPortalClasses;
  onLoaderStart?: (event: LoaderStart) => void;
  onLoadError?: (event: LoadError) => void;
  onStepChange?: (event: { step: AccountOnboardingStep }) => void;
  onBack?: () => void;
  backLabel?: string;
  logoHtml?: string;
  collectionOptions?: OnboardingCollectionOptions;
  fullTermsOfServiceUrl?: string;
  recipientTermsOfServiceUrl?: string;
  privacyPolicyUrl?: string;
}

export const OnboardingPortal: React.FC<OnboardingPortalProps> = ({
  className,
  style,
  locale,
  formatting,
  icons,
  layoutVariant,
  classes,
  onLoaderStart,
  onLoadError,
  onStepChange,
  onBack,
  backLabel,
  logoHtml,
  collectionOptions,
  fullTermsOfServiceUrl,
  recipientTermsOfServiceUrl,
  privacyPolicyUrl,
}) => {
  const { dialstack } = useDialstackComponents();
  const { containerRef, componentInstance } = useCreateComponent(dialstack, 'onboarding-portal');

  // Sync configuration props
  useUpdateWithSetter(componentInstance, locale, (c, v) => c.setLocale(v));
  useUpdateWithSetter(componentInstance, formatting, (c, v) => c.setFormatting(v));
  useUpdateWithSetter(componentInstance, icons, (c, v) => c.setIcons(v));
  useUpdateWithSetter(componentInstance, layoutVariant, (c, v) => c.setLayoutVariant(v));
  useUpdateWithSetter(componentInstance, classes, (c, v) => c.setClasses(v));

  // Sync collection and URL props
  React.useEffect(() => {
    if (!componentInstance) return;
    componentInstance.setCollectionOptions(collectionOptions ?? null);
  }, [componentInstance, collectionOptions]);

  React.useEffect(() => {
    if (!componentInstance) return;
    componentInstance.setFullTermsOfServiceUrl(fullTermsOfServiceUrl ?? null);
  }, [componentInstance, fullTermsOfServiceUrl]);

  React.useEffect(() => {
    if (!componentInstance) return;
    componentInstance.setRecipientTermsOfServiceUrl(recipientTermsOfServiceUrl ?? null);
  }, [componentInstance, recipientTermsOfServiceUrl]);

  React.useEffect(() => {
    if (!componentInstance) return;
    componentInstance.setPrivacyPolicyUrl(privacyPolicyUrl ?? null);
  }, [componentInstance, privacyPolicyUrl]);

  // Portal-specific props
  useUpdateWithSetter(componentInstance, backLabel, (c, v) => c.setBackLabel(v));

  React.useEffect(() => {
    if (!componentInstance) return;
    componentInstance.setLogoHtml(logoHtml);
  }, [componentInstance, logoHtml]);

  // Sync callbacks
  useUpdateWithSetter(componentInstance, onLoaderStart, (c, v) => c.setOnLoaderStart(v));
  useUpdateWithSetter(componentInstance, onLoadError, (c, v) => c.setOnLoadError(v));
  useUpdateWithSetter(componentInstance, onStepChange, (c, v) => c.setOnStepChange(v));
  useUpdateWithSetter(componentInstance, onBack, (c, v) => c.setOnBack(v));

  return <div ref={containerRef} className={className} style={style} />;
};
