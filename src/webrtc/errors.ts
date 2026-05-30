export type PhoneErrorCode =
  | 'auth_failed'
  | 'auth_expired'
  | 'invalid_message'
  | 'call_failed'
  | 'call_not_found'
  | 'emergency_address_required'
  | 'session_limit'
  | 'rate_limited'
  | 'internal_error'
  | 'transport_closed'
  | 'ice_fetch_failed';

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
  constructor(method: string, tracking: string) {
    super(`${method} is not yet implemented (tracked in ${tracking})`);
    this.name = 'NotImplementedError';
  }
}
