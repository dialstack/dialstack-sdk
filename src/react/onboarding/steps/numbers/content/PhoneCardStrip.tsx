import React from 'react';
import type { DIDItem, PhoneNumberItem } from '../../../../../types';
import type { NumState, Dispatcher, TFn, CardMode } from '../types';
import { formatPhone, getStatusBadgeClass } from '../helpers';
import { PHONE_SVG, SUCCESS_SVG } from '../../../icons';

const NOWRAP_STYLE: React.CSSProperties = { whiteSpace: 'nowrap' };

// ── Persistent phone card strip ──
// Stays mounted across overview / primary-did / caller-id sub-steps so cards
// morph smoothly instead of flashing.
export function PhoneCardStrip({
  mode,
  state,
  t,
  dispatch,
}: {
  mode: CardMode;
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
}) {
  // Use activeDIDs for primary-did and caller-id modes, phoneNumbers for overview.
  // Directory-listing uses pre-computed dlEligibleDIDs (excludes temporary numbers).
  // Caller-id also excludes temporary numbers.
  const items =
    mode === 'overview'
      ? state.phoneNumbers
      : mode === 'directory-listing'
        ? state.dlEligibleDIDs
        : mode === 'caller-id'
          ? state.activeDIDs.filter((d) => d.number_class !== 'temporary')
          : state.activeDIDs;
  if (items.length === 0) return null;

  // directory-listing uses radio + label pattern like primary-did
  const useRadio = mode === 'primary-did' || mode === 'directory-listing';

  return (
    <div className={`num-phone-list num-phone-list--${mode}`}>
      {items.map((item) => {
        const did = item as DIDItem;
        const phoneItem = item as PhoneNumberItem;
        const formatted = formatPhone(item.phone_number);
        const isSelected =
          (mode === 'primary-did' && state.selectedPrimaryDIDId === did.id) ||
          (mode === 'directory-listing' && state.dlSelectedDIDId === did.id);
        const isAutoMatched =
          mode === 'primary-did' &&
          state.primaryDIDAutoMatched &&
          did.id === state.selectedPrimaryDIDId;

        // Unified card classes
        const cardClasses = [
          'num-phone-card',
          mode === 'overview' &&
            `num-phone-card--${phoneItem.status?.replace('_', '-') ?? 'active'}`,
          (mode === 'primary-did' || mode === 'directory-listing') &&
            'num-phone-card--active num-phone-card--check',
          isSelected && 'num-phone-card--selected',
          mode === 'caller-id' && 'num-phone-card--cid',
          mode === 'directory-listing' && isSelected && 'num-phone-card--cid',
        ]
          .filter(Boolean)
          .join(' ');

        // Use <label> for radio modes (accessibility), <div> otherwise
        const Tag = useRadio ? 'label' : 'div';

        const inputVal = state.callerIdInputs[did.id] ?? '';
        const cidStatus = state.callerIdStatuses[did.id] ?? 'idle';
        const cidError = state.callerIdErrors[did.id];

        return (
          <Tag key={did.id ?? item.phone_number} className={cardClasses}>
            {/* Hidden radio for primary-did mode */}
            {mode === 'primary-did' && (
              <input
                type="radio"
                name="primary-did"
                value={did.id}
                checked={isSelected}
                onChange={() => dispatch({ type: 'set_primary_did', didId: did.id })}
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
              />
            )}

            {/* Hidden radio for directory-listing mode */}
            {mode === 'directory-listing' && (
              <input
                type="radio"
                name="dl-did"
                value={did.id}
                checked={isSelected}
                onChange={() => dispatch({ type: 'dl_select_did', didId: did.id })}
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
              />
            )}

            {/* SAFETY: PHONE_SVG is a static SVG constant, not user input */}
            {/* nosemgrep: javascript.react.dangerouslysetinnerhtml -- trusted server-generated branding content */}
            <span className="num-phone-card-icon" dangerouslySetInnerHTML={{ __html: PHONE_SVG }} />

            <div className="num-phone-card-body">
              <div
                className="num-phone-card-number"
                style={mode === 'directory-listing' ? NOWRAP_STYLE : undefined}
              >
                {formatted}
              </div>

              {/* Overview: meta text */}
              {mode === 'overview' && phoneItem.number_class === 'temporary' && (
                <div className="num-phone-card-meta">
                  {t('accountOnboarding.numbers.source.didTemporary')}
                </div>
              )}
              {mode === 'overview' &&
                phoneItem.source !== 'did' &&
                phoneItem.number_class !== 'temporary' && (
                  <div className="num-phone-card-meta">
                    {t(`accountOnboarding.numbers.source.${phoneItem.source}`)}
                  </div>
                )}

              {/* Primary DID: badges */}
              {mode === 'primary-did' && (isAutoMatched || did.number_class === 'temporary') && (
                <div className="num-phone-card-meta">
                  {isAutoMatched && (
                    <span className="primary-did-badge auto-matched">
                      {t('accountOnboarding.numbers.primaryNumber.autoMatchedBadge')}
                    </span>
                  )}
                  {did.number_class === 'temporary' && (
                    <span className="primary-did-badge">
                      {t('accountOnboarding.numbers.primaryNumber.temporary')}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* End section: changes per mode */}
            <div className="num-phone-card-end">
              {/* Overview: status badge */}
              {mode === 'overview' && (
                <span className={`num-status-badge ${getStatusBadgeClass(phoneItem.status)}`}>
                  {t(`accountOnboarding.numbers.status.${phoneItem.status}`)}
                </span>
              )}
              {/* Primary DID / Directory listing: check dot */}
              {(mode === 'primary-did' || mode === 'directory-listing') && (
                <span className="num-phone-check-dot" />
              )}
            </div>

            {/* Caller ID: expandable input section */}
            {mode === 'caller-id' && (
              <div className="num-phone-card-cid-section">
                <div className="num-cid-input-wrapper">
                  <label className="form-label">
                    {t('accountOnboarding.numbers.callerId.inputLabel')}
                  </label>
                  <div className="num-cid-input-row">
                    <input
                      type="text"
                      className="form-input num-cid-input"
                      value={inputVal}
                      maxLength={15}
                      placeholder={t('accountOnboarding.numbers.callerId.inputPlaceholder')}
                      disabled={cidStatus === 'submitting'}
                      onChange={(e) =>
                        dispatch({
                          type: 'caller_id_set_input',
                          didId: did.id,
                          value: e.target.value,
                        })
                      }
                    />
                    <span className="num-cid-char-count">
                      {t('accountOnboarding.numbers.callerId.charCount', {
                        count: inputVal.length,
                      })}
                    </span>
                  </div>
                  <p className="form-help">{t('accountOnboarding.numbers.callerId.inputHelp')}</p>
                </div>
                <div className="num-cid-card-footer">
                  {cidStatus === 'submitting' && (
                    <span className="num-cid-status-submitting">
                      <span className="spinner" />{' '}
                      {t('accountOnboarding.numbers.callerId.submitting')}
                    </span>
                  )}
                  {cidStatus === 'submitted' && (
                    <span className="num-cid-status-submitted">
                      {/* nosemgrep: javascript.react.dangerouslysetinnerhtml -- trusted server-generated branding content */}
                      <span dangerouslySetInnerHTML={{ __html: SUCCESS_SVG }} />{' '}
                      {t('accountOnboarding.numbers.callerId.submitted')}
                    </span>
                  )}
                  {cidStatus === 'error' && cidError && (
                    <span className="num-cid-status-error">{cidError}</span>
                  )}
                </div>
              </div>
            )}

            {/* Directory listing: business name input (shown only for the selected DID) */}
            {mode === 'directory-listing' && isSelected && (
              <div className="num-phone-card-cid-section">
                <div className="num-cid-input-wrapper">
                  <label className="form-label">
                    {t('accountOnboarding.numbers.directoryListing.businessName')}
                  </label>
                  <input
                    type="text"
                    className="form-input num-cid-input"
                    value={state.dlBusinessName}
                    maxLength={200}
                    placeholder={t(
                      'accountOnboarding.numbers.directoryListing.businessNamePlaceholder'
                    )}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^\x20-\x7E]/g, '');
                      dispatch({ type: 'dl_set_business_name', name: val });
                    }}
                  />
                  <p className="form-help">
                    {t('accountOnboarding.numbers.directoryListing.businessNameHelp')}
                  </p>
                </div>
              </div>
            )}
          </Tag>
        );
      })}

      {/* Directory listing: "None — skip" option */}
      {mode === 'directory-listing' && (
        <label
          className={[
            'num-phone-card num-phone-card--active num-phone-card--check',
            state.dlSelectedDIDId === null && 'num-phone-card--selected',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <input
            type="radio"
            name="dl-did"
            value=""
            checked={state.dlSelectedDIDId === null}
            onChange={() => dispatch({ type: 'dl_select_did', didId: null })}
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
          />
          <span className="num-phone-card-icon" style={{ opacity: 0.4 }}>
            {/* nosemgrep: javascript.react.dangerouslysetinnerhtml -- trusted server-generated branding content */}
            <span dangerouslySetInnerHTML={{ __html: PHONE_SVG }} />
          </span>
          <div className="num-phone-card-body">
            <div className="num-phone-card-number">
              {t('accountOnboarding.numbers.directoryListing.noneOption')}
            </div>
          </div>
          <div className="num-phone-card-end">
            <span className="num-phone-check-dot" />
          </div>
        </label>
      )}
    </div>
  );
}
