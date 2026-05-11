import React from 'react';
import type {
  DialPlanLocale,
  DialPlanNode,
  AudioClipNode as AudioClipNodeType,
} from '../../../types/dial-plan';
import type {
  NodeDefinition,
  NodeTypeRegistration,
  ResourceCollector,
  ResourceMaps,
} from '../registry-types';
import { NodeHeader, StaticExits } from '../DialPlanNode';
import { AudioClipConfigPanel } from '../config-panels/AudioClipConfigPanel';
import { VolumeIcon } from '../icons';

export const config: NodeDefinition = {
  type: 'audio_clip',
  flowType: 'audioClip',
  localeKey: 'audioClip',
  label: 'Audio Clip',
  description: 'Play an audio clip',
  color: '#14b8a6',
  exits: [{ id: 'next', label: 'Next', configKey: 'next', localeExitKey: 'next' }],
  configPanel: AudioClipConfigPanel,
  defaultConfig: { clip_id: '' },
  icon: VolumeIcon,
  renderNode: (data: Record<string, unknown>, reg: NodeTypeRegistration) => (
    <>
      <NodeHeader
        icon={reg.icon}
        label={data.label as string}
        subtitle={data.clipName as string | undefined}
      />
      <div className="ds-dial-plan-node__exits">
        <StaticExits exits={reg.exits} locale={data.locale as DialPlanLocale | undefined} />
      </div>
    </>
  ),
  toFlowNode: (node: DialPlanNode) => {
    const n = node as AudioClipNodeType;
    return { label: 'Audio Clip', clipId: n.config.clip_id, originalNode: n };
  },
  // Legacy plans store this node as `sound_clip` (pre-DIA-1029). The default
  // registry alias routes those nodes here; this rewrites them into the
  // current shape so save round-trips as `audio_clip` — an implicit migration
  // on first edit while the SQL migration handles bulk.
  normalizeFromAlias: (node: DialPlanNode): DialPlanNode => {
    return {
      ...node,
      type: 'audio_clip',
    } as DialPlanNode;
  },
  collectResourceIds: (config: Record<string, unknown>, collector: ResourceCollector) => {
    if (config.clip_id) collector.addAudioClip(config.clip_id as string);
  },
  enrichNode: (data: Record<string, unknown>, maps: ResourceMaps, locale: DialPlanLocale) => {
    const clip = maps.audioClips.get(data.clipId as string);
    return { ...data, clipName: clip?.name, locale };
  },
};
