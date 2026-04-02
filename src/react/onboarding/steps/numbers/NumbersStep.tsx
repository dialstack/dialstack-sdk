/**
 * Numbers onboarding step — order/port phone numbers, set primary DID, configure caller ID.
 *
 * SAFETY NOTE: dangerouslySetInnerHTML is used only for static SVG constants
 * (PORT_SVG, PLUS_CIRCLE_SVG, PHONE_SVG, SUCCESS_SVG, CHECK_SVG_WHITE) imported from
 * icons.ts in our own codebase — never user input. All user data is rendered as plain
 * React text nodes.
 */

import React, { useReducer, useEffect, useCallback, useRef, useMemo } from 'react';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type {
  DIDItem,
  NumberOrder,
  PortOrder,
  OnboardingLocation,
  DialStackInstance,
  SearchAvailableNumbersOptions,
  CreatePortOrderRequest,
} from '../../../../types';
import { ApiError } from '../../../../core/instance';
import { mergePhoneNumbers } from '../../merge-phone-numbers';
import { ORDERED_SUBSTEPS } from '../../constants';
import { CHECK_SVG_WHITE, CHECK_CIRCLE_SVG, ERROR_SVG, PHONE_SVG } from '../../icons';
import { useOnboarding, findNextIncompleteStep } from '../../OnboardingContext';
import { OnboardingLayout } from '../../OnboardingLayout';
import { CheckIcon } from '../../components/icons';
import numbersStyles from '../../styles/numbers-styles.css';

import type { NumState, CardMode } from './types';
import { numReducer, INITIAL_STATE, E911_POLL_MAX } from './types';
import { formatPhone, getSidebarActiveKey, validateCallerIdName } from './helpers';
import { PhoneCardStrip } from './content/PhoneCardStrip';
import { OverviewContent } from './content/OverviewContent';
import { PrimaryDIDContent } from './content/PrimaryDIDContent';
import { CallerIdContent } from './content/CallerIdContent';
import { DirectoryListingContent } from './content/DirectoryListingContent';
import {
  OrderSearchContent,
  OrderResultsContent,
  OrderConfirmContent,
  OrderStatusContent,
} from './content/OrderContent';
import {
  PortNumbersContent,
  PortEligibilityContent,
  PortCarrierSelectContent,
  PortSubscriberContent,
  PortFocDateContent,
  PortDocumentsContent,
  PortReviewContent,
  PortSubmittedContent,
} from './content/PortContent';

// Stable array for ShadowContainer — step-specific CSS passed to OnboardingLayout.
const NUMBERS_EXTRA_STYLESHEETS = [numbersStyles];

// ============================================================================
// Component
// ============================================================================

