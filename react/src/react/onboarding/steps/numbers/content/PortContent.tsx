/**
 * Port-related sub-step content components for the Numbers onboarding step.
 *
 * SAFETY NOTE: dangerouslySetInnerHTML is used only for static SVG constants
 * (SUCCESS_SVG, CHECK_CIRCLE_SVG) imported from icons.ts in our own codebase —
 * never user input.
 */

import React, { useEffect, useRef, useState } from 'react';
import { AsYouType } from 'libphonenumber-js';
import {
  classifyPhoneNumberRows,
  formatOnBlur,
  formatWhileTyping,
  isPhoneNumberListReady,
  parsePhoneNumberRows,
} from '@dialstack/sdk-js/pure';
import type { NumState, Dispatcher, TFn } from '../types';
import { MAX_PHONE_NUMBERS_PER_ORDER, REASON_KEY } from '../port-numbers';
import { formatPhone } from '../helpers';
import { US_STATES } from '../../../../../constants/us-states';
import { SUCCESS_SVG, CHECK_CIRCLE_SVG, CLOSE_SVG, PLUS_CIRCLE_SVG } from '../../../icons';
import { BillingImpactNotice } from '../../../components/BillingImpactNotice';

/** Stable React keys, so editing one row never remounts another. */
let nextRowId = 0;

