import React from 'react';
import type {
  DialPlanLocale,
  DialPlanNode,
  InternalDialNode as InternalDialNodeType,
} from '../../../types/dial-plan';
import type {
  NodeDefinition,
  NodeTypeRegistration,
  ResourceCollector,
  ResourceMaps,
} from '../registry-types';
import { NodeHeader } from '../DialPlanNode';
import { VoicemailConfigPanel } from '../config-panels/VoicemailConfigPanel';
import { VoicemailIcon } from '../icons';
import { resolveTargetName, resolveTargetType } from './resolve-target';

export const config: NodeDefinition = {
  type: 'voicemail',
  apiType: 'internal_dial',
  flowType: 'voicemail',
  localeKey: 'voicemail',
  label: 'Voicemail',
  description: 'Send to voicemail',
  color: '#8b5cf6',
  exits: [],
  configPanel: VoicemailConfigPanel,
  defaultConfig: { target_id: '', timeout: 0 },
  icon: VoicemailIcon,
  renderNode: (data: Record<string, unknown>, reg: NodeTypeRegistration) => (
    <NodeHeader
      icon={reg.icon}
      label={data.label as string}
      subtitle={data.targetName as string | undefined}
    />
  ),
  toFlowNode: (node: DialPlanNode) => {
    const n = node as InternalDialNodeType;
    return { label: 'Voicemail', targetId: n.config.target_id, timeout: 0, originalNode: n };
  },
  collectResourceIds: (config: Record<string, unknown>, collector: ResourceCollector) => {
    if (config.target_id) collector.addTarget(config.target_id as string);
  },
  enrichNode: (data: Record<string, unknown>, maps: ResourceMaps, locale: DialPlanLocale) => {
    const targetId = data.targetId as string;
    const targetName = resolveTargetName(targetId, maps, locale);
    const targetType = resolveTargetType(targetId, locale);
    return { ...data, targetName, targetType, locale };
  },
};
