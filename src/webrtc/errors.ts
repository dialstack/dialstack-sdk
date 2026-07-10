export type PhoneErrorCode =
  | 'auth_failed'
  | 'auth_expired'
  | 'invalid_message'
  | 'call_failed'
  | 'call_not_found'
  | 'emergency_address_required'
  | 'session_limit'
  | 'session_revoked'
  | 'rate_limited'
  | 'internal_error'
  | 'going_away'
  | 'idle_timeout'
  | 'slow_consumer'
  | 'transport_closed'
  | 'ice_fetch_failed'
  | 'mic_permission_denied';

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
