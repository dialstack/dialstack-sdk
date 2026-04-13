/**
 * Top-level OnboardingPortal component.
 *
 * Creates its own OnboardingProgressStore (with DB sync), fetches account config,
 * and composes the portal shell: PortalSidebar + SplashScreen / OverviewScreen / wizard.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { create as createConfetti } from 'canvas-confetti';
import { STATIC_TOKENS, LIGHT_COLORS, DARK_COLORS } from './design-tokens';
import { ShadowContainer } from './ShadowRoot';
import { OnboardingProvider } from './OnboardingContext';
import { useOnboarding } from './OnboardingContext';
import { useOnboardingProgress } from './useOnboardingProgress';
import { PortalSidebar } from './PortalSidebar';
import { SplashScreen } from './SplashScreen';
import { OverviewScreen } from './OverviewScreen';
import { AccountStep } from './steps/account/AccountStep';
import { NumbersStep } from './steps/numbers/NumbersStep';
import { HardwareStep } from './steps/hardware/HardwareStep';
import { useOnboardingBootstrap } from './useOnboardingBootstrap';
import { mergePhoneNumbers } from './merge-phone-numbers';
import { useAppearance } from '../useAppearance';
import { defaultLocale } from '../../locales';
import type {
  OnboardingCollectionOptions,
  FormattingOptions,
  ComponentIcons,
  AccountOnboardingStep,
  PhoneNumberItem,
  DIDItem,
  NumberOrder,
  PortOrder,
} from '../../types';
import type { Locale } from '../../locales';
import PORTAL_STYLES from './styles/portal-styles.css';
import SPLASH_STYLES from './styles/splash-styles.css';
import OVERVIEW_STYLES from './styles/overview-styles.css';

const PORTAL_RESET = '* { box-sizing: border-box; font-family: var(--ds-font-family); }\n';
const PORTAL_STYLESHEETS = [PORTAL_RESET + PORTAL_STYLES, SPLASH_STYLES, OVERVIEW_STYLES];

export interface OnboardingPortalProps {
  locale?: Locale;
  formatting?: FormattingOptions;
  icons?: ComponentIcons;
  collectionOptions?: OnboardingCollectionOptions;
  fullTermsOfServiceUrl?: string;
  recipientTermsOfServiceUrl?: string;
  privacyPolicyUrl?: string;
  onBack?: () => void;
  backLabel?: string;
  logoHtml?: string;
  platformName?: string;
  theme?: 'light' | 'dark';
  appearance?: { variables?: { colorPrimary?: string; colorPrimaryHover?: string } };
  documentationUrl?: string;
  onScheduleCall?: () => void;
  onHelpSupport?: () => void;
  onStepChange?: (event: { step: AccountOnboardingStep }) => void;
  className?: string;
  style?: React.CSSProperties;
}

const portalErrorHandler = (err: unknown) =>
  console.warn('OnboardingPortal: failed to load shared data:', err);

export const OnboardingPortal: React.FC<OnboardingPortalProps> = (props) => {
  const locale = props.locale ?? defaultLocale;
  const { progressStore, sharedData, reloadSharedData, storeHydrated } =
    useOnboardingBootstrap(portalErrorHandler);

  if (!storeHydrated) return null;

  return (
    <OnboardingProvider
      progressStore={progressStore}
      accountConfig={sharedData.account?.config ?? null}
      account={sharedData.account}
      users={sharedData.users}
      extensions={sharedData.extensions}
      locations={sharedData.locations}
      reloadSharedData={reloadSharedData}
      locale={locale}
      formatting={props.formatting}
      icons={props.icons}
      collectionOptions={props.collectionOptions}
      platformName={props.platformName}
    >
      <PortalInner {...props} locale={locale} />
    </OnboardingProvider>
  );
};

// ============================================================================
// PortalInner — internal, not exported
// ============================================================================

type PortalInnerProps = OnboardingPortalProps & { locale: Locale };

const PortalInner: React.FC<PortalInnerProps> = (props) => {
  const { dialstack, progressStore, activeSteps, locale } = useOnboarding();
  const { currentStep } = useOnboardingProgress();

  // Determine initial view: skip splash if the user has existing progress.
  const [viewMode, setViewMode] = useState<'splash' | 'overview' | 'wizard'>(() => {
    const checkSteps: Array<'account' | 'numbers' | 'hardware'> = [
      'account',
      'numbers',
      'hardware',
    ];
    const hasProgress = checkSteps.some(
      (s) => progressStore.getStepProgressPercent(s) > 0 || progressStore.isStepComplete(s)
    );
    return hasProgress ? 'overview' : 'splash';
  });

  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberItem[]>([]);
  const isReviewNavRef = useRef(false);
  // Wahoo screen is shown at most once per session — subsequent Done clicks go to overview.
  const wahooSeenRef = useRef(false);

  // Keep a ref to onStepChange so the effect always calls the latest callback
  // without needing it in the dependency array (avoids stale closure).
  const onStepChangeRef = useRef(props.onStepChange);
  useLayoutEffect(() => {
    onStepChangeRef.current = props.onStepChange;
  });

  // Wire onStepChange and handle final_complete redirect logic.
  useEffect(() => {
    if (currentStep === 'final_complete') {
      const stepsWithoutComplete = activeSteps.filter((s) => s !== 'final_complete');
      const firstIncomplete = stepsWithoutComplete.find(
        (s) => !progressStore.isStepComplete(s as 'account' | 'numbers' | 'hardware')
      );
      if (firstIncomplete) {
        progressStore.setCurrentStep(firstIncomplete);
        return;
      }
      // Wahoo already shown — go to overview instead of showing it again.
      // Use queueMicrotask to avoid cascading setState within the effect.
      if (wahooSeenRef.current) {
        queueMicrotask(() => setViewMode('overview'));
        return;
      }
      // First time reaching final_complete — mark seen and let it render.
      wahooSeenRef.current = true;
    } else {
      // If all steps done and this wasn't a review nav, redirect to final_complete.
      if (!isReviewNavRef.current) {
        const stepsWithoutComplete = activeSteps.filter((s) => s !== 'final_complete');
        const allDone =
          stepsWithoutComplete.length > 0 &&
          stepsWithoutComplete.every((s) =>
            progressStore.isStepComplete(s as 'account' | 'numbers' | 'hardware')
          );
        if (allDone) {
          progressStore.setCurrentStep('final_complete');
          return;
        }
      }
      isReviewNavRef.current = false;
    }

    onStepChangeRef.current?.({ step: currentStep });
  }, [currentStep, activeSteps, progressStore]);

  // Fetch phone numbers when switching to overview and numbers step is active.
  useEffect(() => {
    if (viewMode !== 'overview') return;
    if (!activeSteps.includes('numbers')) return;

    let cancelled = false;
    void (async () => {
      try {
        const [dids, orders, ports] = await Promise.all([
          dialstack.fetchAllPages<DIDItem>((opts) => dialstack.phoneNumbers.list(opts)),
          dialstack.fetchAllPages<NumberOrder>((opts) => dialstack.phoneNumberOrders.list(opts)),
          dialstack.fetchAllPages<PortOrder>((opts) => dialstack.portOrders.list(opts)),
        ]);
        if (!cancelled) setPhoneNumbers(mergePhoneNumbers(dids, orders, ports));
      } catch {
        // Non-critical — overview still works without phone numbers
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewMode, activeSteps, dialstack]);

  const handleSelectStep = useCallback(
    (step: string) => {
      isReviewNavRef.current = true;
      progressStore.setCurrentStep(step as AccountOnboardingStep);
      setViewMode('wizard');
    },
    [progressStore]
  );

  const handleOverview = useCallback(() => {
    setViewMode('overview');
  }, []);

  const handleStart = useCallback(() => {
    const firstStep = activeSteps.find((s) => s !== 'final_complete') ?? 'account';
    progressStore.setCurrentStep(firstStep as AccountOnboardingStep);
    setViewMode('wizard');
  }, [activeSteps, progressStore]);

  const instanceAppearance = useAppearance(dialstack);
  const isDark = (props.theme ?? instanceAppearance?.theme ?? 'light') === 'dark';
  const colorPrimary =
    props.appearance?.variables?.colorPrimary ?? instanceAppearance?.variables?.colorPrimary;
  const colorPrimaryHover =
    props.appearance?.variables?.colorPrimaryHover ??
    instanceAppearance?.variables?.colorPrimaryHover;
  const sidebarBg = colorPrimary ?? '#1c1247';
  const sidebarActive = colorPrimary ? `color-mix(in srgb, ${colorPrimary}, white 20%)` : '#4c3c8e';
  const splashBg = colorPrimary ? `color-mix(in srgb, ${colorPrimary}, black 15%)` : '#2d2065';
  const splashShape = colorPrimary ? `color-mix(in srgb, ${colorPrimary}, white 30%)` : '#8A7ACE';
  const splashShelf = colorPrimary ? `color-mix(in srgb, ${colorPrimary}, white 70%)` : '#d1c6ff';

  const themeColors: Record<string, string> = isDark
    ? { ...LIGHT_COLORS, ...DARK_COLORS }
    : { ...LIGHT_COLORS };

  const effectivePrimary = colorPrimary ?? LIGHT_COLORS['--ds-color-primary'];
  const effectivePrimaryHover =
    colorPrimaryHover ??
    (colorPrimary
      ? `color-mix(in srgb, ${colorPrimary}, black 10%)`
      : LIGHT_COLORS['--ds-color-primary-hover']);

  const portalStyle = useMemo(() => {
    // Build portal source vars for OnboardingLayout's DEFAULT_VARS
    const portalColorVars = Object.fromEntries(
      Object.entries(themeColors).map(([k, v]) => [
        k.replace('--ds-color-', '--ds-portal-color-'),
        v,
      ])
    );

    return {
      // Portal-specific vars
      '--ds-portal-sidebar-bg': sidebarBg,
      '--ds-portal-sidebar-active': sidebarActive,
      '--ds-portal-splash-bg': splashBg,
      '--ds-portal-splash-shape': splashShape,
      '--ds-portal-splash-shelf': splashShelf,
      // Portal color source — read by OnboardingLayout DEFAULT_VARS so wizard
      // content inherits the same primary color as the portal chrome.
      '--ds-portal-color-primary': effectivePrimary,
      '--ds-portal-color-primary-hover': effectivePrimaryHover,
      ...portalColorVars,
      // DS token defaults (mirrors base-component.ts generateCssVariables) —
      // theme-aware values for Splash/Overview/Sidebar (non .ds-onboarding-root descendants).
      ...themeColors,
      '--ds-color-primary': effectivePrimary,
      '--ds-color-primary-hover': effectivePrimaryHover,
      ...STATIC_TOKENS,
      '--ds-focus-ring': `0 0 0 2px ${effectivePrimary}`,
      ...props.style,
    } as React.CSSProperties;
  }, [
    sidebarBg,
    sidebarActive,
    splashBg,
    splashShape,
    splashShelf,
    effectivePrimary,
    effectivePrimaryHover,
    themeColors,
    props.style,
  ]);

  return (
    <ShadowContainer stylesheets={PORTAL_STYLESHEETS} style={{ height: '100vh', width: '100%' }}>
      <div
        className={`portal-layout${props.className ? ` ${props.className}` : ''}`}
        style={portalStyle}
      >
        <PortalSidebar
          viewMode={viewMode}
          onSelectStep={handleSelectStep}
          onOverview={handleOverview}
          onBack={props.onBack}
          backLabel={props.backLabel}
          logoHtml={props.logoHtml}
          platformName={props.platformName}
          onHelpSupport={props.onHelpSupport}
        />

        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {viewMode === 'splash' && (
            <SplashScreen
              logoHtml={props.logoHtml}
              platformName={props.platformName}
              onStart={handleStart}
            />
          )}

          {viewMode === 'overview' && (
            <OverviewScreen
              onGoToStep={handleSelectStep}
              phoneNumbers={phoneNumbers}
              documentationUrl={props.documentationUrl}
              onScheduleCall={props.onScheduleCall}
            />
          )}

          {viewMode === 'wizard' && currentStep !== 'final_complete' && (
            <div className="portal-main">
              <div
                className="portal-wizard-header"
                role="button"
                tabIndex={0}
                onClick={handleOverview}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleOverview();
                }}
              >
                ← {locale.onboardingPortal.saveAndExit}
              </div>
              <PortalStepRouter />
            </div>
          )}

          {viewMode === 'wizard' && currentStep === 'final_complete' && (
            <FinalCompleteScreen
              locale={locale}
              fullTermsOfServiceUrl={props.fullTermsOfServiceUrl}
              recipientTermsOfServiceUrl={props.recipientTermsOfServiceUrl}
              privacyPolicyUrl={props.privacyPolicyUrl}
              onDone={handleOverview}
            />
          )}
        </div>
      </div>
    </ShadowContainer>
  );
};

// ============================================================================
// FinalCompleteScreen — "Wahoo!" confetti celebration
// ============================================================================

interface FinalCompleteScreenProps {
  locale: Locale;
  fullTermsOfServiceUrl?: string;
  recipientTermsOfServiceUrl?: string;
  privacyPolicyUrl?: string;
  onDone: () => void;
}

const FinalCompleteScreen: React.FC<FinalCompleteScreenProps> = ({
  locale,
  fullTermsOfServiceUrl,
  recipientTermsOfServiceUrl,
  privacyPolicyUrl,
  onDone,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const confettiRef = useRef<ReturnType<typeof createConfetti> | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement;
    if (!container) return;
    canvas.width = container.clientWidth || 300;
    canvas.height = container.clientHeight || 500;
    if (!canvas.getContext('2d')) return;

    const fire = createConfetti(canvas, { resize: true });
    confettiRef.current = fire;

    const colors = [
      '#e91e63',
      '#9c27b0',
      '#2196f3',
      '#4caf50',
      '#ff9800',
      '#ffeb3b',
      '#00bcd4',
      '#ff5722',
    ];
    fire({
      particleCount: 80,
      spread: 70,
      origin: { x: 0.5, y: 0.6 },
      colors,
      startVelocity: 45,
      gravity: 1.2,
      ticks: 300,
      scalar: 1.1,
    });
    const t = setTimeout(() => {
      fire({
        particleCount: 50,
        spread: 100,
        origin: { x: 0.5, y: 0.6 },
        colors,
        startVelocity: 35,
        gravity: 1,
        ticks: 250,
        scalar: 0.9,
      });
    }, 150);

    return () => {
      clearTimeout(t);
      confettiRef.current?.reset();
    };
  }, []);

  const legalLinks: React.ReactNode[] = [];
  if (fullTermsOfServiceUrl)
    legalLinks.push(
      <a key="tos" href={fullTermsOfServiceUrl} target="_blank" rel="noopener noreferrer">
        {locale.accountOnboarding.legal.termsOfService}
      </a>
    );
  if (recipientTermsOfServiceUrl)
    legalLinks.push(
      <a key="rtos" href={recipientTermsOfServiceUrl} target="_blank" rel="noopener noreferrer">
        {locale.accountOnboarding.legal.recipientTerms}
      </a>
    );
  if (privacyPolicyUrl)
    legalLinks.push(
      <a key="pp" href={privacyPolicyUrl} target="_blank" rel="noopener noreferrer">
        {locale.accountOnboarding.legal.privacyPolicy}
      </a>
    );

  const legalSection =
    legalLinks.length > 0 ? (
      <p
        style={{
          fontSize: 'var(--ds-font-size-small)',
          color: 'var(--ds-color-text-secondary)',
          textAlign: 'center',
          marginTop: 'var(--ds-layout-spacing-md)',
        }}
      >
        {locale.accountOnboarding.legal.prefix}{' '}
        {legalLinks.reduce<React.ReactNode[]>((acc, link, i) => {
          if (i === 0) return [link];
          return [...acc, ` ${locale.accountOnboarding.legal.and} `, link];
        }, [])}
      </p>
    ) : null;

  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        minHeight: '100%',
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      <h1
        style={{
          fontSize: 80,
          fontWeight: 900,
          color: 'var(--ds-color-text, #1a1a1a)',
          margin: '0 0 8px 0',
          textAlign: 'center',
          zIndex: 1,
        }}
      >
        {locale.accountOnboarding.complete.title}
      </h1>
      <p
        style={{
          fontSize: 18,
          color: 'var(--ds-color-text-secondary, rgba(0,0,0,0.6))',
          textAlign: 'center',
          maxWidth: 500,
          margin: 0,
          zIndex: 1,
        }}
      >
        {locale.accountOnboarding.complete.subtitle}
      </p>
      {legalSection}
      <div style={{ marginTop: 16, zIndex: 1 }}>
        <button
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 28px',
            height: 44,
            minWidth: 150,
            background: 'var(--ds-portal-color-primary, #6772E5)',
            color: '#fff',
            border: 'none',
            borderRadius: 100,
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          onClick={onDone}
        >
          {locale.accountOnboarding.nav.exit}
        </button>
      </div>
    </div>
  );
};

// Reads current step from the portal's OnboardingProvider (not a nested one).
// Wraps step content in a persistent div that animates height on step change.
const PortalStepRouter: React.FC = React.memo(() => {
  const { currentStep } = useOnboardingProgress();

  return (
    <>
      {currentStep === 'account' && <AccountStep />}
      {currentStep === 'numbers' && <NumbersStep />}
      {currentStep === 'hardware' && <HardwareStep />}
    </>
  );
});
PortalStepRouter.displayName = 'PortalStepRouter';
