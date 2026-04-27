import React from 'react';
import type {
  DialPlanLocale,
  DialPlanNode,
  SoundClipNode as SoundClipNodeType,
} from '../../../types/dial-plan';
import type {
  NodeDefinition,
  NodeTypeRegistration,
  ResourceCollector,
  ResourceMaps,
} from '../registry-types';
import { NodeHeader, StaticExits } from '../DialPlanNode';
import { SoundClipConfigPanel } from '../config-panels/SoundClipConfigPanel';
import { VolumeIcon } from '../icons';

export const config: NodeDefinition = {
  type: 'sound_clip',
  flowType: 'soundClip',
  localeKey: 'soundClip',
  label: 'Sound Clip',
  description: 'Play an audio clip',
  color: '#14b8a6',
  exits: [{ id: 'next', label: 'Next', configKey: 'next', localeExitKey: 'next' }],
  configPanel: SoundClipConfigPanel,
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
    const n = node as SoundClipNodeType;
    return { label: 'Sound Clip', clipId: n.config.clip_id, originalNode: n };
  },
  collectResourceIds: (config: Record<string, unknown>, collector: ResourceCollector) => {
    if (config.clip_id) collector.addAudioClip(config.clip_id as string);
  },
  enrichNode: (data: Record<string, unknown>, maps: ResourceMaps, locale: DialPlanLocale) => {
    const clip = maps.audioClips.get(data.clipId as string);
    return { ...data, clipName: clip?.name, locale };
  },
};
