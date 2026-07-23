/**
 * Pure, platform-agnostic view-model helpers shared by the web and React Native
 * softphones. No React, no DOM, no React Native — just functions over the headless
 * core's `Call` shape, so both UIs format and route identically and the logic is
 * unit-testable in isolation.
 */

import { parsePhoneNumber, type CountryCode, type PhoneNumber } from 'libphonenumber-js';
import type { Call, CallState } from '../../../webrtc';
import type { Locale } from '../../../locales';

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
 * Whether the softphone should be playing the incoming-call ring right now. Both
 * the web and RN providers drive their ringtone off this one predicate so the
 * "are we ringing?" rule has a single home and can't drift between platforms.
 *
 * Accepts either the single foreground call (back-compat) or the full call list:
 * ring while ANY inbound call is still alerting — a call-waiting interrupt during
 * an active call rings just like an idle inbound one.
 */
export function shouldRingIncoming(calls: Call | Call[] | null): boolean {
  if (!calls) return false;
  if (Array.isArray(calls)) return calls.some(isIncomingRinging);
  return isIncomingRinging(calls);
}

/** A call that has been answered (active or held) — controls/duration apply.
 *  Delegates to `Call.isConnected`, the single source of truth for the rule. */
export function isCallActive(call: Call): boolean {
  return call.isConnected;
}

/**
 * Whether the dial pad may place an outbound call right now. The single home for
 * the rule so web and RN can't drift: the socket must be connected and there must
 * be a destination. It also blocks while an E911 binding is in progress
 * (`emergencySubmitting`) — submitting an address (confirm/create) forces a reconnect,
 * which tears down the socket and any live call, so starting a call in that
 * window would immediately lose it. This applies to EVERY destination (911,
 * extensions, PSTN) because the reconnect drops them all, not just PSTN.
 */
export function canPlaceCall(
  connection: string,
  destination: string,
  emergencySubmitting: boolean
): boolean {
  return connection === 'connected' && destination.length > 0 && !emergencySubmitting;
}

/** Pick the screen for the current foreground call (null → the dial pad). */
export function selectScreen(call: Call | null): SoftphoneScreen {
  if (!call) return 'dial';
  return isIncomingRinging(call) ? 'incoming' : 'in-call';
}

/**
 * The composite multi-call layout the softphone renders: a single base screen
 * with any ringing inbound calls layered on top. This is `selectScreen` widened
 * to the full call list — it's what lets a call-waiting interrupt show as a card
 * *over* the in-call UI, and multiple idle inbound calls stack together.
 *
 * - `base` — the screen underneath: `in-call` whenever there's an answered call
 *   (active OR held), otherwise `dial`. Note the base ignores ringing calls: an
 *   inbound call while idle leaves the dial pad as the base with the incoming
 *   card on top; once answered it becomes the in-call base.
 * - `incoming` — the ringing inbound calls to render as answer/decline cards,
 *   layered over `base`.
 * - `overlay` — whether the incoming cards sit *on top of* the base (there's an
 *   answered call behind them → the non-intrusive call-waiting presentation) vs.
 *   being the only thing on an idle dial base.
 * - `compact` — render the incoming cards smaller/stacked (they're an overlay,
 *   or there's more than one — either way they should take less space than the
 *   single full-screen incoming design).
 */
export interface SoftphoneLayout {
  base: 'dial' | 'in-call';
  incoming: Call[];
  overlay: boolean;
  compact: boolean;
}

export function selectLayout(calls: Call[], activeCall: Call | null = null): SoftphoneLayout {
  // A just-answered call flips to the foreground (active) before its `state`
  // leaves 'ringing' (the server echo lags), so exclude the active call from the
  // incoming set — otherwise it renders as BOTH the in-call panel and an incoming
  // card during that window. It also counts as "answered" for the base so a lone
  // just-answered call shows the in-call screen (no dial-pad flash).
  const incoming = calls.filter((c) => c !== activeCall && isIncomingRinging(c));
  const hasAnswered = calls.some((c) => c === activeCall || !isIncomingRinging(c));
  return {
    base: hasAnswered ? 'in-call' : 'dial',
    incoming,
    overlay: hasAnswered && incoming.length > 0,
    compact: hasAnswered ? incoming.length > 0 : incoming.length > 1,
  };
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
 * The error surfaced when a dial/transfer destination cleans to nothing. Single
 * source of truth so `placeCall`, `transfer`, and any future dial site emit the
 * exact same `code`/`message` instead of hand-copying the string.
 */
export const INVALID_DESTINATION_ERROR = {
  code: 'invalid_message',
  message: 'Enter a valid phone number, extension, or feature code',
} as const;

/**
 * Sanitize a dial/transfer destination and, when it cleans to empty, route the
 * shared `INVALID_DESTINATION_ERROR` to `onError`. Returns the cleaned target, or
 * `''` when there's nothing valid to dial (caller should bail).
 *
 * `silentWhenEmpty` (default false) suppresses the error for a blank/whitespace
 * input — used where the UI already gates on non-empty (the transfer field), so
 * only genuinely-invalid *content* reports, not an empty box.
 */
export function sanitizeOrEmitInvalid(
  destination: string,
  onError: ((e: { code: string; message: string }) => void) | undefined,
  { silentWhenEmpty = false }: { silentWhenEmpty?: boolean } = {}
): string {
  const target = sanitizeDestination(destination, DIAL_COUNTRY);
  if (!target) {
    if (!(silentWhenEmpty && !destination.trim())) {
      onError?.({ ...INVALID_DESTINATION_ERROR });
    }
    return '';
  }
  return target;
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
// Connection/session-class error codes — failures of the socket or session, not
// of a call attempt. These must map to `connectionError` ("Connection error"),
// not `callError` ("Call failed"), which would otherwise mislabel e.g. a token
// refresh that fails while the user is idle as a failed call.
const CONNECTION_ERROR_CODES = new Set([
  'auth_failed',
  'auth_expired',
  'session_limit',
  'session_revoked',
  'going_away',
  'idle_timeout',
  'slow_consumer',
  'transport_closed',
  'ice_fetch_failed',
]);

export function errorMessageKey(code: string): keyof Locale['softphone'] {
  if (code === 'mic_permission_denied') return 'micPermissionError';
  if (CONNECTION_ERROR_CODES.has(code)) return 'connectionError';
  return 'callError';
}
