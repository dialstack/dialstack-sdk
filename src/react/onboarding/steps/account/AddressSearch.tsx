/**
 * Address autocomplete component for the BusinessDetails form.
 * Three modes: 'search' | 'confirmed' | 'edit'
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { AddressSuggestion, ResolvedAddress, OnboardingLocation } from '../../../../types';
import { US_STATES } from '../../../../constants/us-states';

export interface ManualAddress {
  addressNumber: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
}

export type AddressMode = 'search' | 'confirmed' | 'edit';

export interface AddressSearchProps {
  mode: AddressMode;
  existingLocation: OnboardingLocation | null;
  manualAddress: ManualAddress;
  onModeChange: (mode: AddressMode) => void;
  onAddressResolved: (resolved: ResolvedAddress, manual: ManualAddress, timezone?: string) => void;
  onManualAddressChange: (manual: ManualAddress) => void;
  onEditAddress: () => void;
  suggestAddresses: (query: string, country: string) => Promise<AddressSuggestion[]>;
  getPlaceDetails: (placeId: string) => Promise<ResolvedAddress>;
  locale: {
    searchPlaceholder: string;
    searching: string;
    noResults: string;
    enterManually: string;
    searchInstead: string;
    edit: string;
    houseNumberLabel: string;
    houseNumberPlaceholder: string;
    streetLabel: string;
    streetPlaceholder: string;
    cityLabel: string;
    cityPlaceholder: string;
    stateLabel: string;
    statePlaceholder: string;
    postalCodeLabel: string;
    postalCodePlaceholder: string;
  };
}

const CheckCircleIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 16, height: 16, color: 'var(--ds-color-success)' }}
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

function getConfirmedAddressLines(
  resolvedAddress: ResolvedAddress | null,
  existingLocation: OnboardingLocation | null
): { line1: string; line2: string } {
  if (resolvedAddress) {
    const streetLine = [resolvedAddress.address_number, resolvedAddress.street]
      .filter(Boolean)
      .join(' ');
    const regionPart = [resolvedAddress.state, resolvedAddress.postal_code]
      .filter(Boolean)
      .join(' ');
    return {
      line1: streetLine,
      line2: [resolvedAddress.city, regionPart].filter(Boolean).join(', '),
    };
  }

  if (existingLocation?.address) {
    const addr = existingLocation.address;
    if (addr.formatted_address) {
      const parts = addr.formatted_address.split(',');
      return {
        line1: parts[0]?.trim() ?? '',
        line2: parts.slice(1).join(',').trim(),
      };
    }
    const streetLine = [addr.address_number, addr.street].filter(Boolean).join(' ');
    const regionPart = [addr.state, addr.postal_code].filter(Boolean).join(' ');
    return {
      line1: streetLine,
      line2: [addr.city, regionPart].filter(Boolean).join(', '),
    };
  }

  return { line1: '', line2: '' };
}

export const AddressSearch: React.FC<AddressSearchProps> = ({
  mode,
  existingLocation,
  manualAddress,
  onModeChange,
  onAddressResolved,
  onManualAddressChange,
  onEditAddress,
  suggestAddresses,
  getPlaceDetails,
  locale,
}) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [resolvedAddress, setResolvedAddress] = useState<ResolvedAddress | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchVersion = useRef(0);

  const fetchSuggestions = useCallback(
    async (q: string) => {
      if (q.length < 3) {
        searchVersion.current++;
        setSuggestions([]);
        setDropdownOpen(false);
        setIsLoadingSuggestions(false);
        return;
      }

      const version = ++searchVersion.current;
      setIsLoadingSuggestions(true);

      try {
        const results = await suggestAddresses(q, 'US');
        if (version !== searchVersion.current) return;
        setSuggestions(results);
        setDropdownOpen(true);
        setHighlightedIndex(-1);
      } catch {
        if (version !== searchVersion.current) return;
        setSuggestions([]);
        setDropdownOpen(false);
      } finally {
        if (version === searchVersion.current) {
          setIsLoadingSuggestions(false);
        }
      }
    },
    [suggestAddresses]
  );

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setQuery(q);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        void fetchSuggestions(q);
      }, 300);
    },
    [fetchSuggestions]
  );

  const handleFocus = useCallback(() => {
    if (query.length >= 3) {
      setDropdownOpen(true);
    }
  }, [query]);

  const handleBlur = useCallback(() => {
    blurTimer.current = setTimeout(() => {
      setDropdownOpen(false);
    }, 200);
  }, []);

  const handleSelectSuggestion = useCallback(
    async (placeId: string) => {
      setDropdownOpen(false);
      try {
        const resolved = await getPlaceDetails(placeId);
        setResolvedAddress(resolved);
        const manual: ManualAddress = {
          addressNumber: resolved.address_number,
          street: resolved.street,
          city: resolved.city,
          state: resolved.state,
          postalCode: resolved.postal_code,
        };
        onAddressResolved(resolved, manual, resolved.timezone);
        onModeChange('confirmed');
      } catch {
        // Stay in search mode on error
      }
    },
    [getPlaceDetails, onAddressResolved, onModeChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!dropdownOpen || suggestions.length === 0) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
            void handleSelectSuggestion(suggestions[highlightedIndex]!.place_id);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setDropdownOpen(false);
          break;
      }
    },
    [dropdownOpen, suggestions, highlightedIndex, handleSelectSuggestion]
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  if (mode === 'confirmed') {
    const { line1, line2 } = getConfirmedAddressLines(resolvedAddress, existingLocation);
    return (
      <div className="address-confirmed">
        <div className="address-confirmed-icon">
          <CheckCircleIcon />
        </div>
        <div className="address-confirmed-text">
          {line1 && <div className="address-confirmed-line">{line1}</div>}
          {line2 && <div className="address-confirmed-line">{line2}</div>}
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          style={{
            padding: 'var(--ds-spacing-xs) var(--ds-layout-spacing-sm)',
            fontSize: 'var(--ds-font-size-small)',
          }}
          onClick={onEditAddress}
        >
          {locale.edit}
        </button>
      </div>
    );
  }

  if (mode === 'edit') {
    return (
      <>
        <div className="address-manual-fields">
          <div className="form-group">
            <label className="form-label">{locale.houseNumberLabel}</label>
            <input
              className="form-input"
              type="text"
              value={manualAddress.addressNumber}
              placeholder={locale.houseNumberPlaceholder}
              onChange={(e) =>
                onManualAddressChange({ ...manualAddress, addressNumber: e.target.value })
              }
            />
          </div>
          <div className="form-group">
            <label className="form-label">{locale.streetLabel}</label>
            <input
              className="form-input"
              type="text"
              value={manualAddress.street}
              placeholder={locale.streetPlaceholder}
              onChange={(e) => onManualAddressChange({ ...manualAddress, street: e.target.value })}
            />
          </div>
        </div>
        <div className="address-manual-row-2">
          <div className="form-group">
            <label className="form-label">{locale.cityLabel}</label>
            <input
              className="form-input"
              type="text"
              value={manualAddress.city}
              placeholder={locale.cityPlaceholder}
              onChange={(e) => onManualAddressChange({ ...manualAddress, city: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{locale.stateLabel}</label>
            <select
              className="form-select"
              value={manualAddress.state}
              onChange={(e) => onManualAddressChange({ ...manualAddress, state: e.target.value })}
            >
              <option value="">{locale.statePlaceholder}</option>
              {US_STATES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{locale.postalCodeLabel}</label>
            <input
              className="form-input"
              type="text"
              value={manualAddress.postalCode}
              placeholder={locale.postalCodePlaceholder}
              onChange={(e) =>
                onManualAddressChange({ ...manualAddress, postalCode: e.target.value })
              }
            />
          </div>
        </div>
        <button
          type="button"
          className="btn-link"
          onClick={() => {
            onModeChange('search');
            setQuery('');
            setSuggestions([]);
            setDropdownOpen(false);
          }}
        >
          {locale.searchInstead}
        </button>
      </>
    );
  }

  // mode === 'search'
  return (
    <>
      <div className="address-autocomplete">
        <input
          className="form-input"
          type="text"
          value={query}
          placeholder={locale.searchPlaceholder}
          autoComplete="off"
          onChange={handleQueryChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {(dropdownOpen || isLoadingSuggestions) && (
          <div className="address-dropdown">
            {isLoadingSuggestions ? (
              <div className="address-no-results">{locale.searching}</div>
            ) : suggestions.length === 0 && query.length >= 3 ? (
              <div className="address-no-results">{locale.noResults}</div>
            ) : (
              suggestions.map((s, i) => (
                <div
                  key={s.place_id}
                  className={`address-suggestion${i === highlightedIndex ? ' highlighted' : ''}`}
                  onMouseDown={() => void handleSelectSuggestion(s.place_id)}
                >
                  <div className="address-suggestion-title">{s.title}</div>
                  <div className="address-suggestion-detail">{s.formatted_address}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <button type="button" className="btn-link" onClick={() => onModeChange('edit')}>
        {locale.enterManually}
      </button>
    </>
  );
};