export const NumbersStep: React.FC = () => {
  const {
    dialstack,
    progressStore,
    activeSteps,
    locale,
    platformName,
    account: contextAccount,
    locations: contextLocations,
  } = useOnboarding();
  const [state, dispatch] = useReducer(numReducer, INITIAL_STATE);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orderPollGenRef = useRef(0);
  const e911GenRef = useRef(0);
  const e911PollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createdDialPlanIdRef = useRef<string | undefined>(undefined);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Back from first sub-step goes to previous step (if any).
  const numbersIdx = activeSteps.indexOf('numbers');
  const handleBackToPrevStep = useMemo(() => {
    if (numbersIdx <= 0) return undefined;
    const prevStep = activeSteps[numbersIdx - 1]!;
    return () => progressStore.setCurrentStep(prevStep);
  }, [numbersIdx, activeSteps, progressStore]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const parts = key.split('.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let val: any = locale;
      for (const p of parts) val = val?.[p];
      if (typeof val !== 'string') return key;
      const merged = { platformName, ...params };
      return Object.entries(merged).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), val);
    },
    [locale, platformName]
  );

  // Cancel E911 and polls on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (e911PollTimerRef.current) clearTimeout(e911PollTimerRef.current);
      orderPollGenRef.current++;
      e911GenRef.current++;
    };
  }, []);

  // Track sub-step progression: update progress based on navigation direction
  const prevSubStepRef = useRef(state.subStep);
  useEffect(() => {
    const prev = prevSubStepRef.current;
    prevSubStepRef.current = state.subStep;
    if (prev === state.subStep) return;

    const ordered = ORDERED_SUBSTEPS.numbers;
    const prevIdx = ordered.indexOf(prev);
    const currIdx = ordered.indexOf(state.subStep);

    if (currIdx > prevIdx) {
      // Forward — mark previous substep complete
      progressStore.completeSubStep('numbers', prev);
    } else {
      // Backward — remove substeps from current+1 onward
      const toRemove = ordered.slice(currIdx + 1);
      progressStore.removeSubSteps('numbers', toRemove);
    }
  }, [state.subStep, progressStore]);

  // Mark all substeps complete when the step finishes (ensures 100% regardless of which flow the
  // user took — some groups like 'setup'/'verification' are skipped if numbers already exist)
  useEffect(() => {
    if (state.isComplete) {
      progressStore.markStepComplete('numbers');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isComplete]);

  // Load numbers data
  const loadNumbers = useCallback(async () => {
    dispatch({ type: 'load_numbers_start' });
    try {
      const [dids, orders, ports] = await Promise.all([
        dialstack.fetchAllPages<DIDItem>((opts) => dialstack.listPhoneNumbers(opts)),
        dialstack.fetchAllPages<NumberOrder>((opts) => dialstack.listNumberOrders(opts)),
        dialstack.fetchAllPages<PortOrder>((opts) => dialstack.listPortOrders(opts)),
      ]);
      dispatch({
        type: 'load_numbers_success',
        phoneNumbers: mergePhoneNumbers(dids, orders, ports),
      });
    } catch (err) {
      dispatch({
        type: 'load_numbers_error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [dialstack]);

  useEffect(() => {
    void loadNumbers();
  }, [loadNumbers]);

  // Order polling
  const startOrderPoll = useCallback(
    (orderId: string, pollCount: number) => {
      const gen = ++orderPollGenRef.current;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollTimerRef.current = setTimeout(async () => {
        if (orderPollGenRef.current !== gen) return;
        try {
          const order = await dialstack.getPhoneNumberOrder(orderId);
          if (orderPollGenRef.current !== gen) return;
          const newCount = pollCount + 1;
          dispatch({ type: 'order_poll_update', order, pollCount: newCount });
          if (order.status === 'pending' && newCount < 5) startOrderPoll(orderId, newCount);
        } catch (err) {
          if (process.env.NODE_ENV !== 'production')
            console.warn('[NumbersStep] order poll error', err);
        }
      }, 2000);
    },
    [dialstack]
  );

  // Load active DIDs
  const loadActiveDIDs = useCallback(
    async (accountPhone: string): Promise<DIDItem[]> => {
      dispatch({ type: 'load_dids_start' });
      try {
        const dids = await dialstack.fetchAllPages<DIDItem>((opts) =>
          dialstack.listPhoneNumbers({ ...opts, status: 'active' })
        );

        const savedPrimaryDIDId = contextLocations[0]?.primary_did_id ?? null;
        let selectedId: string | null = null;
        let autoMatched = false;

        // Priority 1: previously saved primary_did_id on the location
        if (savedPrimaryDIDId && dids.find((d) => d.id === savedPrimaryDIDId)) {
          selectedId = savedPrimaryDIDId;
        } else {
          // Priority 2: auto-match account phone to a DID
          const parsed = parsePhoneNumberFromString(accountPhone, 'US');
          const e164 = parsed?.number;
          const matched = e164 ? dids.find((d) => d.phone_number === e164) : undefined;
          if (matched) {
            selectedId = matched.id;
            autoMatched = true;
          }
          // Priority 3: convenience — only one DID
          else if (dids.length === 1) selectedId = dids[0]!.id;
        }

        dispatch({ type: 'load_dids_success', dids, selectedId, autoMatched });
        return dids;
      } catch (err) {
        dispatch({
          type: 'load_dids_error',
          error: err instanceof Error ? err.message : String(err),
        });
        return [];
      }
    },
    [dialstack, contextLocations]
  );

  // Search numbers
  const searchNumbers = useCallback(
    async (s: NumState) => {
      dispatch({ type: 'order_search_start' });
      try {
        const opts: SearchAvailableNumbersOptions = { quantity: s.orderQuantity };
        if (s.orderSearchType === 'area_code') opts.areaCode = s.orderSearchValue;
        else if (s.orderSearchType === 'city_state') {
          opts.city = s.orderSearchCity;
          opts.state = s.orderSearchState;
        } else opts.zip = s.orderSearchValue;
        const results = await dialstack.searchAvailableNumbers(opts);
        dispatch({ type: 'order_search_success', results });
      } catch (err) {
        dispatch({
          type: 'order_search_error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [dialstack]
  );

  // Place order
  const placeOrder = useCallback(
    async (selectedNumbers: string[]) => {
      if (selectedNumbers.length === 0) return;
      dispatch({ type: 'order_place_start' });
      try {
        const order = await dialstack.createPhoneNumberOrder(selectedNumbers);
        dispatch({ type: 'order_place_success', order });
        startOrderPoll(order.id, 0);
      } catch (err) {
        dispatch({
          type: 'order_place_error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [dialstack, startOrderPoll]
  );

  // Check port eligibility
  const checkPortEligibility = useCallback(
    async (s: NumState) => {
      const errors: Record<number, string> = {};
      const validNumbers: string[] = [];
      const invalidMsg = t('accountOnboarding.numbers.validation.phoneInvalid');
      for (let i = 0; i < s.portPhoneInputs.length; i++) {
        const trimmed = s.portPhoneInputs[i]!.trim();
        if (!trimmed) continue;
        const parsed = parsePhoneNumberFromString(trimmed, 'US');
        if (!parsed || !parsed.isValid()) errors[i] = invalidMsg;
        else validNumbers.push(parsed.format('E.164'));
      }
      if (Object.keys(errors).length > 0) {
        dispatch({ type: 'port_set_phone_errors', errors });
        return;
      }
      if (validNumbers.length === 0) {
        dispatch({
          type: 'port_check_eligibility_error',
          error: t('accountOnboarding.numbers.validation.phoneRequired'),
        });
        return;
      }
      dispatch({ type: 'port_check_eligibility_start' });
      try {
        const result = await dialstack.checkPortEligibility(validNumbers);
        dispatch({ type: 'port_check_eligibility_success', result });
      } catch (err) {
        dispatch({
          type: 'port_check_eligibility_error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [dialstack, t]
  );

  // Validate subscriber form
  const validateSubscriber = useCallback(
    (s: NumState): boolean => {
      const errors: Record<string, string> = {};
      if (!s.portSubscriberBtn.trim())
        errors.btn = t('accountOnboarding.numbers.validation.btnRequired');
      else {
        const p = parsePhoneNumberFromString(s.portSubscriberBtn, 'US');
        if (!p || !p.isValid()) errors.btn = t('accountOnboarding.numbers.validation.btnInvalid');
      }
      if (!s.portSubscriberBusinessName.trim())
        errors.businessName = t('accountOnboarding.numbers.validation.businessNameRequired');
      if (!s.portSubscriberApproverName.trim())
        errors.approverName = t('accountOnboarding.numbers.validation.approverNameRequired');
      if (!s.portSubscriberHouseNumber.trim())
        errors.houseNumber = t('accountOnboarding.numbers.validation.houseNumberRequired');
      if (!s.portSubscriberStreetName.trim())
        errors.streetName = t('accountOnboarding.numbers.validation.streetNameRequired');
      if (!s.portSubscriberCity.trim())
        errors.city = t('accountOnboarding.numbers.validation.cityRequired');
      if (!s.portSubscriberState.trim())
        errors.state = t('accountOnboarding.numbers.validation.stateRequired');
      if (!s.portSubscriberZip.trim())
        errors.zip = t('accountOnboarding.numbers.validation.zipRequired');
      if (Object.keys(errors).length > 0) {
        dispatch({ type: 'port_set_subscriber_errors', errors });
        return false;
      }
      return true;
    },
    [t]
  );

  // Validate FOC date
  const validateFocDate = useCallback(
    (s: NumState): boolean => {
      const errors: Record<string, string> = {};
      if (!s.portFocDate) {
        errors.date = t('accountOnboarding.numbers.validation.focDateRequired');
      } else {
        const focDate = new Date(s.portFocDate + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let bizDays = 0;
        const check = new Date(today);
        while (bizDays < 5) {
          check.setDate(check.getDate() + 1);
          const d = check.getDay();
          if (d !== 0 && d !== 6) bizDays++;
        }
        if (focDate < check) errors.date = t('accountOnboarding.numbers.validation.focDateTooSoon');
        const maxDate = new Date(today);
        maxDate.setDate(maxDate.getDate() + 30);
        if (focDate > maxDate)
          errors.date = t('accountOnboarding.numbers.validation.focDateTooFar');
      }
      if (!s.portFocTime) errors.time = t('accountOnboarding.numbers.validation.focTimeRequired');
      if (Object.keys(errors).length > 0) {
        dispatch({ type: 'port_set_foc_errors', errors });
        return false;
      }
      return true;
    },
    [t]
  );

  // Submit port order — scoped to current carrier group when in multi-carrier mode
  const submitPort = useCallback(
    async (s: NumState) => {
      if (!s.portEligibilityResult) return;
      dispatch({ type: 'port_submit_start' });
      try {
        // Determine which numbers to submit: current carrier group or all portable
        const isMultiCarrier = s.portCarrierGroups.size > 1;
        const portableNumbers =
          isMultiCarrier && s.portCurrentCarrier
            ? (s.portCarrierGroups.get(s.portCurrentCarrier) ?? [])
            : s.portEligibilityResult.portable_numbers.map((n) => n.phone_number);

        const btnParsed = parsePhoneNumberFromString(s.portSubscriberBtn, 'US');
        const request: CreatePortOrderRequest = {
          phone_numbers: portableNumbers,
          subscriber: {
            btn: btnParsed?.format('E.164') || s.portSubscriberBtn,
            business_name: s.portSubscriberBusinessName.trim(),
            approver_name: s.portSubscriberApproverName.trim(),
            account_number: s.portSubscriberAccountNumber.trim() || undefined,
            pin: s.portSubscriberPin.trim() || undefined,
            address: {
              house_number: s.portSubscriberHouseNumber.trim(),
              street_name: s.portSubscriberStreetName.trim(),
              line2: s.portSubscriberLine2.trim() || undefined,
              city: s.portSubscriberCity.trim(),
              state: s.portSubscriberState.trim(),
              zip: s.portSubscriberZip.trim(),
            },
          },
          requested_foc_date: s.portFocDate,
          requested_foc_time: s.portFocTime || undefined,
        };
        const order = await dialstack.createPortOrder(request);
        if (s.portBillFile) await dialstack.uploadBillCopy(order.id, s.portBillFile);
        if (s.portCsrFile) await dialstack.uploadCSR(order.id, s.portCsrFile);
        await dialstack.approvePortOrder(order.id, {
          signature: s.portSignature.trim(),
          ip: '0.0.0.0',
        });
        await dialstack.submitPortOrder(order.id);

        // Multi-carrier: mark this carrier as done and go back to carrier select or finish
        if (isMultiCarrier && s.portCurrentCarrier) {
          dispatch({
            type: 'port_carrier_submitted',
            carrier: s.portCurrentCarrier,
            orderId: order.id,
            status: 'submitted',
          });
          const carriers = Array.from(s.portCarrierGroups.keys());
          const nextCompletedSet = new Set([...s.portCompletedCarriers, s.portCurrentCarrier]);
          const allDone = carriers.every((c) => nextCompletedSet.has(c));
          if (allDone) {
            dispatch({ type: 'port_submit_success' });
          } else {
            dispatch({ type: 'set_substep', subStep: 'port-carrier-select' });
          }
        } else {
          dispatch({ type: 'port_submit_success' });
        }
      } catch (err) {
        dispatch({
          type: 'port_submit_error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [dialstack]
  );

  // Submit a single caller ID entry (returns result without dispatching)
  const submitCallerIdSingle = useCallback(
    async (
      didId: string,
      name: string,
      dialstackInst: DialStackInstance
    ): Promise<{ status: 'submitted' | 'error'; error?: string }> => {
      if (!name.trim()) return { status: 'submitted' };
      const err = validateCallerIdName(
        name,
        t('accountOnboarding.numbers.callerId.validation.tooLong'),
        t('accountOnboarding.numbers.callerId.validation.invalidChars')
      );
      if (err) return { status: 'error', error: err };
      try {
        await dialstackInst.updateCallerID(didId, name.trim());
        dispatch({ type: 'caller_id_persist_name', didId, name: name.trim() });
        return { status: 'submitted' };
      } catch (err2) {
        const isConflict = err2 instanceof ApiError && err2.status === 409;
        return {
          status: 'error',
          error: isConflict
            ? t('accountOnboarding.numbers.callerId.error.conflict')
            : t('accountOnboarding.numbers.callerId.error.submitFailed'),
        };
      }
    },
    [t]
  );

  // E911 polling: after provisioning, poll getLocation every 2s up to 5 times
  const E911_POLL_INTERVAL_MS = 2000;

  const startE911Polling = useCallback(
    (locationId: string, gen: number) => {
      if (e911PollTimerRef.current) clearTimeout(e911PollTimerRef.current);
      let count = 0;

      const pollNext = () => {
        e911PollTimerRef.current = setTimeout(async () => {
          if (e911GenRef.current !== gen) return;
          count++;
          try {
            const loc = await dialstack.getLocation(locationId);
            if (e911GenRef.current !== gen) return;

            if (loc.e911_status === 'provisioned') {
              e911PollTimerRef.current = null;
              dispatch({ type: 'e911_set_state', state: 'simple', location: loc, pollCount: 0 });
            } else if (loc.e911_status === 'failed') {
              e911PollTimerRef.current = null;
              dispatch({ type: 'e911_set_state', state: 'failed', location: loc });
            } else if (count < E911_POLL_MAX) {
              dispatch({
                type: 'e911_set_state',
                state: 'running',
                location: loc,
                pollCount: count,
              });
              pollNext();
            } else {
              // Max polls reached, still pending — show soft success
              e911PollTimerRef.current = null;
              dispatch({
                type: 'e911_set_state',
                state: 'simple',
                location: loc,
                pollCount: count,
              });
            }
          } catch (err) {
            if (e911GenRef.current !== gen) return;
            console.warn('[dialstack] E911 poll failed:', err);
            e911PollTimerRef.current = null;
            dispatch({ type: 'e911_set_state', state: 'failed' });
          }
        }, E911_POLL_INTERVAL_MS);
      };

      dispatch({ type: 'e911_set_state', state: 'running', pollCount: 0 });
      pollNext();
    },
    [dialstack, E911_POLL_INTERVAL_MS]
  );

  /** After provisioning returns pending/binding, decide whether to poll or show result. */
  const handleProvisionResult = useCallback(
    (provisioned: OnboardingLocation, locationId: string, gen: number) => {
      if (provisioned.e911_status === 'pending' || provisioned.e911_status === 'binding') {
        dispatch({ type: 'e911_set_state', state: 'running', location: provisioned, pollCount: 0 });
        startE911Polling(locationId, gen);
      } else if (provisioned.e911_status === 'failed') {
        dispatch({ type: 'e911_set_state', state: 'failed', location: provisioned });
      } else {
        dispatch({ type: 'e911_set_state', state: 'simple', location: provisioned });
      }
    },
    [startE911Polling]
  );

  // Navigate to next main step: show complete state + trigger E911 provisioning
  const navigateToNext = useCallback(
    async (currentState: NumState) => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (e911PollTimerRef.current) clearTimeout(e911PollTimerRef.current);
      dispatch({ type: 'set_complete' });
      dispatch({ type: 'e911_set_state', state: 'running', pollCount: 0 });

      const gen = ++e911GenRef.current;
      const cancelled = () => e911GenRef.current !== gen;

      try {
        const activeDIDs = await dialstack.fetchAllPages<DIDItem>((opts) =>
          dialstack.listPhoneNumbers({ ...opts, status: 'active' })
        );

        if (cancelled()) return;
        if (activeDIDs.length === 0) {
          dispatch({ type: 'e911_set_state', state: 'idle' });
          return;
        }

        // --- Default dial plan creation & DID routing ---
        if (cancelled()) return;
        const config = contextAccount?.config;
        const storedDpId = config?.onboarding_progress?.default_dial_plan_id;
        let dialPlanId: string | undefined =
          storedDpId ?? createdDialPlanIdRef.current ?? undefined;

        // Check if stored dial plan still exists
        if (dialPlanId) {
          try {
            await dialstack.getDialPlan(dialPlanId);
          } catch {
            dialPlanId = undefined; // Gone — will re-create
          }
        }
        if (cancelled()) return;

        // Create dial plan if needed
        if (!dialPlanId) {
          try {
            const dp = await dialstack.createDialPlan({
              name: t('accountOnboarding.numbers.defaultDialPlanName'),
              entry_node: 'ring-all',
              nodes: [
                {
                  id: 'ring-all',
                  type: 'ring_all_users',
                  config: { timeout: 30 },
                },
              ],
            });
            dialPlanId = dp.id;
            createdDialPlanIdRef.current = dialPlanId;
          } catch (err) {
            console.warn('[dialstack] Failed to create default dial plan:', err);
          }

          // Persist dial plan ID to account config (best-effort — ref keeps it for this session)
          if (dialPlanId) {
            try {
              await dialstack.updateAccount({
                config: {
                  ...config,
                  onboarding_progress: {
                    ...config?.onboarding_progress,
                    default_dial_plan_id: dialPlanId,
                  },
                },
              });
            } catch (err) {
              console.warn('[dialstack] Failed to persist dial plan ID to account config:', err);
            }
          }
        }
        if (cancelled()) return;

        // Assign unrouted DIDs to the dial plan
        if (dialPlanId) {
          const unroutedDIDs = activeDIDs.filter((d) => !d.routing_target);
          await Promise.all(
            unroutedDIDs.map((did) =>
              dialstack.updatePhoneNumberRoute(did.id, dialPlanId!).catch((err) => {
                console.warn(`[dialstack] Failed to route DID ${did.id}:`, err);
              })
            )
          );
        }
        if (cancelled()) return;
        // --- End dial plan logic ---

        if (cancelled()) return;
        if (contextLocations.length !== 1) {
          dispatch({ type: 'e911_set_state', state: 'complex' });
          return;
        }

        const location = contextLocations[0]!;
        if (location.primary_did_id) {
          // Already has a primary DID — check status
          if (location.e911_status === 'provisioned') {
            dispatch({ type: 'e911_set_state', state: 'simple', location });
            return;
          }
          if (location.e911_status === 'pending' || location.e911_status === 'binding') {
            dispatch({ type: 'e911_set_state', state: 'running', location, pollCount: 0 });
            startE911Polling(location.id, gen);
            return;
          }
          if (location.e911_status === 'none' || location.e911_status === 'failed') {
            try {
              await dialstack.validateLocationE911(location.id);
              if (cancelled()) return;
              const provisioned = await dialstack.provisionLocationE911(location.id);
              if (cancelled()) return;
              handleProvisionResult(provisioned, location.id, gen);
              return;
            } catch (retryErr) {
              console.warn('[dialstack] E911 retry provisioning failed:', retryErr);
              if (cancelled()) return;
              dispatch({ type: 'e911_set_state', state: 'failed' });
              return;
            }
          }
          if (cancelled()) return;
          dispatch({ type: 'e911_set_state', state: 'complex' });
          return;
        }

        // Find the pre-selected DID or match by account phone
        let selectedDID = activeDIDs.find((d) => d.id === currentState.selectedPrimaryDIDId);
        if (!selectedDID) {
          const parsed = parsePhoneNumberFromString(contextAccount?.phone ?? '', 'US');
          const e164 = parsed?.number;
          selectedDID = e164 ? activeDIDs.find((d) => d.phone_number === e164) : undefined;
        }
        if (!selectedDID) {
          dispatch({ type: 'e911_set_state', state: 'complex' });
          return;
        }

        await dialstack.updateLocation(location.id, { primary_did_id: selectedDID.id });
        if (cancelled()) return;
        await dialstack.validateLocationE911(location.id);
        if (cancelled()) return;
        const provisioned = await dialstack.provisionLocationE911(location.id);
        if (cancelled()) return;
        handleProvisionResult(provisioned, location.id, gen);
      } catch (err) {
        if (cancelled()) return;
        console.warn('[dialstack] E911 auto-provisioning failed:', err);
        dispatch({ type: 'e911_set_state', state: 'failed' });
      }
    },
    [dialstack, contextLocations, contextAccount, startE911Polling, handleProvisionResult]
  );

  // Initialize per-DID directory listing state from current DID data, then navigate to the substep.
  const initDirectoryListingState = useCallback(
    (s: NumState) => {
      const listingTypes: Record<
        string,
        'listed' | 'non_listed' | 'non_published' | 'non_registered'
      > = {};
      const businessNames: Record<string, string> = {};
      const locationIds: Record<string, string> = {};

      // Find best default location
      const defaultLoc =
        contextLocations.find(
          (loc) => loc.primary_did_id && loc.primary_did_id === s.selectedPrimaryDIDId
        ) ?? contextLocations[0];

      for (const did of s.activeDIDs) {
        // Default to 'listed' for onboarding (opt-out model)
        const currentType = did.directory_listing_type;
        listingTypes[did.id] =
          currentType && currentType !== 'non_registered' ? currentType : 'listed';
        businessNames[did.id] = did.directory_listing_name ?? contextAccount?.name ?? '';
        locationIds[did.id] = did.directory_listing_location_id ?? defaultLoc?.id ?? '';
      }
      dispatch({ type: 'dl_init', listingTypes, businessNames, locationIds });
      dispatch({ type: 'set_substep', subStep: 'directory-listing' });
    },
    [contextLocations, contextAccount]
  );

  // Caller ID bulk submit on "Next"
  const handleCallerIdNext = useCallback(
    async (s: NumState) => {
      const tooLong = t('accountOnboarding.numbers.callerId.validation.tooLong');
      const invalidChars = t('accountOnboarding.numbers.callerId.validation.invalidChars');

      const pending = s.activeDIDs.filter(
        (did) =>
          s.callerIdStatuses[did.id] !== 'submitted' &&
          (s.callerIdInputs[did.id] ?? '').trim() !== ''
      );

      if (pending.length === 0) {
        initDirectoryListingState(s);
        return;
      }

      // Validate first
      let hasError = false;
      const errMap: Record<string, string> = {};
      const statMap: Record<string, 'idle' | 'submitting' | 'submitted' | 'error'> = {};
      for (const did of pending) {
        const err = validateCallerIdName(s.callerIdInputs[did.id] ?? '', tooLong, invalidChars);
        if (err) {
          errMap[did.id] = err;
          statMap[did.id] = 'error';
          hasError = true;
        }
      }

      if (hasError) {
        dispatch({
          type: 'caller_id_batch_update',
          statuses: statMap,
          errors: errMap,
          attempted: true,
        });
        return;
      }

      // Mark submitting
      for (const did of pending) statMap[did.id] = 'submitting';
      dispatch({ type: 'caller_id_batch_update', statuses: statMap, errors: {}, attempted: true });

      // Submit all
      const results = await Promise.all(
        pending.map(async (did) => {
          const res = await submitCallerIdSingle(did.id, s.callerIdInputs[did.id] ?? '', dialstack);
          return { didId: did.id, ...res };
        })
      );

      const finalStatuses: Record<string, 'idle' | 'submitting' | 'submitted' | 'error'> = {};
      const finalErrors: Record<string, string> = {};
      let allOk = true;
      for (const r of results) {
        finalStatuses[r.didId] = r.status;
        if (r.error) finalErrors[r.didId] = r.error;
        if (r.status !== 'submitted') allOk = false;
      }
      dispatch({
        type: 'caller_id_batch_update',
        statuses: finalStatuses,
        errors: finalErrors,
        attempted: true,
      });

      if (allOk && stateRef.current.subStep === 'caller-id') {
        initDirectoryListingState(stateRef.current);
      }
    },
    [t, dialstack, navigateToNext, submitCallerIdSingle, initDirectoryListingState]
  );

  // "Next" from directory listing — submit DL update for each DID, then navigate to complete
  const handleDirectoryListingNext = useCallback(
    async (s: NumState) => {
      // Find DIDs that need updates (not non_registered)
      const toUpdate = s.activeDIDs.filter(
        (did) => (s.dlListingTypes[did.id] ?? 'listed') !== 'non_registered'
      );

      // Validate all
      for (const did of toUpdate) {
        const name = (s.dlBusinessNames[did.id] ?? '').trim();
        if (!name) {
          dispatch({
            type: 'dl_submit_error',
            error: `Business name is required for ${formatPhone(did.phone_number)}`,
          });
          return;
        }
      }

      if (toUpdate.length === 0) {
        await navigateToNext(s);
        return;
      }

      dispatch({ type: 'dl_submit_start' });
      try {
        await Promise.all(
          toUpdate.map((did) =>
            dialstack.updatePhoneNumber(did.id, {
              directory_listing_name: (s.dlBusinessNames[did.id] ?? '').trim(),
              directory_listing_type: s.dlListingTypes[did.id] ?? 'listed',
              ...(s.dlLocationIds[did.id] && {
                directory_listing_location_id: s.dlLocationIds[did.id],
              }),
            })
          )
        );
        dispatch({ type: 'dl_submit_success' });
        await navigateToNext(stateRef.current);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update directory listing';
        dispatch({ type: 'dl_submit_error', error: msg });
      }
    },
    [dialstack, navigateToNext]
  );

  // "Next" from overview
  const handleOverviewNext = useCallback(
    async (s: NumState) => {
      if (s.isLoadingDIDs) return;
      if (s.hasAttemptedDIDLoad) {
        if (s.activeDIDs.length === 0) {
          dispatch({
            type: 'set_gate_error',
            error: t('accountOnboarding.numbers.gate.noDIDsAvailable'),
          });
          return;
        }
        dispatch({ type: 'set_gate_error', error: null });
        dispatch({ type: 'set_substep', subStep: 'primary-did' });
        return;
      }
      const dids = await loadActiveDIDs(contextAccount?.phone ?? '');
      if (dids.length === 0)
        dispatch({
          type: 'set_gate_error',
          error: t('accountOnboarding.numbers.gate.noDIDsAvailable'),
        });
      else {
        dispatch({ type: 'set_gate_error', error: null });
        dispatch({ type: 'set_substep', subStep: 'primary-did' });
      }
    },
    [t, contextAccount, loadActiveDIDs]
  );

  // "Next" on primary-did
  const handlePrimaryDidNext = useCallback(
    (s: NumState) => {
      if (s.selectedPrimaryDIDId === null) {
        dispatch({
          type: 'set_primary_did_error',
          error: t('accountOnboarding.numbers.gate.primaryRequired'),
        });
        return;
      }
      dispatch({ type: 'set_primary_did_error', error: null });
      const inputs: Record<string, string> = {};
      const statuses: Record<string, 'idle' | 'submitted'> = {};
      for (const did of s.activeDIDs) {
        inputs[did.id] = did.caller_id_name ?? '';
        statuses[did.id] = did.caller_id_name ? 'submitted' : 'idle';
      }
      dispatch({ type: 'caller_id_init', inputs, statuses });
      dispatch({ type: 'set_substep', subStep: 'caller-id' });
    },
    [t]
  );

  // ============================================================================
  // Sidebar
  // ============================================================================

  const sidebarActiveKey = getSidebarActiveKey(state.subStep);
  const sidebarSubSteps = useMemo(
    () => [
      {
        key: 'options',
        label: t('accountOnboarding.sidebar.numberOptions'),
        description: t('accountOnboarding.sidebar.numberOptionsDesc'),
      },
      {
        key: 'setup',
        label: t('accountOnboarding.sidebar.numberSetup'),
        description: t('accountOnboarding.sidebar.numberSetupDesc'),
      },
      {
        key: 'verification',
        label: t('accountOnboarding.sidebar.verification'),
        description: t('accountOnboarding.sidebar.verificationDesc'),
      },
      {
        key: 'primary-did',
        label: t('accountOnboarding.sidebar.primaryNumber'),
        description: t('accountOnboarding.sidebar.primaryNumberDesc'),
      },
      {
        key: 'caller-id',
        label: t('accountOnboarding.sidebar.callerId'),
        description: t('accountOnboarding.sidebar.callerIdDesc'),
      },
      {
        key: 'directory-listing',
        label: t('accountOnboarding.sidebar.directoryListing'),
        description: t('accountOnboarding.sidebar.directoryListingDesc'),
      },
    ],
    [t]
  );

  // SAFETY: PHONE_SVG is a static constant from icons.ts, not user input
  const sidebar = useMemo(() => {
    const activeIdx = sidebarSubSteps.findIndex((s) => s.key === sidebarActiveKey);

    return (
      <aside className="step-sidebar" aria-label={t('accountOnboarding.steps.numbers')}>
        <div className="step-sidebar-header">
          {/* SAFETY: PHONE_SVG is a static SVG constant */}
          <div className="step-sidebar-icon" dangerouslySetInnerHTML={{ __html: PHONE_SVG }} />
          <span className="step-sidebar-title">{t('accountOnboarding.steps.numbers')}</span>
        </div>
        <div className="step-timeline">
          {sidebarSubSteps.map((s, i) => {
            const status = i < activeIdx ? 'completed' : i === activeIdx ? 'active' : '';
            return (
              <div key={s.key} className={`step-timeline-item ${status}`}>
                <div className="step-timeline-dot">{i < activeIdx && <CheckIcon />}</div>
                <div className="step-timeline-text">
                  <span className="step-timeline-label">{s.label}</span>
                  {s.description && <span className="step-timeline-desc">{s.description}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    );
  }, [sidebarActiveKey, sidebarSubSteps, t]);

  // ============================================================================
  // Footer for overview / primary-did / caller-id
  // (Must be computed before early return to preserve hook call order)
  // ============================================================================

  const showOuterHeader =
    state.subStep === 'overview' ||
    state.subStep === 'primary-did' ||
    state.subStep === 'caller-id' ||
    state.subStep === 'directory-listing';

  const footer = useMemo(() => {
    if (state.subStep === 'overview') {
      return (
        <div className={`footer-bar${handleBackToPrevStep ? '' : ' footer-bar-end'}`}>
          {handleBackToPrevStep && (
            <button className="btn-ghost" onClick={handleBackToPrevStep}>
              ← {t('accountOnboarding.nav.back')}
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => void handleOverviewNext(stateRef.current)}
          >
            {t('accountOnboarding.nav.next')} →
          </button>
        </div>
      );
    } else if (state.subStep === 'primary-did') {
      return (
        <div className="footer-bar">
          <button
            className="btn-ghost"
            onClick={() => dispatch({ type: 'set_substep', subStep: 'overview' })}
          >
            ← {t('accountOnboarding.nav.back')}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => handlePrimaryDidNext(stateRef.current)}
          >
            {t('accountOnboarding.nav.next')} →
          </button>
        </div>
      );
    } else if (state.subStep === 'caller-id') {
      const hasErrors =
        state.callerIdBulkAttempted &&
        state.activeDIDs.some((d) => state.callerIdStatuses[d.id] === 'error');
      return (
        <div className="footer-bar">
          <button
            className="btn-ghost"
            onClick={() => dispatch({ type: 'set_substep', subStep: 'primary-did' })}
          >
            ← {t('accountOnboarding.nav.back')}
          </button>
          <div className="footer-bar-actions">
            {hasErrors && (
              <button
                className="btn btn-warning"
                onClick={() => void navigateToNext(stateRef.current)}
              >
                {t('accountOnboarding.numbers.callerId.skipCallerId')}
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={() => void handleCallerIdNext(stateRef.current)}
            >
              {t('accountOnboarding.nav.next')} →
            </button>
          </div>
        </div>
      );
    } else if (state.subStep === 'directory-listing') {
      return (
        <div className="footer-bar">
          <button
            className="btn-ghost"
            onClick={() => dispatch({ type: 'set_substep', subStep: 'caller-id' })}
          >
            ← {t('accountOnboarding.nav.back')}
          </button>
          <button
            className="btn btn-primary"
            disabled={state.dlIsSubmitting}
            onClick={() => void handleDirectoryListingNext(stateRef.current)}
          >
            {state.dlIsSubmitting
              ? t('accountOnboarding.nav.submitting')
              : t('accountOnboarding.nav.next') + ' →'}
          </button>
        </div>
      );
    }
    return null;
  }, [
    state.subStep,
    state.callerIdBulkAttempted,
    state.activeDIDs,
    state.callerIdStatuses,
    state.dlIsSubmitting,
    t,
    handleBackToPrevStep,
    handleOverviewNext,
    handlePrimaryDidNext,
    handleCallerIdNext,
    handleDirectoryListingNext,
    navigateToNext,
  ]);

  // ============================================================================
  // Complete state
  // ============================================================================

  if (state.isComplete) {
    const stepLabel = t('accountOnboarding.steps.numbers');
    const handleDone = () => {
      progressStore.setCurrentStep(findNextIncompleteStep(activeSteps, progressStore, 'numbers'));
    };

    let e911Panel: React.ReactNode = null;
    if (state.e911FlowState === 'running') {
      const statusMsg =
        state.e911PollCount > 0
          ? t('accountOnboarding.complete.e911.pollingStatus')
          : t('accountOnboarding.complete.e911.loading');
      e911Panel = (
        <div className="e911-panel">
          <div className="center-state" role="status" aria-live="polite">
            <div className="spinner" aria-hidden="true" />
            <div className="center-title">{statusMsg}</div>
          </div>
        </div>
      );
    } else if (state.e911FlowState === 'simple') {
      const e911Status = state.e911ProvisionedLocation?.e911_status;
      let msg: React.ReactNode;
      if (e911Status === 'provisioned') {
        msg = (
          <div className="center-title">
            {/* SAFETY: CHECK_CIRCLE_SVG is a static SVG constant */}
            <span dangerouslySetInnerHTML={{ __html: CHECK_CIRCLE_SVG }} />{' '}
            {t('accountOnboarding.complete.e911.verified')}
          </div>
        );
      } else if (e911Status === 'pending' || e911Status === 'binding') {
        msg = (
          <div className="center-title">
            {state.e911PollCount >= E911_POLL_MAX
              ? t('accountOnboarding.complete.e911.pendingAfterPolling')
              : t('accountOnboarding.complete.e911.processing')}
          </div>
        );
      } else {
        msg = null;
      }
      if (msg) {
        e911Panel = (
          <div className="e911-panel">
            <div className="center-state">{msg}</div>
          </div>
        );
      }
    } else if (state.e911FlowState === 'failed') {
      e911Panel = (
        <div className="e911-panel">
          <div className="center-state">
            {/* SAFETY: ERROR_SVG is a static SVG constant */}
            <div className="center-icon error" dangerouslySetInnerHTML={{ __html: ERROR_SVG }} />
            <div className="center-title">{t('accountOnboarding.complete.e911.errorTitle')}</div>
            <div className="center-detail">
              {t('accountOnboarding.complete.e911.errorDescription')}
            </div>
            <div className="center-btn">
              <button className="btn btn-primary" onClick={() => navigateToNext(stateRef.current)}>
                {t('accountOnboarding.complete.e911.retryButton')}
              </button>
            </div>
          </div>
        </div>
      );
    } else if (state.e911FlowState === 'complex') {
      e911Panel = (
        <div className="e911-panel">
          <div className="inline-alert warning">
            {t('accountOnboarding.complete.e911.deferred')}
          </div>
        </div>
      );
    }

    return (
      <OnboardingLayout sidebar={sidebar} extraStylesheets={NUMBERS_EXTRA_STYLESHEETS}>
        <div className="card">
          <div className="placeholder" style={{ minHeight: 200 }}>
            {/* SAFETY: CHECK_SVG_WHITE is a static SVG constant */}
            <div
              className="complete-icon-circle"
              dangerouslySetInnerHTML={{ __html: CHECK_SVG_WHITE }}
            />
            <h2 className="section-title">
              {t('accountOnboarding.stepComplete.title', { stepName: stepLabel })}
            </h2>
            <button
              className="btn btn-primary"
              style={{ marginTop: 'var(--ds-layout-spacing-lg)' }}
              onClick={handleDone}
            >
              {t('accountOnboarding.stepComplete.done')}
            </button>
          </div>
          {e911Panel}
        </div>
      </OnboardingLayout>
    );
  }

  // ============================================================================
  // Sub-step content
  // ============================================================================

  // Card mode: persistent PhoneCardStrip stays mounted across these 3 sub-steps
  const cardMode: CardMode | null =
    state.subStep === 'overview'
      ? 'overview'
      : state.subStep === 'primary-did'
        ? 'primary-did'
        : state.subStep === 'caller-id'
          ? 'caller-id'
          : state.subStep === 'directory-listing'
            ? 'directory-listing'
            : null;

  let content: React.ReactNode;
  switch (state.subStep) {
    case 'overview':
      content = (
        <OverviewContent state={state} t={t} dispatch={dispatch} loadNumbers={loadNumbers} />
      );
      break;
    case 'primary-did':
      content = <PrimaryDIDContent state={state} t={t} />;
      break;
    case 'caller-id':
      content = <CallerIdContent state={state} t={t} />;
      break;
    case 'directory-listing':
      content = <DirectoryListingContent state={state} t={t} />;
      break;
    case 'order-search':
      content = (
        <OrderSearchContent
          state={state}
          t={t}
          dispatch={dispatch}
          onSearch={() => void searchNumbers(state)}
        />
      );
      break;
    case 'order-results':
      content = <OrderResultsContent state={state} t={t} dispatch={dispatch} />;
      break;
    case 'order-confirm':
      content = (
        <OrderConfirmContent
          state={state}
          t={t}
          dispatch={dispatch}
          onPlaceOrder={() => void placeOrder(state.orderSelectedNumbers)}
        />
      );
      break;
    case 'order-status':
      content = (
        <OrderStatusContent
          state={state}
          t={t}
          dispatch={dispatch}
          accountPhone={contextAccount?.phone ?? ''}
          loadActiveDIDs={loadActiveDIDs}
          loadNumbers={loadNumbers}
        />
      );
      break;
    case 'port-numbers':
      content = (
        <PortNumbersContent
          state={state}
          t={t}
          dispatch={dispatch}
          onCheck={() => void checkPortEligibility(state)}
        />
      );
      break;
    case 'port-eligibility':
      content = <PortEligibilityContent state={state} t={t} dispatch={dispatch} />;
      break;
    case 'port-carrier-select':
      content = <PortCarrierSelectContent state={state} t={t} dispatch={dispatch} />;
      break;
    case 'port-subscriber':
      content = (
        <PortSubscriberContent
          state={state}
          t={t}
          dispatch={dispatch}
          onNext={() => {
            if (validateSubscriber(state))
              dispatch({ type: 'set_substep', subStep: 'port-foc-date' });
          }}
        />
      );
      break;
    case 'port-foc-date':
      content = (
        <PortFocDateContent
          state={state}
          t={t}
          dispatch={dispatch}
          onNext={() => {
            if (validateFocDate(state))
              dispatch({ type: 'set_substep', subStep: 'port-documents' });
          }}
        />
      );
      break;
    case 'port-documents':
      content = <PortDocumentsContent state={state} t={t} dispatch={dispatch} />;
      break;
    case 'port-review':
      content = (
        <PortReviewContent
          state={state}
          t={t}
          dispatch={dispatch}
          onSubmit={() => void submitPort(state)}
        />
      );
      break;
    case 'port-submitted':
      content = (
        <PortSubmittedContent state={state} t={t} dispatch={dispatch} loadNumbers={loadNumbers} />
      );
      break;
    default:
      content = null;
  }

  return (
    <OnboardingLayout sidebar={sidebar} extraStylesheets={NUMBERS_EXTRA_STYLESHEETS}>
      <div className="card">
        {showOuterHeader && (
          <>
            <h2 className="section-title">{t('accountOnboarding.numbers.title')}</h2>
            <p className="section-subtitle">{t('accountOnboarding.numbers.subtitle')}</p>
          </>
        )}
        {content}
        {cardMode && <PhoneCardStrip mode={cardMode} state={state} t={t} dispatch={dispatch} />}
      </div>
      {footer}
    </OnboardingLayout>
  );
};
