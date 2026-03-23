import React from 'react';
import type { NumState, Dispatcher, TFn } from '../types';
import type { DIDItem } from '../../../../../types';
import { formatPhone } from '../helpers';
import { US_STATES } from '../../../../../constants/us-states';

export function OrderSearchContent({
  state,
  t,
  dispatch,
  onSearch,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
  onSearch: () => void;
}) {
  const backToOverview = () => {
    dispatch({ type: 'order_reset' });
    dispatch({ type: 'set_substep', subStep: 'overview' });
  };
  const searchTypeLabels: Record<string, string> = {
    area_code: t('accountOnboarding.numbers.order.searchByAreaCode'),
    city_state: t('accountOnboarding.numbers.order.searchByCityState'),
    zip: t('accountOnboarding.numbers.order.searchByZip'),
  };
  return (
    <>
      <h2 className="section-title">{t('accountOnboarding.numbers.order.searchTitle')}</h2>
      <p className="section-subtitle">{t('accountOnboarding.numbers.order.searchSubtitle')}</p>
      <div style={{ textAlign: 'center' }}>
        <div className="num-search-type-tabs">
          {(['area_code', 'city_state', 'zip'] as const).map((type) => (
            <button
              key={type}
              className={`num-search-type-tab${state.orderSearchType === type ? ' active' : ''}`}
              onClick={() => dispatch({ type: 'order_set_search_type', searchType: type })}
            >
              {searchTypeLabels[type]}
            </button>
          ))}
        </div>
      </div>
      <div className="num-search-row">
        {state.orderSearchType === 'area_code' && (
          <div className="form-group">
            <label className="form-label">
              {t('accountOnboarding.numbers.order.areaCodeLabel')}
            </label>
            <input
              className="form-input"
              type="text"
              maxLength={3}
              value={state.orderSearchValue}
              placeholder={t('accountOnboarding.numbers.order.areaCodePlaceholder')}
              onChange={(e) => dispatch({ type: 'order_set_search_value', value: e.target.value })}
            />
          </div>
        )}
        {state.orderSearchType === 'city_state' && (
          <>
            <div className="form-group">
              <label className="form-label">{t('accountOnboarding.numbers.order.cityLabel')}</label>
              <input
                className="form-input"
                type="text"
                value={state.orderSearchCity}
                placeholder={t('accountOnboarding.numbers.order.cityPlaceholder')}
                onChange={(e) => dispatch({ type: 'order_set_search_city', city: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                {t('accountOnboarding.numbers.order.stateLabel')}
              </label>
              <select
                className="form-select"
                value={state.orderSearchState}
                onChange={(e) =>
                  dispatch({ type: 'order_set_search_state', state: e.target.value })
                }
              >
                <option value="">{t('accountOnboarding.numbers.order.statePlaceholder')}</option>
                {US_STATES.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        {state.orderSearchType === 'zip' && (
          <div className="form-group">
            <label className="form-label">{t('accountOnboarding.numbers.order.zipLabel')}</label>
            <input
              className="form-input"
              type="text"
              maxLength={5}
              value={state.orderSearchValue}
              placeholder={t('accountOnboarding.numbers.order.zipPlaceholder')}
              onChange={(e) => dispatch({ type: 'order_set_search_value', value: e.target.value })}
            />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">{t('accountOnboarding.numbers.order.quantityLabel')}</label>
          <input
            className="form-input"
            type="number"
            min={1}
            max={50}
            value={state.orderQuantity}
            onChange={(e) =>
              dispatch({ type: 'order_set_quantity', quantity: parseInt(e.target.value, 10) || 5 })
            }
          />
        </div>
        <div className="form-group" style={{ alignSelf: 'flex-end' }}>
          <button className="btn btn-primary" disabled={state.orderIsSearching} onClick={onSearch}>
            {state.orderIsSearching
              ? t('accountOnboarding.numbers.order.searching')
              : t('accountOnboarding.numbers.order.search')}
          </button>
        </div>
      </div>
      {state.orderError && <div className="inline-alert error">{state.orderError}</div>}
      <div className="num-sub-footer" style={{ borderTop: 'none' }}>
        <button className="btn btn-ghost" onClick={backToOverview}>
          ← {t('accountOnboarding.numbers.nav.back')}
        </button>
      </div>
    </>
  );
}

export function OrderResultsContent({
  state,
  t,
  dispatch,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
}) {
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
              <th>{t('accountOnboarding.numbers.order.city')}</th>
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
                <td>{num.city}</td>
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
}

export function OrderConfirmContent({
  state,
  t,
  dispatch,
  onPlaceOrder,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
  onPlaceOrder: () => void;
}) {
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
              <th>{t('accountOnboarding.numbers.order.city')}</th>
              <th>{t('accountOnboarding.numbers.order.state')}</th>
            </tr>
          </thead>
          <tbody>
            {state.orderSelectedNumbers.map((num) => {
              const match = state.orderAvailableNumbers.find((n) => n.phone_number === num);
              return (
                <tr key={num}>
                  <td>{formatPhone(num)}</td>
                  <td>{match?.city ?? ''}</td>
                  <td>{match?.state ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
}

export function OrderStatusContent({
  state,
  t,
  dispatch,
  accountPhone,
  loadActiveDIDs,
  loadNumbers,
}: {
  state: NumState;
  t: TFn;
  dispatch: Dispatcher;
  accountPhone: string;
  loadActiveDIDs: (phone: string) => Promise<DIDItem[]>;
  loadNumbers: () => Promise<void>;
}) {
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
  const handleDone = async () => {
    dispatch({ type: 'order_reset' });
    await loadActiveDIDs(accountPhone);
    dispatch({ type: 'set_substep', subStep: 'primary-did' });
  };
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
          <button className="btn btn-primary" onClick={() => void handleDone()}>
            {t('accountOnboarding.numbers.order.continue')} →
          </button>
        </div>
      )}
    </div>
  );
}
