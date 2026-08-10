/**
 * `isApiError` exists so packages that catch our errors do not have to hold the
 * same `ApiError` class object we threw with. The React onboarding flow catches
 * 409 and 422, and an `instanceof` check there fails silently — no error, just an
 * unhandled status and the wrong UI — whenever the two sides resolve different
 * module instances of this package.
 */

import { ApiError, isApiError } from '../core/instance';

describe('isApiError', () => {
  it('accepts an ApiError and narrows to its fields', () => {
    const err: unknown = new ApiError('conflict', 409, 'tos_version_stale');

    expect(isApiError(err)).toBe(true);
    if (isApiError(err)) {
      expect(err.status).toBe(409);
      expect(err.code).toBe('tos_version_stale');
    }
  });

  // The reason this helper exists. A second copy of the module — a duplicated
  // install, a bundler that fails to dedupe, another realm — produces a class
  // that `instanceof` rejects while every field the callers read is still there.
  it('accepts an error from a different copy of the class, where instanceof fails', () => {
    class ApiErrorFromAnotherCopy extends Error {
      constructor(
        message: string,
        readonly status: number,
        readonly code?: string
      ) {
        super(message);
        this.name = 'ApiError';
      }
    }
    const err: unknown = new ApiErrorFromAnotherCopy('conflict', 409);

    expect(err instanceof ApiError).toBe(false);
    expect(isApiError(err)).toBe(true);
  });

  // No `instanceof Error` gate, deliberately. `Error` is a per-realm intrinsic, so an
  // error thrown in an iframe, a worker or a vm context is not an `instanceof Error` in
  // the parent — the same failure this helper exists to avoid, one level up. Every
  // caller is a `catch` around a dialstack call narrowing on `status` to choose a
  // message, so a value carrying those fields *is* an API error there; demanding a real
  // Error instance would reject a genuine one to guard against a hand-built object no
  // code path produces.
  it('accepts an error from another realm, where instanceof Error also fails', () => {
    // Built without Error so it stands in for a foreign-realm error under jsdom.
    const err: unknown = { name: 'ApiError', status: 409, code: 'tos_version_stale' };

    expect(err instanceof Error).toBe(false);
    expect(isApiError(err)).toBe(true);
    if (isApiError(err)) {
      expect(err.status).toBe(409);
    }
  });

  it.each([
    ['a plain Error', new Error('boom')],
    ['an error named something else', Object.assign(new Error('boom'), { status: 409 })],
    ['a missing status', Object.assign(new Error('boom'), { name: 'ApiError' })],
    ['a non-numeric status', Object.assign(new Error('boom'), { name: 'ApiError', status: '409' })],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'ApiError'],
  ])('rejects %s', (_label, value) => {
    expect(isApiError(value)).toBe(false);
  });
});
