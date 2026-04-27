import type { NodeProps } from '@xyflow/react';
import type { ComponentType } from 'react';
import { NodeTypeRegistry } from './registry';
import { createDialPlanNode } from './DialPlanNode';
import type { NodeDefinition } from './registry-types';
import type { DialPlanNode } from '../../types/dial-plan';

import { config as schedule } from './nodes/ScheduleNode';
import { config as ringAllUsers } from './nodes/RingAllUsersNode';
import { config as internalDial } from './nodes/InternalDialNode';
import { config as externalDial } from './nodes/ExternalDialNode';
import { config as voiceApp } from './nodes/VoiceAppNode';
import { config as voicemail } from './nodes/VoicemailNode';
import { config as menu } from './nodes/MenuNode';
import { config as soundClip } from './nodes/SoundClipNode';

export const defaultRegistry = new NodeTypeRegistry();

const nodeComponent = createDialPlanNode(defaultRegistry) as unknown as ComponentType<NodeProps>;

export const nodeDefinitions: NodeDefinition[] = [
  schedule,
  ringAllUsers,
  internalDial,
  externalDial,
  voiceApp,
  voicemail,
  menu,
  soundClip,
];

for (const def of nodeDefinitions) {
  defaultRegistry.register({ ...def, component: nodeComponent });
}

// internal_dial resolves voicemail and voice_app aliases at load time
const internalDialReg = defaultRegistry.get('internal_dial');
if (internalDialReg) {
  internalDialReg.resolveAlias = (node: DialPlanNode) => {
    const config = node.config as unknown as Record<string, unknown>;
    const targetId = config.target_id as string | undefined;
    if (targetId?.startsWith('svm_') || (config.timeout === 0 && !config.next)) {
      return defaultRegistry.get('voicemail');
    }
    if (targetId?.startsWith('va_')) {
      return defaultRegistry.get('voice_app');
    }
    return undefined;
  };
}
