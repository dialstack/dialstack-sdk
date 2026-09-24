import React, { useState } from 'react';
import { softphoneGlyphs } from '../../core/icons';
import { normalizeStateCode } from '../../core/emergency-address-form';
import { Glyph } from '../Glyph';
import { DEFAULT_SCOPE, type SoftphoneViewChrome } from './types';
import type { EmergencyAddress, EmergencyAddressInput } from '@dialstack/sdk-webrtc';

const EMPTY_FORM: EmergencyAddressInput = {
  address_number: '',
  street: '',
  unit: '',
  city: '',
  state: '',
  postal_code: '',
};

export interface EmergencyBannerViewProps extends Pick<SoftphoneViewChrome, 't' | 'scope'> {
  savedAddresses: EmergencyAddress[];
  submitting: boolean;
  error: string | null;
  onConfirm: (id: string) => Promise<void>;
  onCreate: (input: EmergencyAddressInput) => Promise<void>;
  defaultExpanded?: boolean;
  defaultAddingNew?: boolean;
}

export const EmergencyBannerView: React.FC<EmergencyBannerViewProps> = ({
  savedAddresses,
  submitting,
  error,
  onConfirm,
  onCreate,
  defaultExpanded = false,
  defaultAddingNew = false,
  scope = DEFAULT_SCOPE,
  t,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [addingNew, setAddingNew] = useState(defaultAddingNew);
  const [form, setForm] = useState<EmergencyAddressInput>(EMPTY_FORM);

  const setField = (k: keyof EmergencyAddressInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const confirm = (id: string) => {
    void onConfirm(id)
      .then(() => setExpanded(false))
      .catch(() => undefined);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void onCreate({ ...form, state: normalizeStateCode(form.state), unit: form.unit || undefined })
      .then(() => {
        setExpanded(false);
        setAddingNew(false);
      })
      .catch(() => undefined);
  };

  return (
    <div className={`${scope} ds-softphone ds-e911-root`}>
      <div className={`ds-e911 ${expanded ? 'ds-e911-open' : ''}`}>
        <button
          type="button"
          className="ds-e911-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <span>
            <Glyph glyph={softphoneGlyphs.location} />
          </span>
          <span className="ds-e911-label">{t('emergencyPrompt')}</span>
          <span className="ds-e911-chevron">
            <Glyph glyph={softphoneGlyphs.chevronDown} />
          </span>
        </button>
        {expanded && (
          <div className="ds-e911-body">
            <p className="ds-e911-hint">{t('emergencyHint')}</p>

            {!addingNew &&
              savedAddresses.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="ds-e911-choice"
                  disabled={submitting}
                  onClick={() => confirm(a.id)}
                >
                  <Glyph glyph={softphoneGlyphs.location} />
                  <span className="ds-e911-choice-addr">
                    {[
                      a.address.address_number,
                      a.address.street,
                      a.address.city,
                      a.address.state,
                      a.address.postal_code,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  </span>
                  <span className="ds-e911-choice-cta">{t('emergencyConfirm')}</span>
                </button>
              ))}

            {!addingNew && (
              <button
                type="button"
                className="ds-e911-btn ds-e911-btn-secondary"
                onClick={() => setAddingNew(true)}
              >
                {t('emergencyNewLocation')}
              </button>
            )}

            {addingNew && (
              <form
                className="ds-e911-body"
                style={{ padding: 0, borderTop: 'none' }}
                onSubmit={submit}
              >
                <div className="ds-e911-row">
                  <div className="ds-e911-field ds-e911-field-sm">
                    <label htmlFor={`${scope}-ea-num`}>{t('emergencyNumber')}</label>
                    <input
                      id={`${scope}-ea-num`}
                      className="ds-e911-input"
                      value={form.address_number}
                      onChange={setField('address_number')}
                    />
                  </div>
                  <div className="ds-e911-field">
                    <label htmlFor={`${scope}-ea-street`}>{t('emergencyStreet')}</label>
                    <input
                      id={`${scope}-ea-street`}
                      className="ds-e911-input"
                      value={form.street}
                      onChange={setField('street')}
                      required
                    />
                  </div>
                </div>
                <div className="ds-e911-field">
                  <label htmlFor={`${scope}-ea-unit`}>{t('emergencyUnit')}</label>
                  <input
                    id={`${scope}-ea-unit`}
                    className="ds-e911-input"
                    value={form.unit}
                    onChange={setField('unit')}
                  />
                </div>
                <div className="ds-e911-field">
                  <label htmlFor={`${scope}-ea-city`}>{t('emergencyCity')}</label>
                  <input
                    id={`${scope}-ea-city`}
                    className="ds-e911-input"
                    value={form.city}
                    onChange={setField('city')}
                    required
                  />
                </div>
                <div className="ds-e911-row">
                  <div className="ds-e911-field">
                    <label htmlFor={`${scope}-ea-state`}>{t('emergencyState')}</label>
                    <input
                      id={`${scope}-ea-state`}
                      className="ds-e911-input"
                      value={form.state}
                      onChange={setField('state')}
                      required
                    />
                  </div>
                  <div className="ds-e911-field ds-e911-field-sm">
                    <label htmlFor={`${scope}-ea-zip`}>{t('emergencyPostalCode')}</label>
                    <input
                      id={`${scope}-ea-zip`}
                      className="ds-e911-input"
                      value={form.postal_code}
                      onChange={setField('postal_code')}
                      required
                    />
                  </div>
                </div>
                {error && <p className="ds-e911-error">{error}</p>}
                <div className="ds-e911-actions">
                  {savedAddresses.length > 0 && (
                    <button
                      type="button"
                      className="ds-e911-btn ds-e911-btn-secondary"
                      onClick={() => setAddingNew(false)}
                    >
                      {t('emergencyBack')}
                    </button>
                  )}
                  <button type="submit" className="ds-e911-btn" disabled={submitting}>
                    {submitting ? t('emergencySaving') : t('emergencySave')}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
