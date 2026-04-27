import type { DialPlanLocale } from '../../../types/dial-plan';
import type { ResourceMaps } from '../registry-types';

export function resolveTargetType(targetId: string, locale: DialPlanLocale): string {
  if (targetId.startsWith('user_')) return locale.targetTypes.user;
  if (targetId.startsWith('rg_')) return locale.targetTypes.ringGroup;
  if (targetId.startsWith('dp_')) return locale.targetTypes.dialPlan;
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
