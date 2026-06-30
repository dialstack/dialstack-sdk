/**
 * SsaAcceptanceGate — the first-login subscription-agreement acceptance screen.
 *
 * Rendered by OnboardingPortal as a top-level, fully blocking gate: until the
 * account owner accepts the current agreement, this replaces the entire portal
 * (no sidebar, no exit). It shows even when onboarding is otherwise complete, so
 * acceptance can never be routed around.
 *
 * The full agreement is embedded from its canonical URL; the owner affirms an
 * explicit checkbox carrying the acceptance language (which includes the
 * 911/E911 acknowledgement). On submit, acceptance is recorded against the
 * account; the capture method and the pricing snapshot are derived server-side.
 */

import React, { useMemo, useState } from 'react';
import { useDialstackComponents } from '@dialstack/sdk/react';
import { ApiError } from '../../core/instance';
import { computePortalCssVars, generateLayoutCssVars } from './design-tokens';
import { ShadowContainer } from './ShadowRoot';
import { useAppearance } from '../useAppearance';
import type { Locale } from '../../locales';
import type { Tos, AccountPricing, FormattingOptions } from '../../types';
import SHARED_STYLES from './styles/styles.css';

const GATE_CSS = `
.ssa-gate {
  height: 100%;
  width: 100%;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  background: var(--ds-color-background, #fff);
  color: var(--ds-color-text, #1a1a1a);
}
.ssa-gate-inner {
  width: 100%;
  max-width: 760px;
  padding: 32px 24px 48px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.ssa-gate h1 { font-size: 24px; font-weight: 700; margin: 0; }
.ssa-gate-intro { font-size: 15px; color: var(--ds-color-text-secondary, rgba(0,0,0,0.6)); margin: 0; }
.ssa-pricing { display: flex; flex-wrap: wrap; gap: 16px; }
.ssa-pricing-item { display: flex; flex-direction: column; gap: 2px; }
.ssa-pricing-label { font-size: 12px; color: var(--ds-color-text-secondary, rgba(0,0,0,0.6)); }
.ssa-pricing-value { font-size: 18px; font-weight: 600; }
.ssa-agreement {
  height: 420px;
  overflow-y: auto;
  border: 1px solid var(--ds-color-border, rgba(0,0,0,0.12));
  border-radius: 12px;
  padding: 20px 24px;
  background: var(--ds-color-background, #fff);
  font-size: 13px;
  line-height: 1.55;
}
.ssa-agreement h2 { font-size: 15px; font-weight: 700; margin: 24px 0 8px; }
.ssa-agreement h3 { font-size: 13px; font-weight: 700; margin: 16px 0 6px; }
.ssa-agreement p { margin: 0 0 10px; }
.ssa-agreement ul { margin: 0 0 10px; padding-left: 20px; }
.ssa-agreement li { margin-bottom: 6px; }
.ssa-agreement .lead-in { font-weight: 600; }
.ssa-agreement .ssa-intro { font-style: italic; color: var(--ds-color-text-secondary, rgba(0,0,0,0.6)); }
.ssa-agreement .ssa-note { font-size: 12px; color: var(--ds-color-text-secondary, rgba(0,0,0,0.6)); }
.ssa-agreement .ssa-callout {
  border: 1px solid var(--ds-color-border, rgba(0,0,0,0.12));
  border-radius: 8px;
  padding: 12px 14px;
  margin: 0 0 12px;
  background: rgba(0,0,0,0.02);
}
.ssa-agreement .ssa-callout-warn {
  border-color: var(--ds-color-warning, #f5a623);
  background: rgba(245,166,35,0.08);
}
.ssa-agreement .ssa-callout-label {
  display: block;
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}
.ssa-affirm { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; }
.ssa-affirm input { margin-top: 3px; flex: 0 0 auto; }
.ssa-actions { display: flex; align-items: center; gap: 16px; }
.ssa-link { font-size: 13px; }
`;

const STYLESHEETS = [
  '* { box-sizing: border-box; font-family: var(--ds-font-family); }\n' +
    generateLayoutCssVars() +
    SHARED_STYLES +
    GATE_CSS,
];

