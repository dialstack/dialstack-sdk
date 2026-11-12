import React, { useState } from 'react';
import type { NumState, Dispatcher, TFn } from '../types';
import { formatPhone } from '../helpers';
import { BillingImpactNotice } from '../../../components/BillingImpactNotice';
import {
  type LocalSearchQuery,
  readLocalSearch,
  type SearchRegion,
  suggestRegions,
} from '@dialstack/sdk-js/pure';

/** What the location field names: a picked suggestion, or the text read alone. */
export function orderSearchQuery(state: NumState): LocalSearchQuery | undefined {
  if (state.orderSearchRegion) return { kind: 'region', ...state.orderSearchRegion };
  return readLocalSearch(state.orderSearchValue);
}

/** How the location field read its text, said under it as it is typed. */
function locationHint(
  state: NumState,
  suggesting: boolean,
  t: TFn
): { text: string; unknown: boolean } {
  const query = orderSearchQuery(state);
  const k = 'phoneNumberOrdering.search';
  if (query?.kind === 'area_code')
    return { text: t(`${k}.readsAreaCode`, { areaCode: query.areaCode }), unknown: false };
  if (query?.kind === 'zip')
    return { text: t(`${k}.readsZip`, { zip: query.zip }), unknown: false };
  if (query?.kind === 'region')
    return {
      text: t(`${k}.readsRegion`, { region: query.name, country: t(`countries.${query.country}`) }),
      unknown: false,
    };
  const typed = state.orderSearchValue.trim();
  if (!typed || suggesting)
    return { text: t(`${k}.locationHelp.area_code_zip_region`), unknown: false };
  return { text: t(`${k}.readsNothing`, { text: typed }), unknown: true };
}

