/**
 * EmergencyBanner — the built-in "set your emergency location" (E911) prompt
 * shown above the dial pad while the session's emergency address is unbound.
 *
 * Shown only on the idle dialer: the user sets a location before dialing (the
 * server is the authority on outbound PSTN). Hidden when the host manages E911
 * (emergencyAddressId supplied), while binding is loading, once bound, or while
 * a call is active. Submitting an address forces a reconnect, so the dial pad
 * disables placing calls (`canPlaceCall` reads `emergency.submitting`) until it
 * settles — otherwise a call started mid-reconnect would be dropped.
 *
 * Reads the E911 flow (`emergency`) from the softphone context; owns only its own
 * expand/form UI state.
 */

import React, { useState } from 'react';
import { useSoftphone } from '../SoftphoneProvider';
import { softphoneGlyphs } from '../../components/softphone-icons';
import { Glyph } from './Glyph';
import type { EmergencyAddressInput } from '../../webrtc';

const EMPTY_FORM: EmergencyAddressInput = {
  address_number: '',
  street: '',
  unit: '',
  city: '',
  state: '',
  postal_code: '',
};

export function EmergencyBanner(): React.JSX.Element | null {
  const { emergency, emergencyManagedByHost, activeCall, t, scope } = useSoftphone();
  const [expanded, setExpanded] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [form, setForm] = useState<EmergencyAddressInput>(EMPTY_FORM);

  // Only prompt on the idle dialer — never over an active call (the prompt is
  // for setting up outbound PSTN before dialing, not mid-conversation).
  if (emergencyManagedByHost || emergency.loading || emergency.bound || activeCall) return null;

  const setField = (k: keyof EmergencyAddressInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Collapse the form ONLY on success. On failure the hook has set
  // `emergency.error` (shown in the form) and rethrown, so we keep the prompt
  // open rather than closing it as if the address were bound. The `.catch`
  // no-op just prevents an unhandled rejection — the error is already surfaced.
  const confirm = (id: string) => {
    void emergency
      .confirm(id)
      .then(() => setExpanded(false))
      .catch(() => undefined);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void emergency
      .create({ ...form, unit: form.unit || undefined })
      .then(() => {
        setExpanded(false);
        setAddingNew(false);
      })
      .catch(() => undefined);
  };

  return (
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
            emergency.savedAddresses.map((a) => (
              <button
                key={a.id}
                type="button"
                className="ds-e911-choice"
                disabled={emergency.submitting}
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
              {emergency.error && <p className="ds-e911-error">{emergency.error}</p>}
              <div className="ds-e911-actions">
                {emergency.savedAddresses.length > 0 && (
                  <button
                    type="button"
                    className="ds-e911-btn ds-e911-btn-secondary"
                    onClick={() => setAddingNew(false)}
                  >
                    {t('emergencyBack')}
                  </button>
                )}
                <button type="submit" className="ds-e911-btn" disabled={emergency.submitting}>
                  {emergency.submitting ? t('emergencySaving') : t('emergencySave')}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
