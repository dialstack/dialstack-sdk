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
 * Whether the target carries timing of its own — a ring group's or queue's
 * stored timeout, or the total of a user's Find Me / Follow Me ladder.
 *
 * This, not the override flag, is what makes a node's stored timeout inert.
 * Routing applies the node's number to a user's devices unconditionally
 * (`dialNodeRingTimeout`), and the flag gates only the Find Me / Follow Me
 * budget — so against a user with no ladder the stored number governs the ring
 * whether the override is on or off.
 */
export function targetOwnsTiming(targetId: string, maps: ResourceMaps): boolean {
  return maps.users.get(targetId)?.timeout_seconds !== undefined;
}

/** The duration an active Internal Extension timeout override can produce. */
export function resolveOverriddenTimeout(
  targetId: string,
  timeout: number | undefined,
  maps: ResourceMaps
): number | undefined {
  if (timeout === 0) return 0;
  const own = maps.users.get(targetId)?.timeout_seconds;
  if (timeout === undefined) return own;
  // Only a laddered user caps an override, and only a user has a ladder.
  if (targetId.startsWith('user_') && own !== undefined) return Math.min(timeout, own);
  return timeout;
}
