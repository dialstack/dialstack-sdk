import { logError } from '../logger';

describe('logError', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes a tagged line to console.error', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logError('something broke');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('[dialstack]');
    expect(spy.mock.calls[0][0]).toContain('something broke');
  });

  it('passes structured data as a second argument', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logError('call failed', { code: 'call_failed' });
    expect(spy.mock.calls[0][1]).toEqual({ code: 'call_failed' });
  });
});
