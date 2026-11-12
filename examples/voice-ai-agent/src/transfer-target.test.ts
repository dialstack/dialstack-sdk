import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseToolArgs, resolveTransferTarget, TransferRefused } from './transfer-target.js';

test('the tool names an allowed extension', () => {
  assert.deepEqual(
    resolveTransferTarget(
      { extension: '1002' },
      { TRANSFER_EXTENSIONS: '1001:Sales,1002:Support' }
    ),
    {
      target: '1002',
    }
  );
});

test('an extension outside the allow-list is refused', () => {
  const r = resolveTransferTarget(
    { extension: '1009' },
    { TRANSFER_EXTENSIONS: '1001:Sales', TRANSFER_TARGET: '100' }
  );
  assert.ok('error' in r);
});

test('without TRANSFER_EXTENSIONS, a named extension is refused', () => {
  const r = resolveTransferTarget({ extension: '1001' }, { TRANSFER_TARGET: '100' });
  assert.ok('error' in r);
});

test('no extension falls back to TRANSFER_TARGET', () => {
  assert.deepEqual(resolveTransferTarget({}, { TRANSFER_TARGET: '100' }), { target: '100' });
});

test('nothing usable is refused', () => {
  assert.ok('error' in resolveTransferTarget({}, {}));
  assert.ok('error' in resolveTransferTarget({ extension: 7 }, {}));
});

test('tool arguments: an object or a JSON object string; anything else is malformed', () => {
  assert.deepEqual(parseToolArgs('{"extension":"1001"}'), { extension: '1001' });
  assert.deepEqual(parseToolArgs({ extension: '1001' }), { extension: '1001' });
  assert.deepEqual(parseToolArgs(undefined), {});
  for (const bad of [
    'not json',
    '{"extension": "10',
    '[1]',
    'null',
    '"1001"',
    '',
    ' ',
    null,
    [1],
  ]) {
    assert.equal(parseToolArgs(bad), undefined, JSON.stringify(bad));
  }
});

test('a blank or null extension counts as none named', () => {
  for (const extension of ['', '  ', null]) {
    assert.deepEqual(resolveTransferTarget({ extension }, { TRANSFER_TARGET: '100' }), {
      target: '100',
    });
  }
});

test('a refusal tells the agent which extensions it may offer', () => {
  const r = resolveTransferTarget(
    { extension: '1009' },
    { TRANSFER_EXTENSIONS: '1001:Sales,1002:Support' }
  );
  assert.ok('error' in r);
  assert.ok(r.error instanceof TransferRefused);
  assert.match(r.error.message, /1001 \(Sales\).*1002 \(Support\)/);
});