export const PortNumbersContent = ({
  state,
  t,
  dispatch,
  onCheck,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
  onCheck: () => void;
}) => {
  const backToOverview = () => {
    dispatch({ type: 'port_reset' });
    dispatch({ type: 'set_substep', subStep: 'overview' });
  };

  const values = state.portPhoneValues;
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const pendingFocus = useRef<number | null>(null);

  // One id per row, held in state rather than a ref because it is read during
  // render. Re-synced when values change from outside (a reset, a restored
  // draft); the structural edits below keep the two in step themselves.
  const [rowIds, setRowIds] = useState<number[]>(() => values.map(() => nextRowId++));
  if (rowIds.length !== values.length) {
    setRowIds((ids) => {
      const next = [...ids];
      while (next.length < values.length) next.push(nextRowId++);
      return next.slice(0, values.length);
    });
  }

  // Focus lands after the row exists, so it applies once the render that
  // created it has committed.
  useEffect(() => {
    if (pendingFocus.current === null) return;
    const target = pendingFocus.current;
    pendingFocus.current = null;
    inputsRef.current[target]?.focus();
  });

  const rows = classifyPhoneNumberRows(values, state.portNumberIssues);
  // readyCount and overCap drive the count line and the cap message; whether the
  // step may advance is the shared rule, not a local restatement of it.
  const readyCount = rows.filter((r) => r.status === 'ok').length;
  const overCap = readyCount > MAX_PHONE_NUMBERS_PER_ORDER;
  // Each blocking row is marked in place, but the gate also says how many there
  // are next to the button it disables: on a long list the rows that block are
  // easily off-screen, and a dead button with nothing visible to fix is the one
  // state this step must never present.
  const needsAttention = rows.filter(
    (r) => r.status === 'problem' || r.status === 'server' || r.status === 'duplicate'
  ).length;
  const canContinue =
    isPhoneNumberListReady(values, state.portNumberIssues, MAX_PHONE_NUMBERS_PER_ORDER) &&
    !state.portIsCheckingEligibility;

  const commit = (next: string[], ids?: number[], focusIndex?: number) => {
    // Never leave the step with nothing to type into.
    const rowValues = next.length > 0 ? next : [''];
    if (ids) setRowIds(next.length > 0 ? ids : [nextRowId++]);
    dispatch({ type: 'port_set_phone_values', values: rowValues });
    if (focusIndex !== undefined) pendingFocus.current = focusIndex;
  };

  const setRow = (index: number, value: string) => {
    const next = [...values];
    next[index] = value;
    commit(next);
  };

  const addRowAfter = (index: number) => {
    const next = [...values];
    next.splice(index + 1, 0, '');
    const ids = [...rowIds];
    ids.splice(index + 1, 0, nextRowId++);
    commit(next, ids, index + 1);
  };

  const removeRow = (index: number) => {
    if (values.length <= 1) {
      commit([''], [nextRowId++]);
      return;
    }
    // Focus the row that moves up into this slot, not the one above: a list is
    // worked top to bottom, so after deleting a bad row the caret should already
    // be on the next one to look at. Deleting the last row falls back to the new
    // last row, since there is nothing below it.
    commit(
      values.filter((_, i) => i !== index),
      rowIds.filter((_, i) => i !== index),
      Math.min(index, values.length - 2)
    );
  };

  /**
   * A list arriving at a row — however it was written, and however it got here.
   * Each entry becomes its own row, including the ones we could not read: those
   * keep their text so they can be corrected rather than disappearing.
   */
  const insertList = (index: number, text: string, event: { preventDefault(): void }) => {
    const parsed = parsePhoneNumberRows(text);
    if (parsed.length === 0) return;

    // A single number pasted onto a row that already holds one is another
    // number, not a correction — letting the field insert it would run the two
    // together into one unreadable row. A row still being corrected keeps the
    // native paste, so completing a half-typed number still works.
    const targetComplete = classifyPhoneNumberRows([values[index] ?? ''])[0]?.status === 'ok';
    if (parsed.length <= 1 && !targetComplete) return;

    event.preventDefault();
    const incoming = parsed.map((row) => row.value);
    const replacing = values[index]?.trim() === '';
    const at = replacing ? index : index + 1;
    const next = [...values];
    next.splice(at, replacing ? 1 : 0, ...incoming);
    const ids = [...rowIds];
    ids.splice(at, replacing ? 1 : 0, ...incoming.map(() => nextRowId++));
    commit(next, ids, at + incoming.length - 1);
  };

  return (
    <>
      <h2 className="section-title">{t('accountOnboarding.numbers.port.numbersTitle')}</h2>
      <p className="section-subtitle">{t('accountOnboarding.numbers.port.numbersSubtitle')}</p>

      <div className="num-port-rows">
        {values.map((value, index) => {
          const row = rows[index];
          const message =
            row?.status === 'problem'
              ? t(REASON_KEY[row.reason])
              : row?.status === 'duplicate'
                ? t('accountOnboarding.numbers.port.duplicateOfRow', {
                    row: row.firstSeenIndex + 1,
                  })
                : row?.status === 'server'
                  ? row.message
                  : null;

          return (
            <div key={rowIds[index]} className="num-port-row">
              <div className="num-port-row-fields">
                <span className="num-port-row-index">{index + 1}</span>
                <input
                  className={`form-input${message ? ' error' : ''}`}
                  type="tel"
                  value={value}
                  placeholder={t('accountOnboarding.numbers.port.phonePlaceholder')}
                  aria-label={t('accountOnboarding.numbers.port.numberLabel', { row: index + 1 })}
                  aria-invalid={message ? true : undefined}
                  onChange={(e) => setRow(index, formatWhileTyping(e.target.value, value))}
                  ref={(el) => {
                    inputsRef.current[index] = el;
                  }}
                  onBlur={() => {
                    // Only write when blur actually changes the value. A commit
                    // no longer wipes server-reported issues, so this is no
                    // longer load-bearing — but writing an identical value still
                    // costs a render of every row on the list.
                    const settled = formatOnBlur(value);
                    if (settled !== value) setRow(index, settled);
                  }}
                  onPaste={(e) => insertList(index, e.clipboardData.getData('text'), e)}
                  onDrop={(e) => insertList(index, e.dataTransfer.getData('text'), e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addRowAfter(index);
                    } else if (e.key === 'Backspace' && value === '' && values.length > 1) {
                      e.preventDefault();
                      removeRow(index);
                    }
                  }}
                />
                <button
                  className="num-port-row-remove"
                  type="button"
                  aria-label={t('accountOnboarding.numbers.port.removeNumber', { row: index + 1 })}
                  // Keep the caret where it is until the click has landed.
                  // Pressing here would otherwise blur the field first, and blur
                  // settles the value — a row holding `+15145551258` became
                  // `+1 514 555 1258`, which re-rendered the list out from under
                  // the gesture and swallowed the click. The row survived, now
                  // reformatted, and only a second press removed it.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => removeRow(index)}
                  disabled={values.length === 1 && value === ''}
                >
                  {/* SAFETY: CLOSE_SVG is a static SVG constant */}
                  {/* nosemgrep: javascript.react.dangerouslysetinnerhtml -- static icon constant */}
                  <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: CLOSE_SVG }} />
                </button>
              </div>
              {message && <div className="form-error num-port-row-error">{message}</div>}
            </div>
          );
        })}
      </div>

      {/* A button, not a link: it acts on this form rather than navigating, and
          the admin portal's equivalent control is a button too — the two
          surfaces are the same screen to a customer who sees both. */}
      <button
        type="button"
        className="btn btn-secondary num-port-add"
        onClick={() => addRowAfter(values.length - 1)}
      >
        {/* SAFETY: PLUS_CIRCLE_SVG is a static SVG constant */}
        {/* nosemgrep: javascript.react.dangerouslysetinnerhtml -- static icon constant */}
        <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: PLUS_CIRCLE_SVG }} />
        {t('accountOnboarding.numbers.port.addAnother')}
      </button>

      <p className="num-port-summary-ok">
        {t(
          readyCount === 0
            ? 'accountOnboarding.numbers.port.readyCountZero'
            : readyCount === 1
              ? 'accountOnboarding.numbers.port.readyCountOne'
              : 'accountOnboarding.numbers.port.readyCountOther',
          { count: readyCount }
        )}
      </p>
      <p className="num-port-summary-note">{t('accountOnboarding.numbers.port.pasteHint')}</p>

      {needsAttention > 0 && (
        <div className="inline-alert error">
          {t(
            needsAttention === 1
              ? 'accountOnboarding.numbers.port.needsAttentionOne'
              : 'accountOnboarding.numbers.port.needsAttentionOther',
            { count: needsAttention }
          )}
        </div>
      )}

      {overCap && (
        <div className="inline-alert error">
          {t('accountOnboarding.numbers.port.maxPerOrder', {
            count: readyCount,
            max: MAX_PHONE_NUMBERS_PER_ORDER,
            excess: readyCount - MAX_PHONE_NUMBERS_PER_ORDER,
          })}
        </div>
      )}

      {state.portEligibilityError && (
        <div className="inline-alert error">{state.portEligibilityError}</div>
      )}
      <div className="num-sub-footer">
        <button className="btn btn-secondary" onClick={backToOverview}>
          {t('accountOnboarding.numbers.nav.cancel')}
        </button>
        <button className="btn btn-primary" disabled={!canContinue} onClick={onCheck}>
          {state.portIsCheckingEligibility
            ? t('accountOnboarding.numbers.port.checking')
            : t('accountOnboarding.numbers.port.checkEligibility')}
        </button>
      </div>
    </>
  );
};

