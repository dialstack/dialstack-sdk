import React from 'react';
import type { NumState, Dispatcher, TFn } from '../types';
import { PORT_SVG, PLUS_CIRCLE_SVG } from '../../../icons';
import { SkeletonLine, SkeletonCircle, SkeletonCard } from '../../../components/Skeleton';

export function OverviewContent({
  state,
  t,
  dispatch,
  loadNumbers,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
  loadNumbers: () => Promise<void>;
}) {
  if (state.isLoadingNumbers)
    return (
      <div>
        {/* Action card skeletons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {[0, 1].map((i) => (
            <SkeletonCard key={i}>
              <SkeletonCircle size="36px" />
              <SkeletonLine
                width="140px"
                height="16px"
                style={{ marginTop: 12, marginBottom: 6 }}
              />
              <SkeletonLine width="200px" height="12px" />
            </SkeletonCard>
          ))}
        </div>
        {/* Phone card skeletons */}
        {[0, 1].map((i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 0',
              borderTop: '1px solid var(--ds-color-border-subtle)',
            }}
          >
            <SkeletonCircle size="32px" />
            <div style={{ flex: 1 }}>
              <SkeletonLine width="140px" height="16px" style={{ marginBottom: 4 }} />
              <SkeletonLine width="80px" height="12px" />
            </div>
          </div>
        ))}
      </div>
    );
  if (state.loadError) {
    return (
      <>
        <div className="inline-alert error">{state.loadError}</div>
        <button
          className="btn btn-secondary"
          style={{ marginTop: 'var(--ds-layout-spacing-sm)' }}
          onClick={() => void loadNumbers()}
        >
          {t('accountOnboarding.numbers.overview.retry')}
        </button>
      </>
    );
  }
  const startOrder = () => {
    dispatch({ type: 'order_reset' });
    dispatch({ type: 'set_substep', subStep: 'order-search' });
  };
  const startPort = () => {
    dispatch({ type: 'port_reset' });
    dispatch({ type: 'set_substep', subStep: 'port-numbers' });
  };
  return (
    <>
      <div className="num-action-cards">
        {/* SAFETY: PORT_SVG and PLUS_CIRCLE_SVG are static SVG constants */}
        <div
          className="num-action-card"
          role="button"
          tabIndex={0}
          onClick={startPort}
          onKeyDown={(e) => e.key === 'Enter' && startPort()}
        >
          {/* nosemgrep: javascript.react.dangerouslysetinnerhtml -- trusted server-generated branding content */}
          <div className="num-action-card-icon" dangerouslySetInnerHTML={{ __html: PORT_SVG }} />
          <div className="num-action-card-body">
            <div className="num-action-card-title">
              {t('accountOnboarding.numbers.overview.portExisting')}
            </div>
            <div className="num-action-card-desc">
              {t('accountOnboarding.numbers.overview.portExistingDesc')}
            </div>
          </div>
        </div>
        <div
          className="num-action-card"
          role="button"
          tabIndex={0}
          onClick={startOrder}
          onKeyDown={(e) => e.key === 'Enter' && startOrder()}
        >
          {/* nosemgrep: javascript.react.dangerouslysetinnerhtml -- trusted server-generated branding content */}
          <div
            className="num-action-card-icon"
            dangerouslySetInnerHTML={{ __html: PLUS_CIRCLE_SVG }}
          />
          <div className="num-action-card-body">
            <div className="num-action-card-title">
              {t('accountOnboarding.numbers.overview.requestNew')}
            </div>
            <div className="num-action-card-desc">
              {t('accountOnboarding.numbers.overview.requestNewDesc')}
            </div>
          </div>
        </div>
      </div>
      {state.phoneNumbers.some((p) => p.number_class === 'temporary') && (
        <div className="inline-alert info" style={{ marginBottom: 'var(--ds-layout-spacing-sm)' }}>
          {t('accountOnboarding.numbers.overview.temporaryBanner')}
        </div>
      )}
      {state.phoneNumbers.length === 0 && (
        <p
          className="section-description"
          style={{ textAlign: 'center', padding: 'var(--ds-layout-spacing-md) 0' }}
        >
          {t('accountOnboarding.numbers.overview.empty')}
        </p>
      )}
      {state.gateError && (
        <div className="inline-alert error" style={{ marginTop: 'var(--ds-layout-spacing-sm)' }}>
          {state.gateError}
        </div>
      )}
    </>
  );
}
