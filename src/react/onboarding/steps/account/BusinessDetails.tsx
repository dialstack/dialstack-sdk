/**
 * BusinessDetails sub-step of the Account onboarding step.
 * Collects: company name, email, phone, primary contact, timezone, location (address).
 */

import React, { useState, useCallback, useEffect } from 'react';
import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js';
import type { OnboardingLocation, ResolvedAddress } from '../../../../types';
import { US_TIMEZONES } from '../../../../constants/us-timezones';
import { useOnboarding } from '../../OnboardingContext';
import { StepNavigation } from '../../StepNavigation';
import { ErrorAlert } from '../../components/ErrorAlert';
import { InfoIcon } from '../../components/icons';
import { AddressSearch } from './AddressSearch';
import type { ManualAddress, AddressMode } from './AddressSearch';

export interface BusinessDetailsProps {
  onAdvance: (accountEmail: string) => void;
  onBack?: () => void;
}

interface ValidationErrors {
  name?: string;
  email?: string;
  phone?: string;
  primaryContact?: string;
  locationName?: string;
  address?: string;
  timezone?: string;
}

const initialManualAddress: ManualAddress = {
  addressNumber: '',
  street: '',
  city: '',
  state: '',
  postalCode: '',
};

export const BusinessDetails: React.FC<BusinessDetailsProps> = ({ onAdvance, onBack }) => {
  const { dialstack, progressStore, accountConfig, account, locations, reloadSharedData, locale } =
    useOnboarding();
  const t = locale.accountOnboarding.account;

  const [accountName, setAccountName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPhone, setAccountPhone] = useState('');
  const [primaryContact, setPrimaryContact] = useState('');
  const [timezone, setTimezone] = useState('');
  const [locationName, setLocationName] = useState('');
  const [addressMode, setAddressMode] = useState<AddressMode>('search');
  const [existingLocation, setExistingLocation] = useState<OnboardingLocation | null>(null);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [manualAddress, setManualAddress] = useState<ManualAddress>(initialManualAddress);
  const [resolvedAddressForSave, setResolvedAddressForSave] = useState<ResolvedAddress | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  // Hydrate form fields from pre-fetched context data (runs once on mount).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (hydrated) return;
    if (account) {
      const phoneRaw = account.phone ?? '';
      const phoneParsed = phoneRaw ? parsePhoneNumberFromString(phoneRaw, 'US') : null;
      setAccountName(account.name ?? '');
      setAccountEmail(account.email ?? '');
      setAccountPhone(phoneParsed ? phoneParsed.formatNational() : phoneRaw);
      setPrimaryContact(account.primary_contact_name ?? '');
      setTimezone(account.config?.timezone ?? accountConfig?.timezone ?? '');
    }
    const location = locations[0];
    if (location) {
      setExistingLocation(location);
      setLocationName(location.name);
      setAddressMode('confirmed');
      if (location.address) {
        setManualAddress({
          addressNumber: location.address.address_number ?? '',
          street: location.address.street ?? '',
          city: location.address.city ?? '',
          state: location.address.state ?? '',
          postalCode: location.address.postal_code ?? '',
        });
      }
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePhoneInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    const formatted = digits ? new AsYouType('US').input(digits) : '';
    setAccountPhone(formatted);
  }, []);

  const handlePhoneBlur = useCallback(() => {
    const parsed = parsePhoneNumberFromString(accountPhone, 'US');
    if (parsed?.isValid()) {
      setAccountPhone(parsed.formatNational());
    }
  }, [accountPhone]);

  const handleAddressResolved = useCallback(
    (resolved: ResolvedAddress, manual: ManualAddress, tz?: string) => {
      setResolvedAddressForSave(resolved);
      setManualAddress(manual);
      if (tz) setTimezone(tz);
    },
    []
  );

  const handleEditAddress = useCallback(() => {
    setEditingLocationId(existingLocation?.id ?? null);
    setResolvedAddressForSave(null);
    setExistingLocation(null);
    setAddressMode('edit');
  }, [existingLocation]);

  const handleNext = useCallback(async () => {
    if (isSaving) return;

    const errors: ValidationErrors = {};

    if (!accountName.trim()) errors.name = t.details.companyNameRequired;
    if (!accountEmail.trim()) errors.email = t.details.emailRequired;

    if (!accountPhone.trim()) {
      errors.phone = t.details.phoneRequired;
    } else {
      const parsed = parsePhoneNumberFromString(accountPhone, 'US');
      if (!parsed?.isValid()) errors.phone = t.details.phoneInvalid;
    }

    if (!primaryContact.trim()) errors.primaryContact = t.details.primaryContactRequired;
    if (!locationName.trim()) errors.locationName = t.location.nameRequired;

    function hasValidAddress(): boolean {
      if (existingLocation) return true;
      if (resolvedAddressForSave) return true;
      if (addressMode === 'edit') {
        return !!(
          manualAddress.street.trim() &&
          manualAddress.city.trim() &&
          manualAddress.state.trim() &&
          manualAddress.postalCode.trim()
        );
      }
      return false;
    }

    if (!hasValidAddress()) errors.address = t.location.addressRequired;
    if (!timezone) errors.timezone = t.details.timezoneRequired;

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setValidationErrors({});

    try {
      const parsed = parsePhoneNumberFromString(accountPhone, 'US');
      if (!parsed?.isValid()) return;

      const updatedConfig = {
        ...accountConfig,
        ...(timezone ? { timezone } : {}),
      };

      await dialstack.account.update({
        email: accountEmail.trim(),
        name: accountName.trim(),
        phone: parsed.number,
        primary_contact_name: primaryContact.trim(),
        config: updatedConfig,
      });

      // Create or update location
      if (!existingLocation) {
        const address = resolvedAddressForSave
          ? {
              address_number: resolvedAddressForSave.address_number,
              street: resolvedAddressForSave.street,
              city: resolvedAddressForSave.city,
              state: resolvedAddressForSave.state,
              postal_code: resolvedAddressForSave.postal_code,
              country: resolvedAddressForSave.country,
            }
          : {
              address_number: manualAddress.addressNumber.trim() || undefined,
              street: manualAddress.street.trim(),
              city: manualAddress.city.trim(),
              state: manualAddress.state.trim(),
              postal_code: manualAddress.postalCode.trim(),
              country: 'US',
            };

        const locationPayload = { name: locationName.trim(), address };

        if (editingLocationId) {
          await dialstack.locations.update(editingLocationId, locationPayload);
        } else {
          await dialstack.locations.create(locationPayload);
        }
      } else if (
        existingLocation.name !== locationName.trim() ||
        (existingLocation.address?.street ?? '') !== manualAddress.street.trim() ||
        (existingLocation.address?.city ?? '') !== manualAddress.city.trim() ||
        (existingLocation.address?.state ?? '') !== manualAddress.state.trim() ||
        (existingLocation.address?.postal_code ?? '') !== manualAddress.postalCode.trim()
      ) {
        await dialstack.locations.update(existingLocation.id, {
          name: locationName.trim(),
          address: {
            address_number: manualAddress.addressNumber.trim() || undefined,
            street: manualAddress.street.trim(),
            city: manualAddress.city.trim(),
            state: manualAddress.state.trim(),
            postal_code: manualAddress.postalCode.trim(),
            country: 'US',
          },
        });
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t.saveError);
      setIsSaving(false);
      return;
    }
    setIsSaving(false);
    // Non-critical reload — don't let it block completion
    await reloadSharedData().catch(() => {});
    progressStore.completeSubStep('account', 'business-details');
    onAdvance(accountEmail.trim());
  }, [
    isSaving,
    accountName,
    accountEmail,
    accountPhone,
    primaryContact,
    locationName,
    timezone,
    existingLocation,
    resolvedAddressForSave,
    addressMode,
    manualAddress,
    accountConfig,
    dialstack,
    editingLocationId,
    reloadSharedData,
    progressStore,
    onAdvance,
    t,
  ]);

  const tzLabel = timezone ? (US_TIMEZONES.find(([v]) => v === timezone)?.[1] ?? timezone) : null;
  const showTimezoneReadonly = addressMode === 'confirmed' && !!timezone;

  return (
    <div>
      <div className="card">
        <h2 className="section-title">{t.title}</h2>
        <p className="section-subtitle">{t.subtitle}</p>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t.details.companyNameLabel}</label>
            <input
              className={`form-input${validationErrors.name ? ' error' : ''}`}
              type="text"
              value={accountName}
              placeholder={t.details.companyNamePlaceholder}
              onChange={(e) => setAccountName(e.target.value)}
            />
            {validationErrors.name && <div className="form-error">{validationErrors.name}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">{t.details.primaryContactLabel}</label>
            <input
              className={`form-input${validationErrors.primaryContact ? ' error' : ''}`}
              type="text"
              value={primaryContact}
              placeholder={t.details.primaryContactPlaceholder}
              onChange={(e) => setPrimaryContact(e.target.value)}
            />
            {validationErrors.primaryContact && (
              <div className="form-error">{validationErrors.primaryContact}</div>
            )}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t.details.emailLabel}</label>
            <input
              className={`form-input${validationErrors.email ? ' error' : ''}`}
              type="email"
              value={accountEmail}
              placeholder={t.details.emailPlaceholder}
              onChange={(e) => setAccountEmail(e.target.value)}
            />
            {validationErrors.email && <div className="form-error">{validationErrors.email}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">{t.details.phoneLabel}</label>
            <input
              className={`form-input${validationErrors.phone ? ' error' : ''}`}
              type="tel"
              value={accountPhone}
              placeholder={t.details.phonePlaceholder}
              onChange={handlePhoneInput}
              onBlur={handlePhoneBlur}
            />
            {validationErrors.phone && <div className="form-error">{validationErrors.phone}</div>}
          </div>
        </div>

        <div className="e911-separator">*{t.location.e911Note}*</div>

        <h3 className="section-heading">
          {t.location.heading}
          <span
            className="info-tooltip"
            tabIndex={0}
            role="note"
            aria-label={t.location.multipleLocationsTooltip}
            title={t.location.multipleLocationsTooltip}
          >
            <InfoIcon />
          </span>
        </h3>
        <p className="section-description">{t.location.description}</p>

        <div className="form-group">
          <label className="form-label">{t.location.nameLabel}</label>
          <input
            className={`form-input${validationErrors.locationName ? ' error' : ''}`}
            type="text"
            value={locationName}
            placeholder={t.location.namePlaceholder}
            onChange={(e) => setLocationName(e.target.value)}
          />
          {validationErrors.locationName && (
            <div className="form-error">{validationErrors.locationName}</div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">{t.location.addressLabel}</label>
          <AddressSearch
            mode={addressMode}
            existingLocation={existingLocation}
            manualAddress={manualAddress}
            onModeChange={setAddressMode}
            onAddressResolved={handleAddressResolved}
            onManualAddressChange={setManualAddress}
            onEditAddress={handleEditAddress}
            suggestAddresses={dialstack.addresses.suggest}
            getPlaceDetails={dialstack.addresses.getPlaceDetails}
            locale={t.location}
          />
          {validationErrors.address && <div className="form-error">{validationErrors.address}</div>}
        </div>

        <div className="form-group">
          <label className="form-label">{t.details.timezoneLabel}</label>
          {showTimezoneReadonly ? (
            <div className="timezone-readonly">{tzLabel}</div>
          ) : (
            <>
              <select
                className={`form-select${validationErrors.timezone ? ' error' : ''}`}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                {!timezone && <option value="">{t.details.timezonePlaceholder}</option>}
                {US_TIMEZONES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {validationErrors.timezone && (
                <div className="form-error">{validationErrors.timezone}</div>
              )}
            </>
          )}
        </div>

        <ErrorAlert message={saveError} />
      </div>

      <StepNavigation
        onBack={onBack}
        backLabel={onBack ? `\u2190 ${locale.accountOnboarding.nav.back}` : undefined}
        onNext={() => void handleNext()}
        nextLabel={isSaving ? t.saving : `${locale.accountOnboarding.nav?.next ?? 'Next'} \u2192`}
        isLoading={isSaving}
      />
    </div>
  );
};
