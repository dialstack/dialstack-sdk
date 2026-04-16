import React from 'react';
import type { NumState, TFn } from '../types';

export function DirectoryListingContent({ state, t }: { state: NumState; t: TFn }) {
  if (state.dlEligibleDIDs.length === 0)
    return (
      <div className="inline-alert info">
        {t('accountOnboarding.numbers.directoryListing.noDIDs')}
      </div>
    );
  return (
    <div className="num-cid-section">
      <h3 className="section-heading">{t('accountOnboarding.numbers.directoryListing.title')}</h3>
      <p className="section-description">
        {t('accountOnboarding.numbers.directoryListing.subtitle')}
      </p>
      <p className="section-description" style={{ marginTop: '4px' }}>
        {t('accountOnboarding.numbers.directoryListing.selectPrompt')}
      </p>

      {state.dlError && (
        <div className="inline-alert error" style={{ marginTop: '12px' }}>
          {state.dlError}
        </div>
      )}
    </div>
  );
}
