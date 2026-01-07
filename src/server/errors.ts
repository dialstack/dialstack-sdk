/**
 * DialStack Error Classes
 *
 * Structured error hierarchy for better error handling and debugging.
 */

export type RawErrorType =
  | 'invalid_request_error'
  | 'api_error'
  | 'authentication_error'
  | 'rate_limit_error'
  | 'not_found_error'
  | 'conflict_error'
  | 'validation_error';

export interface RawError {
  type?: RawErrorType;
  code?: string;
  message?: string;
  param?: string;
  doc_url?: string;
}

/**
 * Base error class for all DialStack errors
 */
export class DialStackError extends Error {
  readonly type: RawErrorType;
  readonly statusCode: number;
  readonly requestId?: string;
  readonly code?: string;
  readonly param?: string;
  readonly docUrl?: string;
  readonly raw?: RawError;

  constructor(
    message: string,
    options: {
      type?: RawErrorType;
      statusCode: number;
      requestId?: string;
      code?: string;
      param?: string;
      docUrl?: string;
      raw?: RawError;
    }
  ) {
    super(message);
    this.name = 'DialStackError';
    this.type = options.type || 'api_error';
    this.statusCode = options.statusCode;
    this.requestId = options.requestId;
    this.code = options.code;
    this.param = options.param;
    this.docUrl = options.docUrl;
    this.raw = options.raw;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Generate appropriate error subclass based on status code and error type
   */
  static generate(
    message: string,
    statusCode: number,
    raw?: RawError,
    requestId?: string
  ): DialStackError {
    const options = {
      type: raw?.type,
      statusCode,
      requestId,
      code: raw?.code,
      param: raw?.param,
      docUrl: raw?.doc_url,
      raw,
    };

    // Map status codes to error classes
    switch (statusCode) {
      case 401:
        return new DialStackAuthenticationError(message, options);
      case 403:
        return new DialStackPermissionError(message, options);
      case 404:
        return new DialStackNotFoundError(message, options);
      case 409:
        return new DialStackConflictError(message, options);
      case 422:
        return new DialStackValidationError(message, options);
      case 429:
        return new DialStackRateLimitError(message, options);
      default:
        if (statusCode >= 500) {
          return new DialStackAPIError(message, options);
        }
        if (raw?.type === 'invalid_request_error') {
          return new DialStackInvalidRequestError(message, options);
        }
        return new DialStackError(message, options);
    }
  }
}

/**
 * Authentication failed (401)
 * API key is invalid, expired, or missing
 */
export class DialStackAuthenticationError extends DialStackError {
  constructor(
    message: string,
    options: ConstructorParameters<typeof DialStackError>[1]
  ) {
    super(message, { ...options, type: 'authentication_error' });
    this.name = 'DialStackAuthenticationError';
  }
}

/**
 * Permission denied (403)
 * API key doesn't have permission for this resource
 */
export class DialStackPermissionError extends DialStackError {
  constructor(
    message: string,
    options: ConstructorParameters<typeof DialStackError>[1]
  ) {
    super(message, options);
    this.name = 'DialStackPermissionError';
  }
}

/**
 * Resource not found (404)
 */
export class DialStackNotFoundError extends DialStackError {
  constructor(
    message: string,
    options: ConstructorParameters<typeof DialStackError>[1]
  ) {
    super(message, { ...options, type: 'not_found_error' });
    this.name = 'DialStackNotFoundError';
  }
}

/**
 * Conflict error (409)
 * Resource already exists or state conflict
 */
export class DialStackConflictError extends DialStackError {
  constructor(
    message: string,
    options: ConstructorParameters<typeof DialStackError>[1]
  ) {
    super(message, { ...options, type: 'conflict_error' });
    this.name = 'DialStackConflictError';
  }
}

/**
 * Validation error (422)
 * Request body validation failed
 */
export class DialStackValidationError extends DialStackError {
  constructor(
    message: string,
    options: ConstructorParameters<typeof DialStackError>[1]
  ) {
    super(message, { ...options, type: 'validation_error' });
    this.name = 'DialStackValidationError';
  }
}

/**
 * Invalid request (400)
 * Request parameters are invalid
 */
export class DialStackInvalidRequestError extends DialStackError {
  constructor(
    message: string,
    options: ConstructorParameters<typeof DialStackError>[1]
  ) {
    super(message, { ...options, type: 'invalid_request_error' });
    this.name = 'DialStackInvalidRequestError';
  }
}

/**
 * Rate limit exceeded (429)
 */
export class DialStackRateLimitError extends DialStackError {
  readonly retryAfter?: number;

  constructor(
    message: string,
    options: ConstructorParameters<typeof DialStackError>[1] & {
      retryAfter?: number;
    }
  ) {
    super(message, { ...options, type: 'rate_limit_error' });
    this.name = 'DialStackRateLimitError';
    this.retryAfter = options.retryAfter;
  }
}

/**
 * API error (5xx)
 * Server-side error
 */
export class DialStackAPIError extends DialStackError {
  constructor(
    message: string,
    options: ConstructorParameters<typeof DialStackError>[1]
  ) {
    super(message, { ...options, type: 'api_error' });
    this.name = 'DialStackAPIError';
  }
}

/**
 * Connection error
 * Network or connection failure
 */
export class DialStackConnectionError extends DialStackError {
  readonly originalError?: Error;

  constructor(message: string, options?: { cause?: Error }) {
    super(message, { statusCode: 0, type: 'api_error' });
    this.name = 'DialStackConnectionError';
    if (options?.cause) {
      this.originalError = options.cause;
    }
  }
}
