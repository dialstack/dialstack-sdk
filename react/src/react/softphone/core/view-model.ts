/**
 * Pure, platform-agnostic view-model helpers shared by the web and React Native
 * softphones. No React, no DOM, no React Native — just functions over the headless
 * core's `Call` shape, so both UIs format and route identically and the logic is
 * unit-testable in isolation.
 */

import { parsePhoneNumber, type CountryCode, type PhoneNumber } from 'libphonenumber-js';
import type { Call, CallState, DirectoryEntry, PresenceStatus } from '@dialstack/sdk-webrtc';
import type { Locale } from '@dialstack/sdk-js';

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

/**
 * A tapped directory entry where calling is the only thing to do with it (the
 * dial pad, Add call): it is picked, and called at once when a call can be
 * placed. When one can't yet, the pick is left filling the number for Call.
 */
export function callOrPick(
  entry: DirectoryContact,
  options: {
    connection: string;
    emergencySubmitting: boolean;
    /** False when the screen can't take another call, e.g. at the call limit. */
    allowed?: boolean;
    placeCall: (destination: string) => Promise<void>;
    pick: (entry: DirectoryContact) => void;
    /** After the call is placed, e.g. to clear and close the panel. */
    onCalled?: () => void;
  }
): void {
  const { allowed = true, placeCall, pick, onCalled } = options;
  pick(entry);
  if (!allowed || !canPlaceCall(options.connection, entry.destination, options.emergencySubmitting))
    return;
  void placeCall(entry.destination);
  onCalled?.();
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

/**
 * How a call's remote party reads on screen. `name` is the title: the host's
 * `PeerInfo.name`, else the caller-id name, else the formatted number. `number`
 * is shown under it only when the title isn't already the number. `avatar` is
 * the host's, drawn above the title where the screen has room.
 */
export interface PeerDisplay {
  name: string;
  number: string | null;
  avatar?: { initials?: string; uri?: string };
}

export function peerDisplay(
  call: Call,
  info: {
    name?: string;
    avatar?: PeerDisplay['avatar'];
  } | null,
  displayNumber: (value: string) => string,
  unknownLabel: string
): PeerDisplay {
  const number = displayNumber(callPeerNumber(call));
  const name = info?.name || callPeerName(call) || number || unknownLabel;
  return {
    name,
    number: name !== number && number ? number : null,
    avatar: info?.avatar,
  };
}

/**
 * The softphone's size tier. `'auto'` (the default) follows the host's size:
 * compact below about 300x480, full otherwise. `'full'` and `'compact'` pin
 * one, whatever the host.
 */
export type SoftphoneLayoutVariant = 'auto' | 'full' | 'compact';

/** Below this host size (width or height) the softphone uses its compact tier. */
export const HOST_MIN_WIDTH = 300;
export const HOST_MIN_HEIGHT = 480;

/** Whether the full-size tier applies, given the variant and the measured host. */
export function isRoomyLayout(
  variant: SoftphoneLayoutVariant | undefined,
  hostIsRoomy: boolean
): boolean {
  if (variant === 'compact') return false;
  if (variant === 'full') return true;
  return hostIsRoomy;
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
  'token_refresh_failed',
]);

export function errorMessageKey(code: string): keyof Locale['softphone'] {
  if (code === 'mic_permission_denied') return 'micPermissionError';
  if (CONNECTION_ERROR_CODES.has(code)) return 'connectionError';
  return 'callError';
}

/**
 * One entry of the host's directory, offered when transferring or adding a
 * call in place of typing the destination from memory.
 */
