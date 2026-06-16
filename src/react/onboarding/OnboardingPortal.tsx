/**
 * Top-level OnboardingPortal component.
 *
 * Hydrates the progress store from derived account data (no DB sync — onboarding
 * status is computed live from DIDs, devices, locations, etc.) and composes the
 * portal shell: PortalSidebar + SplashScreen / OverviewScreen / wizard.
 *
 * Splash is gated on a per-browser+account localStorage flag — the flag flips
 * true when the user clicks "Start Onboarding," so subsequent visits in the
 * same browser skip splash regardless of step progress. The confetti screen
 * fires only on the in-session transition into onboarding_complete, so it is
 * never re-shown on reload.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { create as createConfetti } from 'canvas-confetti';
import { computePortalCssVars } from './design-tokens';
import { ShadowContainer } from './ShadowRoot';
import { OnboardingProvider, findNextIncompleteStep } from './OnboardingContext';
import type { StepEntryMode } from './OnboardingContext';
import type { StepName } from './constants';
import { useOnboarding } from './OnboardingContext';
import { useOnboardingProgress } from './useOnboardingProgress';
import { useStartedFlag } from './useStartedFlag';
import { PortalSidebar } from './PortalSidebar';
import { SplashScreen } from './SplashScreen';
import { OverviewScreen } from './OverviewScreen';
import { AccountStep } from './steps/account/AccountStep';
import { NumbersStep } from './steps/numbers/NumbersStep';
import { HardwareStep } from './steps/hardware/HardwareStep';
import { useOnboardingBootstrap } from './useOnboardingBootstrap';
import { PortalActionsContext } from './PortalActionsContext';
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
  const [entryMode, setEntryMode] = useState<StepEntryMode>('continue');

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
      entryMode={entryMode}
    >
      <PortalInner {...props} locale={locale} setEntryMode={setEntryMode} />
    </OnboardingProvider>
  );
};

// ============================================================================
// PortalInner — internal, not exported
// ============================================================================

type PortalInnerProps = OnboardingPortalProps & {
  locale: Locale;
  setEntryMode: (mode: StepEntryMode) => void;
};

const PortalInner: React.FC<PortalInnerProps> = (props) => {
  const { dialstack, progressStore, activeSteps, account, locale } = useOnboarding();
  const { currentStep } = useOnboardingProgress();
  const { setEntryMode } = props;

  // Re-evaluate auto-redirect to Wahoo whenever step completion changes.
  // useOnboardingProgress already subscribes to progressStore.notify() — read
  // isStepComplete here so the snapshot the effect captures is fresh, and
  // include it as a dep so the effect fires when an async reload flips the
  // last incomplete step into the done bucket.
  const completionKey = activeSteps
    .filter((s) => s !== 'final_complete')
    .map((s) => (progressStore.isStepComplete(s as StepName) ? '1' : '0'))
    .join('');

  const { started: localStartedFlag, setStarted: persistStartedFlag } = useStartedFlag(account?.id);

  // Splash shows only on a fresh account. account.onboarding_complete guards
  // against a stale local derive when the account is already complete.
  // The localStorage flag suppresses splash after the user has clicked Get
  // Started in this browser+account.
  const [viewMode, setViewMode] = useState<'splash' | 'overview' | 'wizard'>(() => {
    if (localStartedFlag || account?.onboarding_complete) return 'overview';
    const anyStepDone =
      progressStore.isStepComplete('account') ||
      progressStore.isStepComplete('numbers') ||
      progressStore.isStepComplete('hardware');
    return anyStepDone ? 'overview' : 'splash';
  });

  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberItem[]>([]);
  const isReviewNavRef = useRef(false);

  // Wahoo is one-shot per portal mount. Preseed confettiShown when
  // account.onboarding_complete is already true so a reload after completion
  // never re-celebrates. account.onboarding_complete is the single source of
  // truth for "done" — derive is only for per-substep wizard hints, so the
  // gate must not consult it. wahooActive flips only between the auto-redirect
  // and Finish.
  const [confettiShown, setConfettiShown] = useState(() => account?.onboarding_complete === true);
  const [wahooActive, setWahooActive] = useState(false);

  // Ref keeps the effect off the onStepChange identity (avoids stale closure
  // without putting the user-supplied callback in the dep array).
  const onStepChangeRef = useRef(props.onStepChange);
  useLayoutEffect(() => {
    onStepChangeRef.current = props.onStepChange;
  });

  // The effect below also re-runs on completion/flag ticks where currentStep
  // is unchanged; track the last step so onStepChange fires only on a real
  // step change, not on every re-evaluation.
  const lastNotifiedStepRef = useRef<typeof currentStep | undefined>(undefined);

  useEffect(() => {
    if (currentStep === 'final_complete') {
      // account.onboarding_complete is the completion authority. When the
      // server reports the account done, show the celebration rather than
      // letting findNextIncompleteStep (driven by the local per-substep derive)
      // bounce to a step the client thinks is unfinished — that bounce, paired
      // with the overview auto-redirect below, would loop forever.
      const next =
        account?.onboarding_complete === true
          ? 'final_complete'
          : findNextIncompleteStep(activeSteps, progressStore, 'final_complete');
      if (next !== 'final_complete') {
        progressStore.setCurrentStep(next);
        return;
      }
      // All steps done. First arrival this mount: show Wahoo (and remember
      // that we did). Subsequent arrivals (e.g., a Review pass through an
      // already-complete step that ends with findNextIncompleteStep) bounce
      // to overview without re-painting the celebration.
      if (!confettiShown) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- first transition into all-done state
        setConfettiShown(true);
        setWahooActive(true);
        // The render branch for the celebration requires renderViewMode ===
        // 'wizard'. The wizard click-Next path is already in 'wizard'; the
        // auto-redirect path arrives here from 'overview', so flip it or the
        // FinalCompleteScreen is silently skipped.
        setViewMode('wizard');
        return;
      }
      if (!wahooActive && viewMode !== 'overview') {
        setViewMode('overview');
        return;
      }
    } else {
      // Auto-redirect to Wahoo when the server reports the account complete
      // while the user is on the overview screen (a reloadSharedData after the
      // last step refetches account.onboarding_complete). Gate on the server
      // flag — the single source of truth — not on derive. Gate on viewMode ===
      // 'overview' so we don't pre-empt a step's local "Setup Complete" screen;
      // the wizard owns the transition once the user has clicked Next inside a
      // step.
      if (
        !isReviewNavRef.current &&
        !confettiShown &&
        viewMode === 'overview' &&
        account?.onboarding_complete === true
      ) {
        progressStore.setCurrentStep('final_complete');
        return;
      }
      isReviewNavRef.current = false;
    }

    if (lastNotifiedStepRef.current !== currentStep) {
      lastNotifiedStepRef.current = currentStep;
      onStepChangeRef.current?.({ step: currentStep });
    }
  }, [
    currentStep,
    activeSteps,
    progressStore,
    wahooActive,
    viewMode,
    confettiShown,
    completionKey,
    account?.onboarding_complete,
  ]);

  // Synchronous render override: wizard navigation can land on final_complete
  // without wahooActive (Review pass through a completed step). Display
  // overview instead — the effect above syncs the actual viewMode state so
  // subsequent renders are consistent.
  const renderViewMode =
    currentStep === 'final_complete' && !wahooActive && confettiShown ? 'overview' : viewMode;

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
    (step: string, mode: StepEntryMode = 'continue') => {
      isReviewNavRef.current = true;
      setEntryMode(mode);
      progressStore.setCurrentStep(step as AccountOnboardingStep);
      setViewMode('wizard');
    },
    [progressStore, setEntryMode]
  );

  const handleOverview = useCallback(() => {
    setViewMode('overview');
  }, []);
  const portalActions = useMemo(() => ({ onSaveAndExit: handleOverview }), [handleOverview]);

  const handleConfettiDone = useCallback(() => {
    setWahooActive(false);
    setViewMode('overview');
  }, []);

  const handleStart = useCallback(() => {
    persistStartedFlag();

    const firstIncomplete = activeSteps.find(
      (s) => s !== 'final_complete' && !progressStore.isStepComplete(s as StepName)
    );
    if (!firstIncomplete) {
      setViewMode('overview');
      return;
    }
    setEntryMode('continue');
    progressStore.setCurrentStep(firstIncomplete as AccountOnboardingStep);
    setViewMode('wizard');
  }, [activeSteps, progressStore, setEntryMode, persistStartedFlag]);

  const instanceAppearance = useAppearance(dialstack);
  const isDark = (props.theme ?? instanceAppearance?.theme ?? 'light') === 'dark';
  const colorPrimary =
    props.appearance?.variables?.colorPrimary ?? instanceAppearance?.variables?.colorPrimary;
  const colorPrimaryHover =
    props.appearance?.variables?.colorPrimaryHover ??
    instanceAppearance?.variables?.colorPrimaryHover;

  const portalStyle = useMemo(
    () => computePortalCssVars({ colorPrimary, colorPrimaryHover, isDark, baseStyle: props.style }),
    [colorPrimary, colorPrimaryHover, isDark, props.style]
  );

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
          {renderViewMode === 'splash' && (
            <SplashScreen
              logoHtml={props.logoHtml}
              platformName={props.platformName}
              onStart={handleStart}
            />
          )}

          {renderViewMode === 'overview' && (
            <OverviewScreen
              onGoToStep={handleSelectStep}
              phoneNumbers={phoneNumbers}
              documentationUrl={props.documentationUrl}
              onScheduleCall={props.onScheduleCall}
            />
          )}

          {renderViewMode === 'wizard' && currentStep !== 'final_complete' && (
            <PortalActionsContext.Provider value={portalActions}>
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
            </PortalActionsContext.Provider>
          )}

          {renderViewMode === 'wizard' && currentStep === 'final_complete' && wahooActive && (
            <FinalCompleteScreen
              locale={locale}
              fullTermsOfServiceUrl={props.fullTermsOfServiceUrl}
              recipientTermsOfServiceUrl={props.recipientTermsOfServiceUrl}
              privacyPolicyUrl={props.privacyPolicyUrl}
              onDone={handleConfettiDone}
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