export const PortEligibilityContent = ({
  state,
  t,
  dispatch,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
}) => {
  const result = state.portEligibilityResult;
  if (!result) return null;
  const hasPortable = result.portable_numbers.length > 0;
  return (
    <>
      <h2 className="section-title">{t('accountOnboarding.numbers.port.eligibilityTitle')}</h2>
      <p className="section-subtitle">{t('accountOnboarding.numbers.port.eligibilitySubtitle')}</p>
      <table className="num-eligibility-table">
        <thead>
          <tr>
            <th>{t('accountOnboarding.numbers.overview.phoneNumber')}</th>
            <th>{t('accountOnboarding.numbers.overview.status')}</th>
            <th>{t('accountOnboarding.numbers.port.carrier')}</th>
            <th>{t('accountOnboarding.numbers.port.wireless')}</th>
          </tr>
        </thead>
        <tbody>
          {result.portable_numbers.map((n) => (
            <tr key={n.phone_number}>
              <td>{formatPhone(n.phone_number)}</td>
              <td>
                <span className="num-status-badge num-status-active">
                  {t('accountOnboarding.numbers.port.portable')}
                </span>
              </td>
              <td>{n.losing_carrier_name || '—'}</td>
              <td>
                {n.is_wireless
                  ? t('accountOnboarding.numbers.port.wirelessYes')
                  : t('accountOnboarding.numbers.port.wirelessNo')}
              </td>
            </tr>
          ))}
          {result.non_portable_numbers.map((n) => (
            <tr key={n.phone_number}>
              <td>{formatPhone(n.phone_number)}</td>
              <td>
                <span className="num-status-badge num-status-error">
                  {t('accountOnboarding.numbers.port.notPortable')}
                </span>
              </td>
              <td>—</td>
              <td>—</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!hasPortable && (
        <div className="inline-alert error">{t('accountOnboarding.numbers.port.noPortable')}</div>
      )}
      <div className="num-sub-footer">
        <button
          className="btn btn-secondary"
          onClick={() => dispatch({ type: 'set_substep', subStep: 'port-numbers' })}
        >
          {t('accountOnboarding.numbers.nav.back')}
        </button>
        {hasPortable && (
          <button
            className="btn btn-primary"
            onClick={() => {
              // Build carrier groups from portable numbers
              const groups = new Map<string, string[]>();
              for (const n of result.portable_numbers) {
                const carrier = n.losing_carrier_name || 'Unknown';
                const list = groups.get(carrier) ?? [];
                list.push(n.phone_number);
                groups.set(carrier, list);
              }
              dispatch({ type: 'port_set_carrier_groups', groups });

              if (groups.size > 1) {
                // Multiple carriers — show carrier selection
                dispatch({ type: 'set_substep', subStep: 'port-carrier-select' });
              } else {
                // Single carrier — proceed directly to subscriber form
                const firstCarrier = Array.from(groups.keys())[0]!;
                dispatch({ type: 'port_set_current_carrier', carrier: firstCarrier });
                dispatch({ type: 'set_substep', subStep: 'port-subscriber' });
              }
            }}
          >
            {t('accountOnboarding.numbers.port.continueWithPortable')}
          </button>
        )}
      </div>
    </>
  );
};

export const PortCarrierSelectContent = ({
  state,
  t,
  dispatch,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
}) => {
  const carriers = Array.from(state.portCarrierGroups.entries());
  return (
    <>
      <h2 className="section-title">{t('accountOnboarding.numbers.port.carrierGroupsTitle')}</h2>
      <p className="section-subtitle">
        {t('accountOnboarding.numbers.port.carrierGroupsSubtitle')}
      </p>
      <div className="num-carrier-groups">
        {carriers.map(([carrier, numbers]) => {
          const isCompleted = state.portCompletedCarriers.includes(carrier);
          return (
            <div
              key={carrier}
              className={`num-carrier-group${isCompleted ? ' num-carrier-group--completed' : ''}`}
            >
              <div className="num-carrier-group-header">
                <div>
                  <strong>{carrier}</strong>
                  <span className="num-carrier-group-count">
                    {' '}
                    ({numbers.length}{' '}
                    {numbers.length === 1
                      ? t('accountOnboarding.numbers.port.numberSingular')
                      : t('accountOnboarding.numbers.port.numberPlural')}
                    )
                  </span>
                </div>
                {isCompleted ? (
                  <span className="num-status-badge num-status-active">
                    {t('accountOnboarding.numbers.port.carrierSubmitted')}
                  </span>
                ) : (
                  <button
                    className="btn btn-primary"
                    style={{
                      padding: 'var(--ds-spacing-xs) var(--ds-layout-spacing-sm)',
                      fontSize: 'var(--ds-font-size-small)',
                    }}
                    onClick={() => {
                      dispatch({ type: 'port_set_current_carrier', carrier });
                      dispatch({ type: 'set_substep', subStep: 'port-subscriber' });
                    }}
                  >
                    {state.portCompletedCarriers.length > 0
                      ? t('accountOnboarding.numbers.port.carrierContinue')
                      : t('accountOnboarding.numbers.port.carrierStart')}
                  </button>
                )}
              </div>
              <div className="num-carrier-group-numbers">{numbers.map(formatPhone).join(', ')}</div>
            </div>
          );
        })}
      </div>
      <div className="num-sub-footer">
        <button
          className="btn btn-secondary"
          onClick={() => dispatch({ type: 'set_substep', subStep: 'port-eligibility' })}
        >
          {t('accountOnboarding.numbers.nav.back')}
        </button>
      </div>
    </>
  );
};

export const PortSubscriberContent = ({
  state,
  t,
  dispatch,
  onNext,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
  onNext: () => void;
}) => {
  const e = state.portSubscriberErrors;
  const textFields = [
    {
      field: 'businessName',
      label: t('accountOnboarding.numbers.port.businessNameLabel'),
      placeholder: t('accountOnboarding.numbers.port.businessNamePlaceholder'),
      val: state.portSubscriberBusinessName,
    },
    {
      field: 'approverName',
      label: t('accountOnboarding.numbers.port.approverNameLabel'),
      placeholder: t('accountOnboarding.numbers.port.approverNamePlaceholder'),
      val: state.portSubscriberApproverName,
    },
    {
      field: 'accountNumber',
      label: t('accountOnboarding.numbers.port.accountNumberLabel'),
      placeholder: t('accountOnboarding.numbers.port.accountNumberPlaceholder'),
      val: state.portSubscriberAccountNumber,
    },
    {
      field: 'pin',
      label: t('accountOnboarding.numbers.port.pinLabel'),
      placeholder: t('accountOnboarding.numbers.port.pinPlaceholder'),
      val: state.portSubscriberPin,
    },
  ];
  const isMultiCarrier = state.portCarrierGroups.size > 1;
  const carrierNumbers =
    isMultiCarrier && state.portCurrentCarrier
      ? (state.portCarrierGroups.get(state.portCurrentCarrier) ?? [])
      : [];
  return (
    <>
      <h2 className="section-title">{t('accountOnboarding.numbers.port.subscriberTitle')}</h2>
      <p className="section-subtitle">{t('accountOnboarding.numbers.port.subscriberSubtitle')}</p>
      {isMultiCarrier && state.portCurrentCarrier && (
        <div className="inline-alert info" style={{ marginBottom: 'var(--ds-layout-spacing-md)' }}>
          <strong>{state.portCurrentCarrier}</strong> — {carrierNumbers.map(formatPhone).join(', ')}
        </div>
      )}
      <div className="num-port-subscriber-form">
        <div className="form-group">
          <label className="form-label">{t('accountOnboarding.numbers.port.btnLabel')}</label>
          <input
            className={`form-input${e.btn ? ' error' : ''}`}
            type="tel"
            value={state.portSubscriberBtn}
            placeholder={t('accountOnboarding.numbers.port.btnPlaceholder')}
            onChange={(e2) => {
              const fmt = new AsYouType('US');
              dispatch({ type: 'port_set_subscriber_btn', value: fmt.input(e2.target.value) });
            }}
          />
          {e.btn && <div className="form-error">{e.btn}</div>}
        </div>
        {textFields.map(({ field, label, placeholder, val }) => (
          <div key={field} className="form-group">
            <label className="form-label">{label}</label>
            <input
              className={`form-input${e[field] ? ' error' : ''}`}
              type="text"
              value={val}
              placeholder={placeholder}
              onChange={(e2) =>
                dispatch({ type: 'port_set_subscriber_field', field, value: e2.target.value })
              }
            />
            {e[field] && <div className="form-error">{e[field]}</div>}
          </div>
        ))}
        <hr className="section-divider" />
        <h4 className="section-heading" style={{ fontSize: 'var(--ds-font-size-base)' }}>
          {t('accountOnboarding.numbers.port.addressHeading')}
        </h4>
        <div className="num-port-address-grid">
          {[
            {
              field: 'houseNumber',
              label: t('accountOnboarding.numbers.port.houseNumberLabel'),
              placeholder: t('accountOnboarding.numbers.port.houseNumberPlaceholder'),
              val: state.portSubscriberHouseNumber,
            },
            {
              field: 'streetName',
              label: t('accountOnboarding.numbers.port.streetNameLabel'),
              placeholder: t('accountOnboarding.numbers.port.streetNamePlaceholder'),
              val: state.portSubscriberStreetName,
            },
          ].map(({ field, label, placeholder, val }) => (
            <div key={field} className="form-group">
              <label className="form-label">{label}</label>
              <input
                className={`form-input${e[field] ? ' error' : ''}`}
                type="text"
                value={val}
                placeholder={placeholder}
                onChange={(e2) =>
                  dispatch({ type: 'port_set_subscriber_field', field, value: e2.target.value })
                }
              />
              {e[field] && <div className="form-error">{e[field]}</div>}
            </div>
          ))}
        </div>
        <div className="form-group">
          <label className="form-label">{t('accountOnboarding.numbers.port.line2Label')}</label>
          <input
            className="form-input"
            type="text"
            value={state.portSubscriberLine2}
            placeholder={t('accountOnboarding.numbers.port.line2Placeholder')}
            onChange={(e2) =>
              dispatch({
                type: 'port_set_subscriber_field',
                field: 'line2',
                value: e2.target.value,
              })
            }
          />
        </div>
        <div className="num-port-address-row-2">
          <div className="form-group">
            <label className="form-label">{t('accountOnboarding.numbers.port.cityLabel')}</label>
            <input
              className={`form-input${e.city ? ' error' : ''}`}
              type="text"
              value={state.portSubscriberCity}
              placeholder={t('accountOnboarding.numbers.port.cityPlaceholder')}
              onChange={(e2) =>
                dispatch({
                  type: 'port_set_subscriber_field',
                  field: 'city',
                  value: e2.target.value,
                })
              }
            />
            {e.city && <div className="form-error">{e.city}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">{t('accountOnboarding.numbers.port.stateLabel')}</label>
            <select
              className={`form-select${e.state ? ' error' : ''}`}
              value={state.portSubscriberState}
              onChange={(e2) =>
                dispatch({
                  type: 'port_set_subscriber_field',
                  field: 'state',
                  value: e2.target.value,
                })
              }
            >
              <option value="">{t('accountOnboarding.numbers.port.statePlaceholder')}</option>
              {US_STATES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            {e.state && <div className="form-error">{e.state}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">{t('accountOnboarding.numbers.port.zipLabel')}</label>
            <input
              className={`form-input${e.zip ? ' error' : ''}`}
              type="text"
              maxLength={5}
              value={state.portSubscriberZip}
              placeholder={t('accountOnboarding.numbers.port.zipPlaceholder')}
              onChange={(e2) =>
                dispatch({
                  type: 'port_set_subscriber_field',
                  field: 'zip',
                  value: e2.target.value,
                })
              }
            />
            {e.zip && <div className="form-error">{e.zip}</div>}
          </div>
        </div>
      </div>
      <div className="num-sub-footer">
        <button
          className="btn btn-secondary"
          onClick={() =>
            dispatch({
              type: 'set_substep',
              subStep:
                state.portCarrierGroups.size > 1 ? 'port-carrier-select' : 'port-eligibility',
            })
          }
        >
          {t('accountOnboarding.numbers.nav.back')}
        </button>
        <button className="btn btn-primary" onClick={onNext}>
          {t('accountOnboarding.numbers.nav.next')}
        </button>
      </div>
    </>
  );
};

export const PortFocDateContent = ({
  state,
  t,
  dispatch,
  onNext,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
  onNext: () => void;
}) => {
  const e = state.portFocErrors;
  const today = new Date();
  let bizDays = 0;
  const minDate = new Date(today);
  while (bizDays < 5) {
    minDate.setDate(minDate.getDate() + 1);
    const d = minDate.getDay();
    if (d !== 0 && d !== 6) bizDays++;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  const minStr = `${minDate.getFullYear()}-${pad(minDate.getMonth() + 1)}-${pad(minDate.getDate())}`;
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 30);
  const maxStr = `${maxDate.getFullYear()}-${pad(maxDate.getMonth() + 1)}-${pad(maxDate.getDate())}`;
  const timeOptions: Array<{ value: string; label: string }> = [];
  for (let h = 8; h <= 20; h++) {
    for (const m of ['00', '30']) {
      if (h === 20 && m === '30') continue;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      timeOptions.push({ value: `${pad(h)}:${m}`, label: `${h12}:${m} ${ampm} ET` });
    }
  }
  return (
    <>
      <h2 className="section-title">{t('accountOnboarding.numbers.port.focTitle')}</h2>
      <p className="section-subtitle">{t('accountOnboarding.numbers.port.focSubtitle')}</p>
      <div className="form-group">
        <label className="form-label">{t('accountOnboarding.numbers.port.focDateLabel')}</label>
        <input
          className={`form-input${e.date ? ' error' : ''}`}
          type="date"
          value={state.portFocDate}
          min={minStr}
          max={maxStr}
          onChange={(e2) => dispatch({ type: 'port_set_foc_date', date: e2.target.value })}
        />
        {e.date && <div className="form-error">{e.date}</div>}
      </div>
      <div className="form-group">
        <label className="form-label">{t('accountOnboarding.numbers.port.focTimeLabel')}</label>
        <select
          className={`form-select${e.time ? ' error' : ''}`}
          value={state.portFocTime}
          onChange={(e2) => dispatch({ type: 'port_set_foc_time', time: e2.target.value })}
        >
          <option value="">{t('accountOnboarding.numbers.port.focTimePlaceholder')}</option>
          {timeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {e.time && <div className="form-error">{e.time}</div>}
      </div>
      <div className="num-sub-footer">
        <button
          className="btn btn-secondary"
          onClick={() => dispatch({ type: 'set_substep', subStep: 'port-subscriber' })}
        >
          {t('accountOnboarding.numbers.nav.back')}
        </button>
        <button className="btn btn-primary" onClick={onNext}>
          {t('accountOnboarding.numbers.nav.next')}
        </button>
      </div>
    </>
  );
};

export const PortDocumentsContent = ({
  state,
  t,
  dispatch,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
}) => {
  const billRef = useRef<HTMLInputElement>(null);
  const csrRef = useRef<HTMLInputElement>(null);
  const handleNext = () => {
    if (!state.portBillFile) {
      dispatch({
        type: 'port_set_doc_upload_error',
        error: t('accountOnboarding.numbers.validation.billCopyRequired'),
      });
      return;
    }
    dispatch({ type: 'port_set_doc_upload_error', error: null });
    dispatch({ type: 'set_substep', subStep: 'port-review' });
  };
  return (
    <>
      <h2 className="section-title">{t('accountOnboarding.numbers.port.documentsTitle')}</h2>
      <p className="section-subtitle">{t('accountOnboarding.numbers.port.documentsSubtitle')}</p>
      {[
        {
          label: t('accountOnboarding.numbers.port.billCopyLabel'),
          badge: t('accountOnboarding.numbers.port.billCopyRequired'),
          badgeClass: 'required',
          desc: t('accountOnboarding.numbers.port.billCopyDesc'),
          file: state.portBillFile,
          ref: billRef,
          action: 'bill' as const,
        },
        {
          label: t('accountOnboarding.numbers.port.csrLabel'),
          badge: t('accountOnboarding.numbers.port.csrOptional'),
          badgeClass: 'optional',
          desc: t('accountOnboarding.numbers.port.csrDesc'),
          file: state.portCsrFile,
          ref: csrRef,
          action: 'csr' as const,
        },
      ].map(({ label, badge, badgeClass, desc, file, ref, action }) => (
        <div key={action} className="num-doc-upload">
          <div className="num-doc-upload-header">
            <span className="num-doc-upload-label">{label}</span>
            <span className={`num-doc-upload-badge ${badgeClass}`}>{badge}</span>
          </div>
          <p className="num-doc-upload-desc">{desc}</p>
          <div className="num-doc-upload-file">
            <button
              className="btn btn-secondary"
              style={{
                padding: 'var(--ds-spacing-xs) var(--ds-layout-spacing-sm)',
                fontSize: 'var(--ds-font-size-small)',
              }}
              onClick={() => ref.current?.click()}
            >
              {t('accountOnboarding.numbers.port.uploadFile')}
            </button>
            <span className="file-name">
              {file
                ? `${t('accountOnboarding.numbers.port.fileSelected')} ${file.name}`
                : t('accountOnboarding.numbers.port.noFileSelected')}
            </span>
          </div>
          <input
            ref={ref}
            type="file"
            style={{ display: 'none' }}
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={(e) =>
              dispatch(
                action === 'bill'
                  ? { type: 'port_set_bill_file', file: e.target.files?.[0] ?? null }
                  : { type: 'port_set_csr_file', file: e.target.files?.[0] ?? null }
              )
            }
          />
        </div>
      ))}
      {state.portDocUploadError && (
        <div className="inline-alert error">{state.portDocUploadError}</div>
      )}
      <div className="num-sub-footer">
        <button
          className="btn btn-secondary"
          onClick={() => dispatch({ type: 'set_substep', subStep: 'port-foc-date' })}
        >
          {t('accountOnboarding.numbers.nav.back')}
        </button>
        <button className="btn btn-primary" onClick={handleNext}>
          {t('accountOnboarding.numbers.nav.next')}
        </button>
      </div>
    </>
  );
};

export const PortReviewContent = ({
  state,
  t,
  dispatch,
  onSubmit,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
  onSubmit: () => void;
}) => {
  const result = state.portEligibilityResult;
  if (!result) return null;
  const isMultiCarrier = state.portCarrierGroups.size > 1;
  const scopedNumbers =
    isMultiCarrier && state.portCurrentCarrier
      ? (state.portCarrierGroups.get(state.portCurrentCarrier) ?? [])
      : result.portable_numbers.map((n) => n.phone_number);
  const numbersList = scopedNumbers.map(formatPhone).join(', ');
  const handleSubmit = () => {
    if (!state.portSignature.trim()) {
      dispatch({
        type: 'port_submit_error',
        error: t('accountOnboarding.numbers.validation.signatureRequired'),
      });
      return;
    }
    onSubmit();
  };
  return (
    <>
      <h2 className="section-title">{t('accountOnboarding.numbers.port.reviewTitle')}</h2>
      <p className="section-subtitle">{t('accountOnboarding.numbers.port.reviewSubtitle')}</p>
      {isMultiCarrier && state.portCurrentCarrier && (
        <div className="inline-alert info" style={{ marginBottom: 'var(--ds-layout-spacing-md)' }}>
          <strong>{state.portCurrentCarrier}</strong>
        </div>
      )}
      {[
        {
          heading: t('accountOnboarding.numbers.port.numbersSection'),
          rows: [
            { label: t('accountOnboarding.numbers.overview.phoneNumber'), value: numbersList },
          ],
        },
        {
          heading: t('accountOnboarding.numbers.port.subscriberSection'),
          rows: [
            { label: t('accountOnboarding.numbers.port.btnLabel'), value: state.portSubscriberBtn },
            {
              label: t('accountOnboarding.numbers.port.businessNameLabel'),
              value: state.portSubscriberBusinessName,
            },
            {
              label: t('accountOnboarding.numbers.port.approverNameLabel'),
              value: state.portSubscriberApproverName,
            },
          ],
        },
        {
          heading: t('accountOnboarding.numbers.port.focSection'),
          rows: [
            { label: t('accountOnboarding.numbers.port.focDateLabel'), value: state.portFocDate },
            ...(state.portFocTime
              ? [
                  {
                    label: t('accountOnboarding.numbers.port.focTimeLabel'),
                    value: state.portFocTime,
                  },
                ]
              : []),
          ],
        },
        {
          heading: t('accountOnboarding.numbers.port.documentsSection'),
          rows: [
            {
              label: t('accountOnboarding.numbers.port.billCopyLabel'),
              value: state.portBillFile?.name ?? '—',
            },
            {
              label: t('accountOnboarding.numbers.port.csrLabel'),
              value: state.portCsrFile?.name ?? '—',
            },
          ],
        },
      ].map(({ heading, rows }) => (
        <div key={heading} className="num-review-section">
          <h4>{heading}</h4>
          {rows.map(({ label, value }) => (
            <div key={label} className="num-review-row">
              <span className="num-review-label">{label}</span>
              <span className="num-review-value">{value}</span>
            </div>
          ))}
        </div>
      ))}
      <BillingImpactNotice resource="phoneNumber" count={scopedNumbers.length} />
      <hr className="section-divider" />
      <div className="form-group">
        <label className="form-label">{t('accountOnboarding.numbers.port.signatureLabel')}</label>
        <input
          className="form-input"
          type="text"
          value={state.portSignature}
          placeholder={t('accountOnboarding.numbers.port.signaturePlaceholder')}
          onChange={(e) => dispatch({ type: 'port_set_signature', signature: e.target.value })}
        />
        <div className="form-help">{t('accountOnboarding.numbers.port.signatureHelp')}</div>
      </div>
      {state.portSubmitError && <div className="inline-alert error">{state.portSubmitError}</div>}
      <div className="num-sub-footer">
        <button
          className="btn btn-secondary"
          onClick={() => dispatch({ type: 'set_substep', subStep: 'port-documents' })}
        >
          {t('accountOnboarding.numbers.nav.back')}
        </button>
        <button
          className="btn btn-primary"
          disabled={state.portIsSubmitting}
          onClick={handleSubmit}
        >
          {state.portIsSubmitting
            ? t('accountOnboarding.numbers.port.submitting')
            : t('accountOnboarding.numbers.port.approve')}
        </button>
      </div>
    </>
  );
};

export const PortSubmittedContent = ({
  state,
  t,
  dispatch,
  loadNumbers,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
  loadNumbers: () => Promise<void>;
}) => {
  return (
    <div className="placeholder" style={{ minHeight: 200 }}>
      {/* SAFETY: SUCCESS_SVG is a static SVG constant */}
      {/* nosemgrep: javascript.react.dangerouslysetinnerhtml -- static SVG constant from our own source */}
      <div
        className="num-order-status-icon success"
        dangerouslySetInnerHTML={{ __html: SUCCESS_SVG }}
      />
      <h2 className="section-title">{t('accountOnboarding.numbers.port.submittedTitle')}</h2>
      <p className="placeholder-text">{t('accountOnboarding.numbers.port.submittedSubtitle')}</p>
      {state.portOrderResults.length > 1 && (
        <div
          style={{
            marginTop: 'var(--ds-layout-spacing-sm)',
            textAlign: 'left',
            width: '100%',
            maxWidth: 400,
          }}
        >
          {state.portOrderResults.map((r) => (
            <div key={r.orderId} className="num-carrier-group num-carrier-group--completed">
              {/* SAFETY: CHECK_CIRCLE_SVG is a static SVG constant */}
              {/* nosemgrep: javascript.react.dangerouslysetinnerhtml -- static SVG constant from our own source */}
              <span
                className="num-carrier-group-check"
                dangerouslySetInnerHTML={{ __html: CHECK_CIRCLE_SVG }}
              />
              <span>{r.carrier}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 'var(--ds-layout-spacing-md)' }}>
        <button
          className="btn btn-primary"
          onClick={() => {
            dispatch({ type: 'port_reset' });
            dispatch({ type: 'set_substep', subStep: 'overview' });
            void loadNumbers();
          }}
        >
          {t('accountOnboarding.numbers.port.backToOverview')}
        </button>
      </div>
    </div>
  );
};
