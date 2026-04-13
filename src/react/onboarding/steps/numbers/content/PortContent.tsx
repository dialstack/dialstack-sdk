/**
 * Port-related sub-step content components for the Numbers onboarding step.
 *
 * SAFETY NOTE: dangerouslySetInnerHTML is used only for static SVG constants
 * (SUCCESS_SVG, CHECK_CIRCLE_SVG) imported from icons.ts in our own codebase —
 * never user input.
 */

import React, { useRef } from 'react';
import { AsYouType } from 'libphonenumber-js';
import type { NumState, Dispatcher, TFn } from '../types';
import { formatPhone } from '../helpers';
import { US_STATES } from '../../../../../constants/us-states';
import { SUCCESS_SVG, CHECK_CIRCLE_SVG } from '../../../icons';

export function PortNumbersContent({
  state,
  t,
  dispatch,
  onCheck,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
  onCheck: () => void;
}) {
  const backToOverview = () => {
    dispatch({ type: 'port_reset' });
    dispatch({ type: 'set_substep', subStep: 'overview' });
  };
  return (
    <>
      <h2 className="section-title">{t('accountOnboarding.numbers.port.numbersTitle')}</h2>
      <p className="section-subtitle">{t('accountOnboarding.numbers.port.numbersSubtitle')}</p>
      {state.portPhoneInputs.map((val, i) => {
        const err = state.portPhoneErrors[i];
        return (
          <div key={i}>
            <div className="num-phone-input-row">
              <input
                className={`form-input${err ? ' error' : ''}`}
                type="tel"
                value={val}
                placeholder={t('accountOnboarding.numbers.port.phonePlaceholder')}
                onChange={(e) => {
                  const fmt = new AsYouType('US');
                  dispatch({
                    type: 'port_set_phone_input',
                    index: i,
                    value: fmt.input(e.target.value),
                  });
                }}
              />
              {state.portPhoneInputs.length > 1 && (
                <button
                  className="btn-danger-ghost"
                  onClick={() => dispatch({ type: 'port_remove_phone', index: i })}
                >
                  {t('accountOnboarding.numbers.port.removeNumber')}
                </button>
              )}
            </div>
            {err && (
              <div className="form-error" style={{ marginBottom: 'var(--ds-spacing-sm)' }}>
                {err}
              </div>
            )}
          </div>
        );
      })}
      <button
        className="btn-link"
        style={{ marginBottom: 'var(--ds-layout-spacing-md)' }}
        onClick={() => dispatch({ type: 'port_add_phone' })}
      >
        {t('accountOnboarding.numbers.port.addAnother')}
      </button>
      {state.portEligibilityError && (
        <div className="inline-alert error">{state.portEligibilityError}</div>
      )}
      <div className="num-sub-footer">
        <button className="btn btn-secondary" onClick={backToOverview}>
          {t('accountOnboarding.numbers.nav.cancel')}
        </button>
        <button
          className="btn btn-primary"
          disabled={state.portIsCheckingEligibility}
          onClick={onCheck}
        >
          {state.portIsCheckingEligibility
            ? t('accountOnboarding.numbers.port.checking')
            : t('accountOnboarding.numbers.port.checkEligibility')}
        </button>
      </div>
    </>
  );
}

export function PortEligibilityContent({
  state,
  t,
  dispatch,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
}) {
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
}

export function PortCarrierSelectContent({
  state,
  t,
  dispatch,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
}) {
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
}

export function PortSubscriberContent({
  state,
  t,
  dispatch,
  onNext,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
  onNext: () => void;
}) {
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
}

export function PortFocDateContent({
  state,
  t,
  dispatch,
  onNext,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
  onNext: () => void;
}) {
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
}

export function PortDocumentsContent({
  state,
  t,
  dispatch,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
}) {
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
}

export function PortReviewContent({
  state,
  t,
  dispatch,
  onSubmit,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
  onSubmit: () => void;
}) {
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
}

export function PortSubmittedContent({
  state,
  t,
  dispatch,
  loadNumbers,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
  loadNumbers: () => Promise<void>;
}) {
  return (
    <div className="placeholder" style={{ minHeight: 200 }}>
      {/* SAFETY: SUCCESS_SVG is a static SVG constant */}
      {/* nosemgrep: javascript.react.dangerouslysetinnerhtml -- trusted server-generated branding content */}
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
              {/* nosemgrep: javascript.react.dangerouslysetinnerhtml -- trusted server-generated branding content */}
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
}
