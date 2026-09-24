import React from 'react';
import { errorMessageKey } from '../../hooks';
import type { SoftphoneViewChrome } from './types';

export interface CallErrorChipViewProps extends Pick<SoftphoneViewChrome, 't'> {
  error: { code: string; message: string } | null;
  onDismiss: () => void;
}

export const CallErrorChipView: React.FC<CallErrorChipViewProps> = ({ error, onDismiss, t }) => {
  if (!error) return null;
  return (
    <div className="ds-chip ds-chip-error ds-call-error" role="alert">
      <span>{t(errorMessageKey(error.code))}</span>
      <button
        type="button"
        className="ds-call-error-dismiss"
        aria-label={t('dismiss')}
        onClick={onDismiss}
      >
        ✕
      </button>
    </div>
  );
};
