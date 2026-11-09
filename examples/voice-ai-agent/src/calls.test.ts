import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import { rememberCall, takeCall } from './calls.js';

const details = { accountId: 'acct_1', fromNumber: '+15550001111', toNumber: '+15550002222' };

test('a call remembered again is not dropped by the earlier entry expiring', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    rememberCall('call_1', details);
    mock.timers.tick(59_000);
    assert.ok(takeCall('call_1'));
    rememberCall('call_1', details); // e.g. the agent is attached again
    mock.timers.tick(2_000); // past the first entry's expiry
    assert.ok(takeCall('call_1'));
  } finally {
    mock.timers.reset();
  }
});

test('an entry nobody takes still expires', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    rememberCall('call_2', details);
    mock.timers.tick(60_001);
    assert.equal(takeCall('call_2'), undefined);
  } finally {
    mock.timers.reset();
  }
});

test('a call remembered twice before its socket arrives outlives the first expiry', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    rememberCall('call_3', details);
    mock.timers.tick(59_000);
    rememberCall('call_3', details);
    mock.timers.tick(2_000);
    assert.ok(takeCall('call_3'));
  } finally {
    mock.timers.reset();
  }
});
