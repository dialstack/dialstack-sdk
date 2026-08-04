export type PhoneErrorCode =
  | 'auth_failed'
  | 'auth_expired'
  | 'invalid_message'
  | 'call_failed'
  | 'call_not_found'
  | 'emergency_address_required'
  | 'session_limit'
  | 'session_replaced'
  | 'session_revoked'
  | 'rate_limited'
  | 'presence_unavailable'
  | 'reachability_unavailable'
  | 'internal_error'
  | 'going_away'
  | 'idle_timeout'
  | 'slow_consumer'
  | 'transport_closed'
  | 'ice_fetch_failed'
  | 'mic_permission_denied'
  | 'audio_device_unavailable'
  | 'audio_device_in_use';

export class PhoneError extends Error {
  readonly code: PhoneErrorCode;
  readonly callId: string | null;
  readonly fatal: boolean;

  constructor(opts: {
    code: PhoneErrorCode;
    message: string;
    callId?: string | null;
    fatal?: boolean;
  }) {
    super(opts.message);
    this.name = 'PhoneError';
    this.code = opts.code;
    this.callId = opts.callId ?? null;
    this.fatal = opts.fatal ?? false;
  }
}

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method} is not yet implemented`);
    this.name = 'NotImplementedError';
  }
}

const PERMISSION_DENIAL_NAMES = ['NotAllowedError', 'SecurityError'];
// The requested device doesn't exist or can't satisfy the constraint. Asking for a
// different (or no) device can succeed, so these are worth retrying.
const DEVICE_UNAVAILABLE_NAMES = ['NotFoundError', 'OverconstrainedError'];
// Every device of the kind was reachable but locked — another application holds the mic
// exclusively. Per the getUserMedia algorithm this means the candidate set was exhausted
// across ALL devices, so retrying on looser constraints is futile.
const DEVICE_IN_USE_NAMES = ['NotReadableError'];

const errorName = (cause: unknown): string | undefined => (cause as { name?: string } | null)?.name;

/**
 * Whether a `getUserMedia` rejection is the user (or policy) refusing access, as
 * opposed to a problem with the requested device. Retrying this would re-prompt and
 * fail again; retrying an unavailable device on looser constraints can succeed.
 */
export function isPermissionDenial(cause: unknown): boolean {
  return PERMISSION_DENIAL_NAMES.includes(errorName(cause) ?? '');
}

/**
 * Whether re-requesting on looser constraints could plausibly succeed. False for a
 * permission denial (same answer, plus a second prompt) and for a locked device: the
 * getUserMedia algorithm only reports that once no device of the kind is readable, so
 * dropping the deviceId constraint has nothing left to find.
 */
export function isRetryableWithoutDevice(cause: unknown): boolean {
  const name = errorName(cause) ?? '';
  return !PERMISSION_DENIAL_NAMES.includes(name) && !DEVICE_IN_USE_NAMES.includes(name);
}

/**
 * Classify a `getUserMedia` rejection. Not collapsed to `call_failed` because the
 * outcomes want different UI: a denied permission is re-promptable, an unavailable
 * device is re-pickable, anything else is neither.
 */
export function devicePhoneError(opts: {
  cause: unknown;
  deviceId?: string | null;
  callId?: string | null;
  /** Overrides the permission-denied message for callers with more context. */
  permissionMessage?: string;
  /**
   * Prefix for an error that isn't about the device at all. Callers whose guarded
   * block does more than acquire a mic (e.g. `startOutbound`, which also builds the
   * offer and gathers ICE) must set this — the default would report a `createOffer`
   * or ICE failure as a microphone problem.
   */
  fallbackMessage?: string;
}): PhoneError {
  const { cause, deviceId, callId, permissionMessage, fallbackMessage } = opts;
  const name = errorName(cause) ?? '';

  if (PERMISSION_DENIAL_NAMES.includes(name)) {
    return new PhoneError({
      code: 'mic_permission_denied',
      message: permissionMessage ?? 'Microphone permission is required',
      callId,
    });
  }
  if (DEVICE_IN_USE_NAMES.includes(name)) {
    // Deliberately says nothing about which device: the failure is that no microphone
    // could be read, so naming the requested one sends the user to re-pick a device
    // when the fix is to quit whatever is holding the mic.
    return new PhoneError({
      code: 'audio_device_in_use',
      message: 'Another application is using your microphone',
      callId,
    });
  }
  if (DEVICE_UNAVAILABLE_NAMES.includes(name)) {
    return new PhoneError({
      code: 'audio_device_unavailable',
      message: deviceId
        ? `The selected microphone is unavailable (${deviceId})`
        : 'The selected microphone is unavailable',
      callId,
    });
  }
  return new PhoneError({
    code: 'call_failed',
    message: `${fallbackMessage ?? 'Could not acquire the microphone'}: ${
      (cause as Error | null)?.message ?? 'unknown error'
    }`,
    callId,
  });
}
