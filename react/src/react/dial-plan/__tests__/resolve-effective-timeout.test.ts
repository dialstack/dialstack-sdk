/**
 * The canvas prints a duration after an Internal Extension node's type label,
 * and that number reads as a promise about what the call will do. It used to be
 * the node's stored timeout verbatim, which is right for External Number, Ring
 * All and Menu and wrong here: against a target that owns its own timing the
 * stored number does nothing unless the node overrules it.
 */

import { resolveEffectiveTimeout } from '../nodes/resolve-target';
import type { ResourceMaps } from '../registry-types';

const maps = (targetId: string, ownTimeout?: number): ResourceMaps => ({
  schedules: new Map(),
  audioClips: new Map(),
  users: new Map([[targetId, { id: targetId, timeout_seconds: ownTimeout }]]),
});

describe('resolveEffectiveTimeout', () => {
  describe('with the override off', () => {
    it("prints a ring group's own timeout, not the node's", () => {
      expect(resolveEffectiveTimeout('rg_1', 30, false, maps('rg_1', 20))).toBe(20);
    });

    it("prints a queue's own max wait, not the node's", () => {
      expect(resolveEffectiveTimeout('qu_1', 30, false, maps('qu_1', 300))).toBe(300);
    });

    it("prints a laddered user's total, not the node's", () => {
      // A 30s desk plus a 60s mobile is 90 seconds of ringing, whatever the
      // node says.
      expect(resolveEffectiveTimeout('user_1', 25, false, maps('user_1', 90))).toBe(90);
    });

    it("falls back to the node's number when the target owns no timing", () => {
      // A user with no ladder, a nested dial plan, a shared voicemail box:
      // nothing more specific to print.
      expect(resolveEffectiveTimeout('user_1', 25, false, maps('user_1'))).toBe(25);
      expect(resolveEffectiveTimeout('dp_1', 25, false, maps('dp_1'))).toBe(25);
    });
  });

  describe('with the override on', () => {
    it("prints the node's number, shorter or longer than the target's", () => {
      expect(resolveEffectiveTimeout('rg_1', 30, true, maps('rg_1', 20))).toBe(30);
      expect(resolveEffectiveTimeout('qu_1', 30, true, maps('qu_1', 300))).toBe(30);
    });

    it("caps at a laddered user's total, because the ladder runs out", () => {
      // The one place the override is not symmetric: once every step has rung
      // there is nothing left to ring, so a longer number cannot buy more
      // ringing and the badge must not promise it.
      expect(resolveEffectiveTimeout('user_1', 120, true, maps('user_1', 90))).toBe(90);
      expect(resolveEffectiveTimeout('user_1', 25, true, maps('user_1', 90))).toBe(25);
    });

    it('does not cap a ring group or queue, which keep waiting', () => {
      expect(resolveEffectiveTimeout('rg_1', 120, true, maps('rg_1', 20))).toBe(120);
      expect(resolveEffectiveTimeout('qu_1', 600, true, maps('qu_1', 300))).toBe(600);
    });

    it("falls back to the target's own timing when the node stores no number", () => {
      expect(resolveEffectiveTimeout('rg_1', undefined, true, maps('rg_1', 20))).toBe(20);
    });
  });

  // Zero is a sentinel, not a short duration: the node dials nothing and the
  // plan moves straight to its next exit. Routing reads it before it reads the
  // target or the override, so the badge has to as well — falling through to
  // the target's own timing would promise ringing that never happens.
  describe('with the node set to skip (0)', () => {
    it('prints 0 whatever the target owns', () => {
      expect(resolveEffectiveTimeout('qu_1', 0, false, maps('qu_1', 300))).toBe(0);
      expect(resolveEffectiveTimeout('user_1', 0, false, maps('user_1', 90))).toBe(0);
    });

    it('prints 0 with the override on too, since 0 never reaches it', () => {
      expect(resolveEffectiveTimeout('rg_1', 0, true, maps('rg_1', 20))).toBe(0);
    });
  });

  it('prints nothing when neither side has a duration', () => {
    expect(resolveEffectiveTimeout('svm_1', undefined, false, maps('svm_1'))).toBeUndefined();
  });
});
