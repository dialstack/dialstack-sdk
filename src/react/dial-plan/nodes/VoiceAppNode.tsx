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
import { NodeHeader, StaticExits } from '../DialPlanNode';
import { VoiceAppConfigPanel } from '../config-panels/VoiceAppConfigPanel';
import { BotIcon } from '../icons';
import { resolveTargetName, resolveTargetType } from './resolve-target';

export const config: NodeDefinition = {
  type: 'voice_app',
  apiType: 'internal_dial',
  flowType: 'voiceApp',
  localeKey: 'voiceApp',
  label: 'Voice App',
  description: 'Route to a voice application',
  color: '#6366f1',
  exits: [{ id: 'next', label: 'No Answer', configKey: 'next', localeExitKey: 'noAnswer' }],
  configPanel: VoiceAppConfigPanel,
  defaultConfig: { target_id: '', timeout: 30 },
  icon: BotIcon,
  renderNode: (data: Record<string, unknown>, reg: NodeTypeRegistration) => (
    <>
      <NodeHeader
        icon={reg.icon}
        label={data.label as string}
        timeout={data.timeout as number | undefined}
        subtitle={data.targetName as string | undefined}
      />
      <div className="ds-dial-plan-node__exits">
        <StaticExits exits={reg.exits} locale={data.locale as DialPlanLocale | undefined} />
      </div>
    </>
  ),
  toFlowNode: (node: DialPlanNode) => {
    const n = node as InternalDialNodeType;
    return {
      label: 'Voice App',
      targetId: n.config.target_id,
      timeout: n.config.timeout,
      originalNode: n,
    };
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
