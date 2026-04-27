import React, { useCallback, useState } from 'react';
import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js';
import type { ConfigPanelProps } from '../registry-types';
import { formatPhoneForDisplay } from '../format-phone';
import { ConfigField } from './fields/ConfigField';
import { TimeoutField } from './fields/TimeoutField';

export function ExternalDialConfigPanel({ config, onConfigChange }: ConfigPanelProps) {
  const e164 = (config.phone_number as string) ?? '';
  const timeout = (config.timeout as number) ?? 60;

  const [display, setDisplay] = useState(formatPhoneForDisplay(e164));

  const handlePhoneInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const cleaned = raw.startsWith('+')
        ? '+' + raw.slice(1).replace(/\D/g, '')
        : raw.replace(/\D/g, '');
      const formatted = cleaned ? new AsYouType('US').input(cleaned) : '';
      setDisplay(formatted);

      // Eagerly commit valid numbers so dirty tracking enables Save;
      // invalid partial input is left as-is until blur normalises it.
      const p = cleaned ? parsePhoneNumberFromString(cleaned, 'US') : null;
      if (p?.isValid()) {
        onConfigChange({ phone_number: p.number });
      } else if (!cleaned) {
        onConfigChange({ phone_number: '' });
      }
    },
    [onConfigChange]
  );

  const handlePhoneBlur = useCallback(() => {
    const p = parsePhoneNumberFromString(display, 'US');
    if (p?.isValid()) {
      const isNanp = p.country === 'US' || p.countryCallingCode === '1';
      setDisplay(isNanp ? p.formatNational() : p.formatInternational());
      onConfigChange({ phone_number: p.number });
    } else {
      onConfigChange({ phone_number: '' });
    }
  }, [display, onConfigChange]);

  const handleClear = useCallback(() => {
    setDisplay('');
    onConfigChange({ phone_number: '' });
  }, [onConfigChange]);

  return (
    <>
      <TimeoutField
        value={timeout}
        min={1}
        max={120}
        onChange={(t) => onConfigChange({ timeout: t })}
      />
      <ConfigField label="Phone Number">
        <div className="ds-dial-plan-config-field__input-wrapper">
          <input
            className="ds-dial-plan-config-field__input"
            type="tel"
            placeholder="+1 415 555 1234"
            value={display}
            onChange={handlePhoneInput}
            onBlur={handlePhoneBlur}
          />
          {display && (
            <button
              type="button"
              className="ds-dial-plan-config-field__clear"
              onClick={handleClear}
              aria-label="Clear phone number"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M10.5 3.5L3.5 10.5M3.5 3.5l7 7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
      </ConfigField>
    </>
  );
}
