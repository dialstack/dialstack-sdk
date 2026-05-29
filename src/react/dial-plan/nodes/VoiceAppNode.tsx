import React from 'react';
import type {
  DialPlanLocale,
  DialPlanNode,
  VoiceAppNode as VoiceAppNodeType,
} from '../../../types/dial-plan';
import type {
  NodeDefinition,
  NodeTypeRegistration,
  ResourceCollector,
  ResourceMaps,
} from '../registry-types';
import { ExitRow, NodeHeader } from '../DialPlanNode';
import { VoiceAppConfigPanel } from '../config-panels/VoiceAppConfigPanel';
import { BotIcon } from '../icons';
import { resolveTargetName } from './resolve-target';

export const config: NodeDefinition = {
  type: 'voice_app',
  flowType: 'voiceApp',
  localeKey: 'voiceApp',
  label: 'Voice App',
  description: 'Route to a voice application',
  color: '#6366f1',
  exits: [{ id: 'next', label: 'Timeout', configKey: 'next', localeExitKey: 'timeout' }],
  configPanel: VoiceAppConfigPanel,
  defaultConfig: { voice_app_id: '', mode: 'control' },
  icon: BotIcon,
  renderNode: (data: Record<string, unknown>, reg: NodeTypeRegistration) => {
    const locale = data.locale as DialPlanLocale | undefined;
    const isNotify = data.mode === 'notify';
    const badgeText = isNotify
      ? (locale?.voiceAppMode.notifyBadge ?? 'Notify mode')
      : (locale?.voiceAppMode.controlBadge ?? 'Control mode');
    // The `next` exit changes meaning by mode:
    //   control → fallback when the voice app fails/unconfigured ("Timeout")
    //   notify  → always-taken continuation after the webhook is fired ("Next")
    const exitLabel = isNotify
      ? (locale?.exits.next ?? 'Next')
      : (locale?.exits.timeout ?? 'Timeout');
    return (
      <>
        <NodeHeader
          icon={reg.icon}
          label={data.label as string}
          subtitle={data.voiceAppName as string | undefined}
        />
        <span className="ds-dial-plan-node__badge">{badgeText}</span>
        <div className="ds-dial-plan-node__exits">
          <ExitRow id="next" label={exitLabel} />
        </div>
      </>
    );
  },
  toFlowNode: (node: DialPlanNode) => {
    const n = node as VoiceAppNodeType;
    return {
      label: 'Voice App',
      voiceAppId: n.config.voice_app_id,
      mode: n.config.mode ?? 'control',
      originalNode: n,
    };
  },
  // Legacy plans store voice apps as `internal_dial` with a `va_` `target_id`.
  // The default-registry alias routes those nodes here; this rewrites them
  // into the native voice_app shape so save round-trips as voice_app — an
  // implicit migration on first edit while the SQL migration handles bulk.
  // TODO(DIA-941): remove this hook once legacy usage drains.
  normalizeFromAlias: (node: DialPlanNode): DialPlanNode => {
    const config = node.config as unknown as Record<string, unknown>;
    const targetId = (config.target_id as string | undefined) ?? '';
    const next = config.next as string | undefined;
    return {
      ...node,
      type: 'voice_app',
      config: {
        voice_app_id: targetId,
        mode: 'control',
        ...(next !== undefined ? { next } : {}),
      },
    } as unknown as DialPlanNode;
  },
  collectResourceIds: (config: Record<string, unknown>, collector: ResourceCollector) => {
    if (config.voice_app_id) collector.addTarget(config.voice_app_id as string);
  },
  enrichNode: (data: Record<string, unknown>, maps: ResourceMaps, locale: DialPlanLocale) => {
    const voiceAppId = data.voiceAppId as string;
    // ResourceMaps.users holds every routing target resolved via
    // dialstack.resolveRoutingTarget — including va_ voice apps. resolveTargetName
    // appends the extension suffix when one is set, matching InternalDialNode.
    const voiceAppName = voiceAppId ? resolveTargetName(voiceAppId, maps, locale) : undefined;
    return { ...data, voiceAppName, locale };
  },
};
