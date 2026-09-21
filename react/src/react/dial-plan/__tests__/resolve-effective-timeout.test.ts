/** The active override badge reflects what that override can produce. */

import { resolveOverriddenTimeout, targetOwnsTiming } from '../nodes/resolve-target';
import type { ResourceMaps } from '../registry-types';

const maps = (targetId: string, ownTimeout?: number): ResourceMaps => ({
  schedules: new Map(),
  audioClips: new Map(),
  users: new Map([[targetId, { id: targetId, timeout_seconds: ownTimeout }]]),
});

describe('targetOwnsTiming', () => {
  it('is true for a ring group, a queue, and a laddered user', () => {
    expect(targetOwnsTiming('rg_1', maps('rg_1', 20))).toBe(true);
    expect(targetOwnsTiming('qu_1', maps('qu_1', 300))).toBe(true);
    expect(targetOwnsTiming('user_1', maps('user_1', 90))).toBe(true);
  });

  // These are the targets whose ring the node's number governs whatever the
  // override says, so the editor must keep showing and editing it for them.
  it('is false for a ladder-less user and an unresolved target', () => {
    expect(targetOwnsTiming('user_1', maps('user_1'))).toBe(false);
    expect(targetOwnsTiming('rg_9', maps('rg_1', 20))).toBe(false);
  });
});

describe('resolveOverriddenTimeout', () => {
  describe('with an active override', () => {
    it("prints the node's number, shorter or longer than the target's", () => {
      expect(resolveOverriddenTimeout('rg_1', 30, maps('rg_1', 20))).toBe(30);
      expect(resolveOverriddenTimeout('qu_1', 30, maps('qu_1', 300))).toBe(30);
    });

    it("caps at a laddered user's total, because the ladder runs out", () => {
      // The one place the override is not symmetric: once every step has rung
      // there is nothing left to ring, so a longer number cannot buy more
      // ringing and the badge must not promise it.
      expect(resolveOverriddenTimeout('user_1', 120, maps('user_1', 90))).toBe(90);
      expect(resolveOverriddenTimeout('user_1', 25, maps('user_1', 90))).toBe(25);
    });

    it('does not cap a ring group or queue, which keep waiting', () => {
      expect(resolveOverriddenTimeout('rg_1', 120, maps('rg_1', 20))).toBe(120);
      expect(resolveOverriddenTimeout('qu_1', 600, maps('qu_1', 300))).toBe(600);
    });

    it("falls back to the target's own timing when the node stores no number", () => {
      expect(resolveOverriddenTimeout('rg_1', undefined, maps('rg_1', 20))).toBe(20);
    });
  });

  // Zero is a sentinel, not a short duration: the node dials nothing and the
  // plan moves straight to its next exit. Routing reads it before it reads the
  // target or the override, so the badge has to as well — falling through to
  // the target's own timing would promise ringing that never happens.
  describe('with the node set to skip (0)', () => {
    it('prints 0 whatever the target owns', () => {
      expect(resolveOverriddenTimeout('qu_1', 0, maps('qu_1', 300))).toBe(0);
      expect(resolveOverriddenTimeout('user_1', 0, maps('user_1', 90))).toBe(0);
    });
  });
});
