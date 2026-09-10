import type { DialPlanLocale } from '@dialstack/sdk-js';
import type { ResourceMaps } from '../registry-types';

export function resolveTargetType(targetId: string, locale: DialPlanLocale): string {
  if (targetId.startsWith('user_')) return locale.targetTypes.user;
  if (targetId.startsWith('rg_')) return locale.targetTypes.ringGroup;
  if (targetId.startsWith('dp_')) return locale.targetTypes.dialPlan;
  if (targetId.startsWith('qu_')) return locale.targetTypes.queue;
  if (targetId.startsWith('va_')) return locale.targetTypes.voiceApp;
  if (targetId.startsWith('svm_')) return locale.targetTypes.sharedVoicemail;
  return locale.nodeTypes.internalDial;
}

export function resolveTargetName(
  targetId: string,
  maps: ResourceMaps,
  locale: DialPlanLocale
): string | undefined {
  const user = maps.users.get(targetId);
  const baseName = user?.name || user?.email;
  if (baseName && user?.extension_number) {
    return `${baseName} (${locale.combobox.extensionLabel}\u00a0${user.extension_number})`;
  }
  return baseName;
}

/**
 * The duration an Internal Extension node actually produces, for the canvas
 * badge. The node prints a number after its type label, and that number is a
 * promise about what the call will do.
 *
 * A node's own timeout governs only when it overrules the target. Otherwise the
 * target's own timing does: a ring group's or queue's stored timeout, or the
 * total of a user's Find Me / Follow Me ladder. A target with neither — a user
 * with no ladder, a nested dial plan, a shared voicemail box — has nothing more
 * specific to print, so the node's stored number is the best answer available.
 *
 * An override longer than a ladder is inert, because once every step has rung
 * there is nothing left to ring. That makes the ladder its own cap, and it is
 * the one place the override is not symmetric.
 *
 * A stored 0 is not a duration at all: it means "skip this node without
 * dialing", and routing reads it before it reads anything else — so it is what
 * the badge prints whatever the target owns.
 */
export function resolveEffectiveTimeout(
  targetId: string,
  timeout: number | undefined,
  timeoutOverride: boolean,
  maps: ResourceMaps
): number | undefined {
  // Read first, exactly as all three dispatch sites do: the node dials nothing,
  // so neither the target's timing nor the override can say anything about it.
  if (timeout === 0) return 0;
  const own = maps.users.get(targetId)?.timeout_seconds;
  if (!timeoutOverride) return own ?? timeout;
  if (timeout === undefined) return own;
  // Only a laddered user caps an override, and only a user has a ladder.
  if (targetId.startsWith('user_') && own !== undefined) return Math.min(timeout, own);
  return timeout;
}
