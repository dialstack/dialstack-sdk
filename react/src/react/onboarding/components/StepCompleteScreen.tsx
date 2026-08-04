import React from 'react';
import { useOnboarding } from '../OnboardingContext';

export interface StepCompleteScreenProps {
  stepName: string;
  onDone: () => void;
}

export const StepCompleteScreen: React.FC<StepCompleteScreenProps> = ({ stepName, onDone }) => {
  const { locale } = useOnboarding();
  const completeTitle = locale.accountOnboarding.stepComplete.title.replace('{stepName}', stepName);

  return (
    <div className="card">
      <div className="placeholder" style={{ minHeight: 200 }}>
        <div className="complete-icon-circle complete-entrance">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 60, height: 60 }}
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="section-title">{completeTitle}</h2>
        <button
          className="btn btn-primary"
          style={{ marginTop: 'var(--ds-layout-spacing-lg)' }}
          onClick={onDone}
        >
          {locale.accountOnboarding.stepComplete.done}
        </button>
      </div>
    </div>
  );
};
