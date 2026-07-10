/**
 * Pure, platform-agnostic view-model helpers shared by the web and React Native
 * softphones. No React, no DOM, no React Native — just functions over the headless
 * core's `Call` shape, so both UIs format and route identically and the logic is
 * unit-testable in isolation.
 */

import { parsePhoneNumber, type CountryCode, type PhoneNumber } from 'libphonenumber-js';
import type { Call, CallState } from '../webrtc';
import type { Locale } from '../locales';

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

/**
 * Whether the softphone should be playing the incoming-call ring right now, given
 * the current active call (null → nothing ringing). Both the web and RN providers
 * drive their ringtone off this one predicate so the "are we ringing?" rule has a
 * single home and can't drift between platforms. Today that's simply "the active
 * call is an inbound call still alerting"; when call-waiting lands (a second inbound
 * as a non-active entry) this is the one place to widen to the full call list.
 */
export function shouldRingIncoming(activeCall: Call | null): boolean {
  return !!activeCall && isIncomingRinging(activeCall);
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

// The characters a destination may contain when it reaches the signaling server:
// digits, +, * and #, plus DTMF letters A–D. Everything else (spaces, parens,
// dashes, dots from a formatted/pasted number) is a display separator and is
// stripped. Kept in sync with the server's dial-string allowlist.
const DESTINATION_ALLOWED = /[^+*#0-9A-Da-d]/g;
const MAX_DESTINATION_LENGTH = 32;

/**
 * The country used to canonicalize a national dial string to E.164. Softphone
 * calling is US-only today; this is the single, deliberately-fixed seam for that.
 * It is intentionally NOT wired to the public `formatting.defaultCountry` (which
 * governs display only) — dialing under a different country than the number was
 * entered in produces wrong/undialable destinations. When calling goes
 * multi-region, thread a real country through `sanitizeDestination` from here.
 */
export const DIAL_COUNTRY: CountryCode = 'US';

/**
 * Strip display separators (spaces, parens, dashes, dots) and cap length,
 * keeping only what the server accepts: digits, +, * and #, DTMF A–D. Does NOT
 * canonicalize to E.164 — use it per-keystroke so typing stays natural, and the
 * result is always within the server allowlist (or empty).
 */
export function stripToDialString(value: string): string {
  return value.replace(DESTINATION_ALLOWED, '').slice(0, MAX_DESTINATION_LENGTH).toUpperCase();
}

/**
 * Normalize a user-entered/pasted dial string into what the softphone actually
 * sends: strip display separators (so `(581) 319-5082` → `15813195082`), and —
 * when the result is a valid PSTN number — canonicalize it to E.164 (`+1…`).
 * Extensions (`1001`), star/# feature codes (`*72`), and DTMF (`A`–`D`) are NOT
 * phone numbers, so they're left as their stripped digits/symbols. The result
 * always fits the server's allowlist, so callers "send something clean".
 *
 * Idempotent and safe on partial input — use it on paste and as the last step
 * before dialing (per-keystroke, prefer `stripToDialString` so E.164 conversion
 * doesn't rewrite the field mid-type).
 */
export function sanitizeDestination(value: string, defaultCountry: CountryCode = 'US'): string {
  const stripped = stripToDialString(value);
  if (!stripped) return '';
  // Only attempt E.164 for things that look like a plain phone number — never a
  // feature code (contains * or #) or a DTMF-letter string, which parsePhoneNumber
  // would mangle or reject.
  if (!/[*#]/.test(stripped) && /^\+?[0-9]+$/.test(stripped)) {
    try {
      const parsed = parsePhoneNumber(stripped, defaultCountry);
      if (parsed?.isValid()) return parsed.number; // E.164, e.g. +15813195082
    } catch {
      // Not a parseable number (extension, partial) — keep the stripped value.
    }
  }
  return stripped;
}

/**
 * Map a call state to a stable, locale-agnostic label key. The UIs resolve the
 * key to a localized string (web via the component locale table, RN via its own
 * map) — sharing the key→state mapping keeps the two from drifting on which
 * state shows which label, without forcing a shared i18n table.
 */
export function callStateLabelKey(state: CallState): keyof Locale['softphone'] {
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

/**
 * Map an error `code` to a stable, locale-agnostic message key for the built-in
 * error banner. Most failures collapse to a single generic key (we deliberately
 * don't leak raw server text to the user); the exception is a denied microphone
 * permission, which is user-remediable and gets its own actionable message.
 * Resolved to display text by the UIs (web via the locale table, RN via its map),
 * same pattern as callStateLabelKey.
 */
export function errorMessageKey(code: string): keyof Locale['softphone'] {
  return code === 'mic_permission_denied' ? 'micPermissionError' : 'callError';
}
