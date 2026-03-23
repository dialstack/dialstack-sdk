import React from 'react';
import type { NumState, TFn } from '../types';

export function CallerIdContent({ state, t }: { state: NumState; t: TFn }) {
  if (state.activeDIDs.length === 0)
    return (
      <div className="inline-alert info">{t('accountOnboarding.numbers.callerId.noDIDs')}</div>
    );
  return (
    <div className="num-cid-section">
      <h3 className="section-heading">{t('accountOnboarding.numbers.callerId.title')}</h3>
      <p className="section-description">{t('accountOnboarding.numbers.callerId.subtitle')}</p>
    </div>
  );
}
