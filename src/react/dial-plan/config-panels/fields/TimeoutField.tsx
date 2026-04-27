import React from 'react';
import type { DialPlanLocale } from '../../../../types/dial-plan';
import { ConfigField } from './ConfigField';

interface TimeoutFieldProps {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  locale?: DialPlanLocale;
}

/**
 * Numeric timeout input with built-in clamping. Empty/non-numeric input
 * resolves to `min`. Values outside [min, max] are clamped on every change.
 */
export function TimeoutField({ value, min, max, onChange, locale }: TimeoutFieldProps) {
  return (
    <ConfigField label={locale?.configLabels.timeout ?? 'Timeout (seconds)'}>
      <input
        className="ds-dial-plan-config-field__input"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
      />
    </ConfigField>
  );
}