export interface DirectoryContact {
  /**
   * Unique within the directory and stable across renders: the picked entry
   * is matched on it, so a host may rebuild or refetch the array freely.
   */
  id: string;
  /** The entry's name in the list. */
  label: string;
  /**
   * What to dial: anything the number field accepts (a phone number, an
   * extension or a feature code). Picking the entry uses it, cleaned the
   * same way as a paste.
   */
  destination: string;
  /** A second, smaller line under the label. Defaults to the destination. */
  description?: string;
  /**
   * The heading the entry is listed under. Entries sharing a group are shown
   * together, groups in order of first appearance; entries without one come
   * first, under no heading.
   */
  group?: string;
  /**
   * Short labels shown as chips beside the name (a role, a language, "On
   * call"), and matched by the search like the other fields.
   */
  tags?: readonly string[];
  /**
   * The entry's live availability, drawn as a status dot with its label beside
   * the destination, and matched by the search like a tag. Leave it unset for
   * entries that have no presence (a department, an outside number).
   */
  presence?: PresenceStatus;
}

/** An entry's tags as chips: trimmed, blanks dropped. */
export function directoryContactTags(entry: DirectoryContact): string[] {
  return (entry.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
}

/** A run of picker entries under one heading (`undefined`: no heading). */
export interface DirectoryContactGroup {
  group: string | undefined;
  destinations: DirectoryContact[];
}

/**
 * The picker's entries matching `query`, grouped for display. Matches a
 * case-insensitive substring of the label, description, group, destination or
 * a tag, a number-like query against the destination's digits, and the whole
 * status label when the picker supplies one; a blank query matches everything.
 */
export function filterDirectory(
  destinations: readonly DirectoryContact[],
  query: string,
  presenceLabel?: (presence: PresenceStatus) => string
): DirectoryContactGroup[] {
  const needle = query.trim().toLowerCase();
  // A query typed the way a number is read ("415-555", "(415) 555") is also
  // compared digit for digit, so the punctuation doesn't have to match.
  const digits = /^[\d\s()+.-]+$/.test(needle) ? needle.replace(/\D/g, '') : '';
  const matches = (d: DirectoryContact) =>
    !needle ||
    [d.label, d.description, d.group, d.destination, ...(d.tags ?? [])].some(
      (field) => typeof field === 'string' && field.toLowerCase().includes(needle)
    ) ||
    // A status only as a whole word: as a substring, "Ava" or "on" would list
    // everyone Available or On a call.
    (!!d.presence && presenceLabel?.(d.presence).toLowerCase() === needle) ||
    (digits.length >= 2 && d.destination.replace(/\D/g, '').includes(digits));
  const ungrouped: DirectoryContact[] = [];
  const grouped = new Map<string, DirectoryContact[]>();
  for (const d of destinations) {
    if (!matches(d)) continue;
    const group = d.group?.trim();
    if (!group) {
      ungrouped.push(d);
      continue;
    }
    let bucket = grouped.get(group);
    if (!bucket) grouped.set(group, (bucket = []));
    bucket.push(d);
  }
  const out: DirectoryContactGroup[] = [];
  if (ungrouped.length) out.push({ group: undefined, destinations: ungrouped });
  for (const [group, list] of grouped) out.push({ group, destinations: list });
  return out;
}

/**
 * A picked contact with its presence as the directory has it now, so the status
 * keeps moving after the pick. Only presence: the rest stays as picked, so the
 * card shows the number a transfer will send even if the host changes it.
 */
export function currentContact(
  directory: readonly DirectoryContact[],
  picked: DirectoryContact | null
): DirectoryContact | null {
  if (!picked) return null;
  const now = directory.find((d) => d.id === picked.id);
  if (!now || now.presence === picked.presence) return picked;
  return { ...picked, presence: now.presence };
}

/** Typed characters before partial matches start, so one key doesn't offer most of the directory. */
const DIAL_MATCH_MIN = 2;

/**
 * The entries offered while a number is being typed on the dial pad, in
 * directory order. Matches on the number only: what a keypad types is digits,
 * so a name can't be what the user is after. Below DIAL_MATCH_MIN characters
 * only a whole number matches (an operator on "0").
 */
export function matchDirectoryByNumber(
  directory: readonly DirectoryContact[],
  typed: string
): DirectoryContact[] {
  const needle = typed.trim();
  if (!needle) return [];
  if (needle.length < DIAL_MATCH_MIN) return directory.filter((d) => d.destination === needle);
  const digits = needle.replace(/\D/g, '');
  return directory.filter(
    (d) =>
      d.destination.includes(needle) ||
      (digits.length > 0 && d.destination.replace(/\D/g, '').includes(digits))
  );
}

/**
 * A contact's line under its name: the number (or its description, unless
 * `inline`, where the number is the point) and its status.
 */
export function contactDetail(
  entry: DirectoryContact,
  inline: boolean,
  t: (key: keyof Locale['softphone']) => string
): string {
  const lead = inline ? entry.destination : entry.description || entry.destination;
  return entry.presence ? `${lead} · ${t(presenceLabelKey(entry.presence))}` : lead;
}

/** Locale key for a presence state, resolved by each UI like `callStateLabelKey`. */
export function presenceLabelKey(presence: PresenceStatus): keyof Locale['softphone'] {
  switch (presence) {
    case 'available':
      return 'presenceAvailable';
    case 'on_call':
      return 'presenceOnCall';
    case 'dnd':
      return 'presenceDoNotDisturb';
    case 'away':
      return 'presenceAway';
    default:
      return 'presenceOffline';
  }
}

/**
 * The theme colour of a presence badge. On a call is amber, not red: red is
 * kept for Do Not Disturb, the one state that means "don't send calls here".
 * Offline is drawn hollow, so it doesn't read as one more colour to decode.
 */
export type PresenceTone = 'success' | 'warning' | 'danger' | 'muted';

export function presenceTone(presence: PresenceStatus): PresenceTone {
  switch (presence) {
    case 'available':
      return 'success';
    case 'on_call':
      return 'warning';
    case 'dnd':
      return 'danger';
    default:
      return 'muted';
  }
}

/**
 * The one state to show for a user, folding the separate Do Not Disturb flag
 * into `status`. Offline wins, since a DND badge on a user with no registered
 * device implies a reachability that isn't there; below that DND wins, being
 * the strongest "don't send this call here" signal.
 */
export function effectivePresence(status: PresenceStatus, doNotDisturb: boolean): PresenceStatus {
  return doNotDisturb && status !== 'offline' ? 'dnd' : status;
}

/**
 * The account directory as picker entries: one per user who has an
 * extension, dialled on their first one. Users without an extension have
 * nothing to transfer to, so they are left out.
 */
export function accountDirectoryContacts(
  entries: readonly DirectoryEntry[],
  presence: Readonly<Record<string, PresenceStatus>>
): DirectoryContact[] {
  const out: DirectoryContact[] = [];
  for (const e of entries) {
    const destination = e.extensionNumbers[0];
    if (!destination) continue;
    const contact: DirectoryContact = {
      id: e.user,
      label: e.displayName || destination,
      destination,
    };
    const status = presence[e.user];
    if (status) contact.presence = status;
    out.push(contact);
  }
  return out;
}

/**
 * The picker's list when the account directory is on: users first, then
 * the host's entries. A host entry whose `id` is a user's id takes
 * that user's place, so a host can relabel, group or tag them; it keeps
 * the live presence unless it sets its own.
 */
export function mergeDirectories(
  account: readonly DirectoryContact[],
  host: readonly DirectoryContact[]
): readonly DirectoryContact[] {
  if (account.length === 0) return host;
  if (host.length === 0) return account;
  const overrides = new Map(host.map((h) => [h.id, h]));
  const merged = account.map((a) => {
    const h = overrides.get(a.id);
    if (!h) return a;
    overrides.delete(a.id);
    return h.presence || !a.presence ? h : { ...h, presence: a.presence };
  });
  return [...merged, ...host.filter((h) => overrides.has(h.id))];
}