export interface SsaAcceptanceGateProps {
  tos: Tos;
  locale: Locale;
  formatting?: FormattingOptions;
  theme?: 'light' | 'dark';
  appearance?: { variables?: { colorPrimary?: string; colorPrimaryHover?: string } };
  /** Called after the agreement is successfully accepted. */
  onAccepted: () => void;
}

function formatRate(cents: number | null, locale: string): string | null {
  if (cents == null) return null;
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

const PricingSummary: React.FC<{
  pricing: AccountPricing;
  locale: Locale;
  formatting?: FormattingOptions;
}> = ({ pricing, locale, formatting }) => {
  const ssa = locale.accountOnboarding.ssa;
  const numberLocale = formatting?.dateLocale ?? 'en-US';
  const rows: Array<{ label: string; value: string | null }> = [
    { label: ssa.perUser, value: formatRate(pricing.per_user_rate, numberLocale) },
    { label: ssa.perNumber, value: formatRate(pricing.per_did_rate, numberLocale) },
    {
      label: ssa.perAiLocation,
      value: formatRate(pricing.per_voiceai_location_rate, numberLocale),
    },
  ];
  return (
    <div className="card">
      <div className="ssa-pricing-label" style={{ marginBottom: 12, fontWeight: 600 }}>
        {ssa.pricingTitle}
      </div>
      <div className="ssa-pricing">
        {rows.map((r) => (
          <div className="ssa-pricing-item" key={r.label}>
            <span className="ssa-pricing-label">{r.label}</span>
            <span className="ssa-pricing-value">
              {r.value ? `${r.value}${ssa.perMonthSuffix}` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/** Theme-derived host style + ShadowContainer props shared by gate surfaces. */
function useGateShell(
  theme: 'light' | 'dark' | undefined,
  appearance: SsaAcceptanceGateProps['appearance'],
  dialstack: ReturnType<typeof useDialstackComponents>['dialstack']
): React.CSSProperties {
  const instanceAppearance = useAppearance(dialstack);
  const isDark = (theme ?? instanceAppearance?.theme ?? 'light') === 'dark';
  const colorPrimary =
    appearance?.variables?.colorPrimary ?? instanceAppearance?.variables?.colorPrimary;
  const colorPrimaryHover =
    appearance?.variables?.colorPrimaryHover ?? instanceAppearance?.variables?.colorPrimaryHover;
  return useMemo(
    () => computePortalCssVars({ colorPrimary, colorPrimaryHover, isDark }),
    [colorPrimary, colorPrimaryHover, isDark]
  );
}

export const SsaAcceptanceGate: React.FC<SsaAcceptanceGateProps> = ({
  tos,
  locale,
  formatting,
  theme,
  appearance,
  onAccepted,
}) => {
  const { dialstack } = useDialstackComponents();
  const ssa = locale.accountOnboarding.ssa;

  // The agreement shown/accepted is held locally so a stale-version (409)
  // response can refresh it in place before the user re-affirms.
  const [currentTos, setCurrentTos] = useState<Tos>(tos);
  const [affirmed, setAffirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hostStyle = useGateShell(theme, appearance, dialstack);

  // Pricing must be set for acceptance to be recordable. When it is missing we
  // surface a dead-end message rather than an Accept button that would 422.
  const pricingMissing =
    !currentTos.pricing ||
    currentTos.pricing.per_user_rate == null ||
    currentTos.pricing.per_did_rate == null ||
    currentTos.pricing.per_voiceai_location_rate == null;

  // Re-fetch the agreement in place (used by the missing-body retry below).
  const reloadAgreement = async () => {
    const fresh = await dialstack.account.tos.retrieve({ expand: ['pricing'] });
    setCurrentTos(fresh);
  };

  const handleAccept = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await dialstack.account.tos.accept(currentTos.version);
      onAccepted();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // The agreement changed under us. Pull the current version so the user
        // reviews and affirms the latest text instead of re-posting the stale one.
        setError(ssa.errors.stale);
        setAffirmed(false);
        try {
          const fresh = await dialstack.account.tos.retrieve({ expand: ['pricing'] });
          setCurrentTos(fresh);
        } catch {
          /* keep the stale message; a reload will recover */
        }
      } else if (err instanceof ApiError && err.status === 422) {
        setError(ssa.errors.pricingMissing);
      } else {
        setError(ssa.errors.generic);
      }
      setSubmitting(false);
    }
  };

  // Fail closed when the agreement body is absent — an older API mid-deploy, a
  // stale/cached response, or a 409 refresh that returned a body-less document.
  // Never let the user accept an agreement whose body was not shown; route to the
  // same retry screen as a load failure (so they have a way forward), and the
  // narrowing makes `currentTos.body` a guaranteed string below.
  if (!currentTos.body) {
    return (
      <SsaGateLoadError
        locale={locale}
        theme={theme}
        appearance={appearance}
        onRetry={reloadAgreement}
      />
    );
  }

  return (
    <ShadowContainer stylesheets={STYLESHEETS} style={{ height: '100vh', width: '100%' }}>
      <div className="ssa-gate" style={hostStyle}>
        <div className="ssa-gate-inner">
          <h1>{ssa.title}</h1>
          <p className="ssa-gate-intro">{ssa.intro}</p>

          {currentTos.pricing && !pricingMissing && (
            <PricingSummary pricing={currentTos.pricing} locale={locale} formatting={formatting} />
          )}

          {/* Agreement body served by the tos API (the single source of truth,
              pinned to the accepted version). It is first-party-authored,
              DialStack-owned legal text with no user input or interpolation, so
              rendering it raw is not an injection vector. Revisit if the body
              ever becomes per-account or templated. A missing body never reaches
              here — it fails closed above. */}
          <div
            className="ssa-agreement"
            role="region"
            aria-label={ssa.agreementLabel}
            tabIndex={0}
            dangerouslySetInnerHTML={{ __html: currentTos.body }}
          />

          <a
            className="ssa-link btn-link"
            href={currentTos.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {ssa.openInNewTab}
          </a>

          {pricingMissing ? (
            <div className="form-error" role="alert">
              {ssa.errors.pricingMissing}
            </div>
          ) : (
            <>
              <label className="ssa-affirm">
                <input
                  type="checkbox"
                  checked={affirmed}
                  disabled={submitting}
                  onChange={(e) => setAffirmed(e.target.checked)}
                />
                <span>{currentTos.content}</span>
              </label>

              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}

              <div className="ssa-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!affirmed || submitting}
                  onClick={handleAccept}
                >
                  {submitting ? ssa.submitting : ssa.accept}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </ShadowContainer>
  );
};

export interface SsaGateLoadErrorProps {
  locale: Locale;
  theme?: 'light' | 'dark';
  appearance?: { variables?: { colorPrimary?: string; colorPrimaryHover?: string } };
  /** Retry loading the agreement. */
  onRetry: () => void | Promise<void>;
}

/**
 * Blocking screen shown when the agreement could not be loaded. The gate fails
 * closed — the portal stays inaccessible and the only action is to retry.
 */
export const SsaGateLoadError: React.FC<SsaGateLoadErrorProps> = ({
  locale,
  theme,
  appearance,
  onRetry,
}) => {
  const { dialstack } = useDialstackComponents();
  const loadError = locale.accountOnboarding.ssa.loadError;
  const [retrying, setRetrying] = useState(false);
  const hostStyle = useGateShell(theme, appearance, dialstack);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <ShadowContainer stylesheets={STYLESHEETS} style={{ height: '100vh', width: '100%' }}>
      <div className="ssa-gate" style={hostStyle}>
        <div className="ssa-gate-inner">
          <h1>{loadError.title}</h1>
          <p className="ssa-gate-intro" role="alert">
            {loadError.description}
          </p>
          <div className="ssa-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={retrying}
              onClick={handleRetry}
            >
              {retrying ? loadError.retrying : loadError.retry}
            </button>
          </div>
        </div>
      </div>
    </ShadowContainer>
  );
};
