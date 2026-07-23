import React from 'react';
import { ConfigField } from './ConfigField';

interface SegmentedFieldOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedFieldProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<SegmentedFieldOption<T>>;
  onChange: (next: T) => void;
  /** Optional help text rendered below the segmented control. */
  hint?: string;
}

/**
 * Two-or-more segmented toggle. Renders inside the standard ConfigField shell.
 * For binary/small enums where a `<select>` feels heavier than the choice.
 */
// eslint-disable-next-line react/function-component-definition -- generic component; a `React.FC` arrow can't carry the <T> type parameter, so this must stay a function declaration
export function SegmentedField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: SegmentedFieldProps<T>) {
  return (
    <ConfigField label={label}>
      <div className="ds-dial-plan-config-field__segmented" role="radiogroup" aria-label={label}>
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={
                'ds-dial-plan-config-field__segmented-option' +
                (selected ? ' ds-dial-plan-config-field__segmented-option--active' : '')
              }
              onClick={() => {
                if (!selected) onChange(opt.value);
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {hint && <p className="ds-dial-plan-config-field__hint">{hint}</p>}
    </ConfigField>
  );
}
