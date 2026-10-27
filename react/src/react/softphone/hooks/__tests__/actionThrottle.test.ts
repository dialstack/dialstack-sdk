import { ACTION_THROTTLE_MS, createActionThrottle } from '../actionThrottle';

describe('createActionThrottle', () => {
  let clock = 0;
  const now = () => clock;
  beforeEach(() => {
    clock = 1000;
  });

  it('runs the first press at once and drops repeats within the window', () => {
    const throttle = createActionThrottle(ACTION_THROTTLE_MS, now);
    const action = jest.fn();
    throttle('hangup', action);
    clock += ACTION_THROTTLE_MS - 1;
    throttle('hangup', action);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('runs again once the window has passed', () => {
    const throttle = createActionThrottle(ACTION_THROTTLE_MS, now);
    const action = jest.fn();
    throttle('hangup', action);
    clock += ACTION_THROTTLE_MS;
    throttle('hangup', action);
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('keeps each key to its own window', () => {
    const throttle = createActionThrottle(ACTION_THROTTLE_MS, now);
    const hold = jest.fn();
    const mute = jest.fn();
    throttle('hold', hold);
    throttle('mute', mute);
    expect(hold).toHaveBeenCalledTimes(1);
    expect(mute).toHaveBeenCalledTimes(1);
  });

  it('times a dropped press from the last run, not from the drop', () => {
    const throttle = createActionThrottle(ACTION_THROTTLE_MS, now);
    const action = jest.fn();
    throttle('hold', action);
    clock += 400;
    throttle('hold', action);
    clock += 100;
    throttle('hold', action);
    expect(action).toHaveBeenCalledTimes(2);
  });
});
