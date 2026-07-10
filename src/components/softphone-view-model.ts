/**
 * Pure, platform-agnostic view-model helpers shared by the web and React Native
 * softphones. No React, no DOM, no React Native — just functions over the headless
 * core's `Call` shape, so both UIs format and route identically and the logic is
 * unit-testable in isolation.
 */

import { parsePhoneNumber, type CountryCode, type PhoneNumber } from 'libphonenumber-js';
import type { Call, CallState } from '../webrtc';

/** Which screen the softphone should present for the current foreground call. */
export type SoftphoneScreen = 'dial' | 'incoming' | 'in-call';

/**
 * An inbound call still alerting (the user hasn't answered). `trying` is
 * included because an inbound call is briefly in `trying` before the first
 * `call.ringing` arrives, and it must show the incoming screen throughout.
 */
export function isIncomingRinging(call: Call): boolean {
  return call.direction === 'inbound' && (call.state === 'ringing' || call.state === 'trying');
}

/** A call that has been answered (active or held) — controls/duration apply. */
export function isCallActive(call: Call): boolean {
  return call.state === 'active' || call.state === 'held';
}

/** Pick the screen for the current foreground call (null → the dial pad). */
export function selectScreen(call: Call | null): SoftphoneScreen {
  if (!call) return 'dial';
  return isIncomingRinging(call) ? 'incoming' : 'in-call';
}

/** The remote party's raw number/address for a call, by direction. */
export function callPeerNumber(call: Call): string {
  return call.direction === 'inbound' ? call.from : call.to;
}

/** The remote party's display name, when the server supplied one (inbound only). */
export function callPeerName(call: Call): string | null {
  return call.direction === 'inbound' ? call.fromName : null;
}

/**
 * `m:ss` elapsed-time formatting for the in-call duration readout. Negative or
 * fractional input is clamped/floored to a whole non-negative second count
 * (`Call.duration` is always ≥0, but this is a public helper).
 */
export function formatCallDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Pretty-print an E.164 / national number for display, leaving extensions and
 * partial input untouched. Mirrors the formatting used across the SDK
 * components. `defaultCountry` defaults to `US` (matching the softphone UIs).
 */
export function formatDisplayNumber(value: string, defaultCountry: CountryCode = 'US'): string {
  if (!value) return '';
  try {
    const parsed: PhoneNumber | undefined = parsePhoneNumber(value, defaultCountry);
    if (parsed) {
      // Match formatPhoneForDisplay (react/dial-plan): national form only for
      // NANP numbers; international elsewhere, so a non-NANP number isn't
      // rendered ambiguously in national format.
      const isNanp = parsed.country === 'US' || parsed.countryCallingCode === '1';
      return isNanp ? parsed.formatNational() : parsed.formatInternational();
    }
  } catch {
    // Fall through to the raw value (extension, partial input, etc.).
  }
  return value;
}

/**
 * Map a call state to a stable, locale-agnostic label key. The UIs resolve the
 * key to a localized string (web via the component locale table, RN via its own
 * map) — sharing the key→state mapping keeps the two from drifting on which
 * state shows which label, without forcing a shared i18n table.
 */
export function callStateLabelKey(state: CallState): string {
  switch (state) {
    case 'trying':
      return 'stateTrying';
    case 'ringing':
      return 'stateRinging';
    case 'active':
      return 'stateActive';
    case 'held':
      return 'stateHeld';
    default:
      return 'stateEnded';
  }
}
