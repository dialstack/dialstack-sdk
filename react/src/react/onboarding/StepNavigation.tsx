/**
 * Footer bar for navigating between wizard steps.
 * Renders a Back button (left, only when onBack is provided) and a Next/Submit button (right).
 */

import React from 'react';

export interface StepNavigationProps {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  backLabel?: string;
  isNextDisabled?: boolean;
  isLoading?: boolean;
  className?: string;
}

const StepNavigationBase: React.FC<StepNavigationProps> = ({
  onBack,
  onNext,
  nextLabel = 'Next',
  backLabel = 'Back',
  isNextDisabled = false,
  isLoading = false,
  className,
}) => {
  return (
    <div
      className={`footer-bar${onBack ? '' : ' footer-bar-end'}${className ? ` ${className}` : ''}`}
    >
      {onBack && (
        <button type="button" className="btn-ghost" onClick={onBack}>
          {backLabel}
        </button>
      )}
      <button
        type="button"
        className="btn btn-primary"
        onClick={onNext}
        disabled={isNextDisabled || isLoading || !onNext}
      >
        {isLoading ? <span className="spinner-text">Loading…</span> : (nextLabel ?? 'Next')}
      </button>
    </div>
  );
};
export const StepNavigation = React.memo(StepNavigationBase);
