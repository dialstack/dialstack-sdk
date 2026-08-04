/**
 * Jest setup for the softphone tree. Runs before each test.
 *
 * Lives here rather than in the shared sdk/src/setupTests.ts so the softphone's
 * test-only concerns stay inside the softphone tree — the shared file is loaded by
 * the react/server/js suites too, and shouldn't reach across into these internals.
 */

import { resetPranswerSupportForTests } from './platform';

// The pranswer capability probe memoizes its verdict in module state, keyed to
// whatever globalThis.RTCPeerConnection was when it first ran. A suite that
// installs a stack-specific fake (e.g. one modelling Firefox's refusal) would
// otherwise leak that verdict into every later suite in file order, silently
// sending them down the skip branch and making their assertions vacuous. Reset
// globally so no suite depends on run order.
beforeEach(() => {
  resetPranswerSupportForTests();
});
