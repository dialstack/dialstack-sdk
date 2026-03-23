import React from 'react';
import type { NumState, TFn } from '../types';
import { SkeletonLine, SkeletonCircle } from '../../../components/Skeleton';

export function PrimaryDIDContent({ state, t }: { state: NumState; t: TFn }) {
  if (state.didLoadError) {
    return <div className="inline-alert error">{state.didLoadError}</div>;
  }
  if (state.isLoadingDIDs) {
    return (
      <div role="status" aria-live="polite">
        <SkeletonLine width="180px" height="20px" style={{ marginBottom: 8 }} />
        <SkeletonLine width="260px" height="14px" style={{ marginBottom: 16 }} />
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
  }
  return (
    <div className="primary-did-section">
      <h3 className="section-heading">{t('accountOnboarding.numbers.primaryNumber.heading')}</h3>
      <p className="section-description">
        {t('accountOnboarding.numbers.primaryNumber.description')}
      </p>
      {state.activeDIDs.length === 0 && (
        <div className="inline-alert info">
          {t('accountOnboarding.numbers.primaryNumber.noDIDs')}
        </div>
      )}
      {state.activeDIDs.some((d) => d.number_class === 'temporary') && (
        <div className="inline-alert info" style={{ marginTop: 'var(--ds-layout-spacing-sm)' }}>
          {t('accountOnboarding.numbers.primaryNumber.temporaryNote')}
        </div>
      )}
      {state.primaryDIDError && (
        <div className="inline-alert error" style={{ marginTop: 'var(--ds-layout-spacing-sm)' }}>
          {state.primaryDIDError}
        </div>
      )}
    </div>
  );
}
