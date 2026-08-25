import React, { useCallback, useEffect, useId, useState } from 'react';
import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js';
import type { ConfigPanelProps } from '../registry-types';
import { formatPhoneForDisplay } from '../format-phone';
import { ConfigField } from './fields/ConfigField';
import { TimeoutField } from './fields/TimeoutField';

const DEFAULT_INVALID_MESSAGE = 'Enter a valid phone number, for example (415) 555-1234.';

/**
 * Whether an entry is one the platform will actually dial.
 *
 * The bar is `isValid()`, matching the validity check the outbound dial policy
 * applies before handing anything to the carrier. Accepting something looser
 * here would let an admin configure a destination the server refuses at dial
 * time, which is a worse failure than being told now.
 *
 * This is not full parity, and should not be read as it. The policy additionally
 * restricts region (US/CA and US territories) and number type (fixed line,
 * mobile, VoIP, toll-free — premium-rate and friends are denied), so a valid
 * London number or a 1-900 line passes this field and is still refused at dial
 * time. Closing that gap is its own change.
 *
 * For NANP this is a registry of assigned NPA-NXX ranges, not a structural
 * rule — "983 400 xxxx" is valid while "983 633 xxxx" is not, same area code —
 * so it can lag a newly-opened exchange. That is a real cost, but one the dial
 * policy already imposes: a number rejected here would not have completed a
 * call anyway.
 */
const dialable = (cleaned: string): string | null => {
  const parsed = cleaned ? parsePhoneNumberFromString(cleaned, 'US') : null;
  return parsed?.isValid() ? parsed.number : null;
};

/**
 * Strip formatting down to the digits the user actually typed, keeping a
 * leading "+" so international entries survive.
 */
const cleanInput = (raw: string): string =>
  raw.startsWith('+') ? '+' + raw.slice(1).replace(/\D/g, '') : raw.replace(/\D/g, '');

export const ExternalDialConfigPanel = ({
  nodeId,
  config,
  onConfigChange,
  onInvalidDraftChange,
  locale,
}: ConfigPanelProps) => {
  const e164 = (config.phone_number as string) ?? '';
  const timeout = (config.timeout as number) ?? 60;

  const [display, setDisplay] = useState(formatPhoneForDisplay(e164));
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const inputId = `${fieldId}-phone`;
  const errorId = `${fieldId}-error`;

  // The editor reuses this component across node selections, so the draft and
  // its message have to follow the node rather than the instance — otherwise a
  // rejection stays on screen under the next node's perfectly good number.
  //
  // Watching the value alone is not enough: two nodes routinely hold the same
  // one. A pair of freshly-added nodes are both `''`, and two nodes may point
  // at the same destination on purpose — in either case the value never
  // changes across the switch and the draft would survive it. The node id is
  // what distinguishes "different node" from "same node, new value"; the
  // latter is our own commit, where the entry just became valid and clearing
  // the message is right anyway.
  const [syncedFrom, setSyncedFrom] = useState({ nodeId, e164 });
  if (syncedFrom.nodeId !== nodeId || syncedFrom.e164 !== e164) {
    setSyncedFrom({ nodeId, e164 });
    setDisplay(formatPhoneForDisplay(e164));
    setError(null);
  }

  // Keep Save shut while a rejection is on screen. Without this the add path
  // still ends in the reported bug: a node dragged in, a rejected number typed,
  // and Save writes the empty default the node was created with and reports
  // success — the destination is dead and nothing said so.
  useEffect(() => {
    onInvalidDraftChange?.(error !== null);
    return () => onInvalidDraftChange?.(false);
  }, [error, onInvalidDraftChange]);

  const invalidMessage = locale?.configLabels.phoneNumberInvalid ?? DEFAULT_INVALID_MESSAGE;

  /**
   * A rejected entry never touches what is stored.
   *
   * The tempting alternative — mirror the draft into the graph on every
   * keystroke so the two can never disagree — clears the destination the moment
   * the entry stops being valid, and one backspace is enough. That clear is
   * invisible on the paths that matter: dismissing the drawer with Escape fires
   * no blur, so the message never renders, and the plan carries the wipe into
   * whatever the admin saves next. An external_dial node with no number skips
   * to Next or hangs up (ari dialplan handler), so a live routing destination
   * changes behaviour with nothing on screen having said so.
   *
   * Leaving the stored value alone costs a window where the field shows a draft
   * the graph has not accepted. On a node that already had a number that is
   * harmless — Save would keep it. On a node just added there is nothing to
   * keep, and Save would write the empty default and report success, so the
   * message alone is not enough there: `onInvalidDraftChange` holds Save shut
   * for as long as the rejection is on screen.
   */
  const handlePhoneInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const cleaned = cleanInput(e.target.value);
      setDisplay(cleaned ? new AsYouType('US').input(cleaned) : '');
      // Mid-edit, every partial entry is "invalid". Only complain once they
      // have stopped typing; blur re-runs the check and will set it.
      setError(null);

      const number = dialable(cleaned);
      if (number) {
        // Commit as they type so the editor goes dirty and Save comes alive
        // without waiting for a blur. Save is `disabled={!isDirty}`, and a
        // click on a disabled button is swallowed rather than queued.
        onConfigChange({ phone_number: number });
      } else if (!cleaned) {
        // An emptied field is an explicit clear, and what is stored matches
        // what is on screen. Nothing hidden happens here.
        onConfigChange({ phone_number: '' });
      }
    },
    [onConfigChange]
  );

  const handlePhoneBlur = useCallback(() => {
    const cleaned = cleanInput(display);

    if (!cleaned) {
      setError(null);
      onConfigChange({ phone_number: '' });
      return;
    }

    const parsed = parsePhoneNumberFromString(cleaned, 'US');
    if (parsed?.isValid()) {
      const isNanp = parsed.country === 'US' || parsed.countryCallingCode === '1';
      setDisplay(isNanp ? parsed.formatNational() : parsed.formatInternational());
      setError(null);
      onConfigChange({ phone_number: parsed.number });
      return;
    }

    setError(invalidMessage);
  }, [display, invalidMessage, onConfigChange]);

  const handleClear = useCallback(() => {
    setDisplay('');
    setError(null);
    onConfigChange({ phone_number: '' });
  }, [onConfigChange]);

  return (
    <>
      <TimeoutField
        value={timeout}
        min={1}
        max={120}
        onChange={(t) => onConfigChange({ timeout: t })}
        locale={locale}
      />
      <ConfigField label={locale?.configLabels.phoneNumber ?? 'Phone Number'} htmlFor={inputId}>
        <div className="ds-dial-plan-config-field__input-wrapper">
          <input
            id={inputId}
            className="ds-dial-plan-config-field__input"
            type="tel"
            placeholder="+1 415 555 1234"
            value={display}
            onChange={handlePhoneInput}
            onBlur={handlePhoneBlur}
            aria-invalid={error ? true : undefined}
            // role="alert" announces the message once, when it appears. Linking
            // it keeps the guidance reachable afterwards, so returning to a
            // field marked invalid says what is wrong rather than just that it
            // is wrong.
            aria-describedby={error ? errorId : undefined}
          />
          {display && (
            <button
              type="button"
              className="ds-dial-plan-config-field__clear"
              onClick={handleClear}
              aria-label={locale?.configLabels.clearPhoneNumber ?? 'Clear phone number'}
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
        {error && (
          <p className="ds-dial-plan-config-field__error" id={errorId} role="alert">
            {error}
          </p>
        )}
      </ConfigField>
    </>
  );
};