export const OrderSearchContent = ({
  state,
  t,
  dispatch,
  onSearch,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
  onSearch: () => void;
}) => {
  const [suggestions, setSuggestions] = useState<SearchRegion[]>([]);
  const [active, setActive] = useState(-1);
  const backToOverview = () => {
    dispatch({ type: 'order_reset' });
    dispatch({ type: 'set_substep', subStep: 'overview' });
  };
  const query = orderSearchQuery(state);
  const canSearch = !state.orderIsSearching && query !== undefined;
  const hint = locationHint(state, suggestions.length > 0, t);

  const type = (value: string) => {
    dispatch({ type: 'order_set_search_value', value });
    const found = suggestRegions(value);
    // A name already complete needs no list under it.
    const read = readLocalSearch(value);
    setSuggestions(read?.kind === 'region' && found.length === 1 ? [] : found);
    setActive(-1);
  };
  const pick = (region: SearchRegion) => {
    dispatch({ type: 'order_pick_region', region });
    setSuggestions([]);
    setActive(-1);
  };
  // Arrow keys walk the suggestions, Enter picks one or searches, Escape closes them.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const count = suggestions.length;
    if (e.key === 'ArrowDown' && count > 0) {
      e.preventDefault();
      setActive((active + 1) % count);
    } else if (e.key === 'ArrowUp' && count > 0) {
      e.preventDefault();
      setActive((active - 1 + count) % count);
    } else if (e.key === 'Escape' && count > 0) {
      e.preventDefault();
      setSuggestions([]);
      setActive(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = suggestions[active];
      if (chosen) pick(chosen);
      else if (canSearch) onSearch();
    }
  };

  return (
    <>
      <h2 className="section-title">{t('accountOnboarding.numbers.order.searchTitle')}</h2>
      <p className="section-subtitle">{t('accountOnboarding.numbers.order.searchSubtitle')}</p>
      <div className="num-search-body">
        <div className="num-search-bar">
          <div className="form-group">
            <label className="form-label" htmlFor="num-order-location">
              {t('phoneNumberOrdering.search.locationLabel.area_code_zip_region')}
            </label>
            <div className="num-combobox">
              <input
                id="num-order-location"
                className="form-input"
                type="text"
                role="combobox"
                aria-autocomplete="list"
                autoComplete="off"
                aria-controls="num-order-location-options"
                aria-expanded={suggestions.length > 0}
                aria-describedby="num-order-location-hint"
                aria-activedescendant={
                  active >= 0 ? `num-order-location-option-${active}` : undefined
                }
                value={state.orderSearchValue}
                placeholder={t(
                  'phoneNumberOrdering.search.locationPlaceholder.area_code_zip_region'
                )}
                onChange={(e) => type(e.target.value)}
                onKeyDown={onKeyDown}
              />
              {suggestions.length > 0 && (
                <ul
                  id="num-order-location-options"
                  className="num-combobox-options"
                  role="listbox"
                  aria-label={t('phoneNumberOrdering.search.regionSuggestions')}
                >
                  {suggestions.map((r, i) => (
                    <li
                      key={`${r.country}-${r.region}`}
                      id={`num-order-location-option-${i}`}
                      className="num-combobox-option"
                      role="option"
                      aria-selected={i === active}
                      onMouseDown={(e) => {
                        // Before the input's blur, so the click lands.
                        e.preventDefault();
                        pick(r);
                      }}
                    >
                      <span>{r.name}</span>
                      <span className="num-combobox-option-country">
                        {t(`countries.${r.country}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="num-order-quantity">
              {t('accountOnboarding.numbers.order.quantityLabel')}
            </label>
            <input
              id="num-order-quantity"
              className="form-input"
              type="number"
              min={1}
              max={50}
              value={state.orderQuantity}
              onChange={(e) =>
                dispatch({
                  type: 'order_set_quantity',
                  quantity: parseInt(e.target.value, 10) || 5,
                })
              }
            />
          </div>
          <div className="form-group">
            <button className="btn btn-primary" disabled={!canSearch} onClick={onSearch}>
              {state.orderIsSearching
                ? t('accountOnboarding.numbers.order.searching')
                : t('accountOnboarding.numbers.order.search')}
            </button>
          </div>
        </div>
        <p
          id="num-order-location-hint"
          className={`num-search-hint${hint.unknown ? ' unknown' : ''}`}
          aria-live="polite"
        >
          {hint.text}
        </p>
        {query?.kind === 'region' && (
          <div className="form-group num-search-city">
            <label className="form-label" htmlFor="num-order-city">
              {t('accountOnboarding.numbers.order.cityLabel')}
            </label>
            <input
              id="num-order-city"
              className="form-input"
              type="text"
              value={state.orderSearchCity}
              placeholder={t('accountOnboarding.numbers.order.cityPlaceholder')}
              onChange={(e) => dispatch({ type: 'order_set_search_city', city: e.target.value })}
            />
          </div>
        )}
      </div>
      {state.orderError && <div className="inline-alert error">{state.orderError}</div>}
      <div className="num-sub-footer" style={{ borderTop: 'none' }}>
        <button className="btn btn-ghost" onClick={backToOverview}>
          ← {t('accountOnboarding.numbers.nav.back')}
        </button>
      </div>
    </>
  );
};

export const OrderResultsContent = ({
  state,
  t,
  dispatch,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
}) => {
  const allSelected =
    state.orderSelectedNumbers.length === state.orderAvailableNumbers.length &&
    state.orderAvailableNumbers.length > 0;
  if (state.orderAvailableNumbers.length === 0) {
    return (
      <>
        <h2 className="section-title">{t('accountOnboarding.numbers.order.resultsTitle')}</h2>
        <p className="section-subtitle">{t('accountOnboarding.numbers.order.noResults')}</p>
        <div className="num-sub-footer">
          <button
            className="btn btn-secondary"
            onClick={() => dispatch({ type: 'set_substep', subStep: 'order-search' })}
          >
            {t('accountOnboarding.numbers.nav.back')}
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      <h2 className="section-title">
        {t('accountOnboarding.numbers.order.resultsTitle')}{' '}
        <span className="num-count-badge">{state.orderAvailableNumbers.length}</span>
      </h2>
      <div className="num-table-container">
        <table className="num-results-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => dispatch({ type: 'order_select_all' })}
                />
              </th>
              <th>{t('accountOnboarding.numbers.overview.phoneNumber')}</th>
              <th>{t('accountOnboarding.numbers.order.state')}</th>
            </tr>
          </thead>
          <tbody>
            {state.orderAvailableNumbers.map((num) => (
              <tr key={num.phone_number}>
                <td>
                  <input
                    type="checkbox"
                    checked={state.orderSelectedNumbers.includes(num.phone_number)}
                    onChange={() =>
                      dispatch({ type: 'order_toggle_number', phone: num.phone_number })
                    }
                  />
                </td>
                <td>{formatPhone(num.phone_number)}</td>
                <td>{num.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {state.orderSelectedNumbers.length > 0 && (
        <div className="num-selected-count">
          {state.orderSelectedNumbers.length} {t('accountOnboarding.numbers.order.selected')}
        </div>
      )}
      <div className="num-sub-footer">
        <button
          className="btn btn-ghost"
          onClick={() => dispatch({ type: 'set_substep', subStep: 'order-search' })}
        >
          ← {t('accountOnboarding.numbers.nav.back')}
        </button>
        <div className="num-sub-footer-buttons">
          <button
            className="btn btn-secondary"
            onClick={() => dispatch({ type: 'set_substep', subStep: 'order-search' })}
          >
            {t('accountOnboarding.numbers.nav.backToSearch')}
          </button>
          <button
            className="btn btn-primary"
            disabled={state.orderSelectedNumbers.length === 0}
            onClick={() => dispatch({ type: 'set_substep', subStep: 'order-confirm' })}
          >
            {t('accountOnboarding.numbers.nav.confirm')}
          </button>
        </div>
      </div>
    </>
  );
};

export const OrderConfirmContent = ({
  state,
  t,
  dispatch,
  onPlaceOrder,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
  onPlaceOrder: () => void;
}) => {
  return (
    <>
      <h2 className="section-title">{t('accountOnboarding.numbers.order.confirmTitle')}</h2>
      <p className="section-subtitle">
        {t('accountOnboarding.numbers.order.confirmSubtitle', {
          count: state.orderSelectedNumbers.length,
        })}
      </p>
      <div className="num-table-container">
        <table className="num-confirm-table">
          <thead>
            <tr>
              <th>{t('accountOnboarding.numbers.overview.phoneNumber')}</th>
              <th>{t('accountOnboarding.numbers.order.state')}</th>
            </tr>
          </thead>
          <tbody>
            {state.orderSelectedNumbers.map((num) => {
              const match = state.orderAvailableNumbers.find((n) => n.phone_number === num);
              return (
                <tr key={num}>
                  <td>{formatPhone(num)}</td>
                  <td>{match?.state ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <BillingImpactNotice resource="phoneNumber" count={state.orderSelectedNumbers.length} />
      <div className="inline-alert info">{t('accountOnboarding.numbers.order.carrierNote')}</div>
      {state.orderError && <div className="inline-alert error">{state.orderError}</div>}
      <div className="num-sub-footer">
        <button
          className="btn btn-ghost"
          onClick={() => dispatch({ type: 'set_substep', subStep: 'order-results' })}
        >
          ← {t('accountOnboarding.numbers.nav.back')}
        </button>
        <button className="btn btn-primary" disabled={state.orderIsPlacing} onClick={onPlaceOrder}>
          {state.orderIsPlacing
            ? t('accountOnboarding.numbers.order.placing')
            : t('accountOnboarding.numbers.order.placeOrder')}
        </button>
      </div>
    </>
  );
};

export const OrderStatusContent = ({
  state,
  t,
  dispatch,
  onContinue,
  loadNumbers,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
  onContinue: () => Promise<void>;
  loadNumbers: () => Promise<void>;
}) => {
  const order = state.orderCurrentOrder;
  if (!order) return null;
  const pollExhausted = order.status === 'pending' && state.orderPollCount >= 5;
  const showDone = order.status !== 'pending' || pollExhausted;
  const messages: Record<string, string> = {
    complete: t('accountOnboarding.numbers.order.statusComplete'),
    failed: t('accountOnboarding.numbers.order.statusFailed'),
    partial: t('accountOnboarding.numbers.order.statusPartial'),
  };
  const message =
    order.status === 'pending'
      ? pollExhausted
        ? t('accountOnboarding.numbers.order.statusStalled')
        : t('accountOnboarding.numbers.order.statusPending')
      : (messages[order.status] ?? '');
  return (
    <div className="placeholder" style={{ minHeight: 200 }}>
      {order.status === 'pending' && !pollExhausted && (
        <div className="num-order-status-icon pending">
          <div className="spinner" />
        </div>
      )}
      <h2 className="section-title">{t('accountOnboarding.numbers.order.statusTitle')}</h2>
      <p className="section-subtitle">{message}</p>
      {showDone && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--ds-spacing-sm)',
            marginTop: 'var(--ds-layout-spacing-md)',
          }}
        >
          <button
            className="btn btn-secondary"
            onClick={() => {
              dispatch({ type: 'order_reset' });
              void loadNumbers();
              dispatch({ type: 'set_substep', subStep: 'order-search' });
            }}
          >
            {t('accountOnboarding.numbers.order.orderMore')}
          </button>
          <button className="btn btn-primary" onClick={() => void onContinue()}>
            {t('accountOnboarding.numbers.order.continue')} →
          </button>
        </div>
      )}
    </div>
  );
};
