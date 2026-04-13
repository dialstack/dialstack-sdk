import React from 'react';
import type { NodeProps } from '@xyflow/react';
import type { ComponentType } from 'react';
import { NodeTypeRegistry } from './registry';
import { ScheduleNode } from './ScheduleNode';
import { InternalDialNode } from './InternalDialNode';
import { RingAllUsersNode } from './RingAllUsersNode';
import { VoicemailNode } from './VoicemailNode';
import { ExternalDialNode } from './ExternalDialNode';
import { VoiceAppNode } from './VoiceAppNode';
import { ScheduleConfigPanel } from './config-panels/ScheduleConfigPanel';
import { InternalDialConfigPanel } from './config-panels/InternalDialConfigPanel';
import { RingAllUsersConfigPanel } from './config-panels/RingAllUsersConfigPanel';
import { VoicemailConfigPanel } from './config-panels/VoicemailConfigPanel';
import { ExternalDialConfigPanel } from './config-panels/ExternalDialConfigPanel';
import { formatPhoneForDisplay } from './format-phone';
import { VoiceAppConfigPanel } from './config-panels/VoiceAppConfigPanel';
import type {
  DialPlanNode,
  ScheduleNode as ScheduleNodeType,
  InternalDialNode as InternalDialNodeType,
  RingAllUsersNode as RingAllUsersNodeType,
  ExternalDialNode as ExternalDialNodeType,
} from '../../types/dial-plan';

const clockIcon = React.createElement(
  'svg',
  {
    width: '16',
    height: '16',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
  React.createElement('circle', { cx: '12', cy: '12', r: '10' }),
  React.createElement('polyline', { points: '12 6 12 12 16 14' })
);

const phoneIcon = React.createElement(
  'svg',
  {
    width: '16',
    height: '16',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
  React.createElement('path', {
    d: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
  })
);

const usersIcon = React.createElement(
  'svg',
  {
    width: '16',
    height: '16',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
  React.createElement('path', { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }),
  React.createElement('circle', { cx: '9', cy: '7', r: '4' }),
  React.createElement('path', { d: 'M23 21v-2a4 4 0 0 0-3-3.87' }),
  React.createElement('path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' })
);

const phoneOutgoingIcon = React.createElement(
  'svg',
  {
    width: '16',
    height: '16',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
  React.createElement('polyline', { points: '23 7 23 1 17 1' }),
  React.createElement('line', { x1: '16', y1: '8', x2: '23', y2: '1' }),
  React.createElement('path', {
    d: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
  })
);

const voicemailIcon = React.createElement(
  'svg',
  {
    width: '16',
    height: '16',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
  React.createElement('circle', { cx: '5.5', cy: '11.5', r: '4.5' }),
  React.createElement('circle', { cx: '18.5', cy: '11.5', r: '4.5' }),
  React.createElement('line', { x1: '5.5', y1: '16', x2: '18.5', y2: '16' })
);

// Bot icon — matches lucide-react "Bot" used in admin sidebar and voice-apps page
const voiceAppIcon = React.createElement(
  'svg',
  {
    width: '16',
    height: '16',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
  React.createElement('path', { d: 'M12 8V4H8' }),
  React.createElement('rect', { width: '16', height: '12', x: '4', y: '8', rx: '2' }),
  React.createElement('path', { d: 'M2 14h2' }),
  React.createElement('path', { d: 'M20 14h2' }),
  React.createElement('path', { d: 'M15 13v2' }),
  React.createElement('path', { d: 'M9 13v2' })
);

export const defaultRegistry = new NodeTypeRegistry();

defaultRegistry.register({
  type: 'schedule',
  flowType: 'schedule',
  label: 'Schedule',
  description: 'Route calls by schedule',
  color: '#0ea5e9',
  exits: [
    { id: 'open', label: 'Open', configKey: 'open' },
    { id: 'closed', label: 'Closed', configKey: 'closed' },
  ],
  component: ScheduleNode as unknown as ComponentType<NodeProps>,
  configPanel: ScheduleConfigPanel,
  defaultConfig: { schedule_id: '' },
  toFlowNode: (node: DialPlanNode) => {
    const n = node as ScheduleNodeType;
    return {
      label: 'Schedule',
      scheduleId: n.config.schedule_id,
      originalNode: n,
    };
  },
  icon: clockIcon,
});

defaultRegistry.register({
  type: 'ring_all_users',
  flowType: 'ringAllUsers',
  label: 'Ring All',
  description: 'Ring all account users',
  color: '#f59e0b',
  exits: [{ id: 'next', label: 'No Answer', configKey: 'next' }],
  component: RingAllUsersNode as unknown as ComponentType<NodeProps>,
  configPanel: RingAllUsersConfigPanel,
  defaultConfig: { timeout: 24 },
  toFlowNode: (node: DialPlanNode) => {
    const n = node as RingAllUsersNodeType;
    return {
      label: 'Ring All',
      timeout: n.config.timeout,
      originalNode: n,
    };
  },
  icon: usersIcon,
});

defaultRegistry.register({
  type: 'internal_dial',
  flowType: 'internalDial',
  label: 'Internal Extension',
  description: 'Ring a user, group, or plan',
  color: '#22c55e',
  exits: [{ id: 'next', label: 'No Answer', configKey: 'next' }],
  component: InternalDialNode as unknown as ComponentType<NodeProps>,
  configPanel: InternalDialConfigPanel,
  defaultConfig: { target_id: '', timeout: 30 },
  toFlowNode: (node: DialPlanNode) => {
    const n = node as InternalDialNodeType;
    return {
      label: 'Internal Extension',
      targetId: n.config.target_id,
      timeout: n.config.timeout,
      originalNode: n,
    };
  },
  icon: phoneIcon,
  resolveAlias: (node: DialPlanNode) => {
    const config = node.config as unknown as Record<string, unknown>;
    const targetId = config.target_id as string | undefined;

    // Voicemail: shared VM target, user direct-to-VM, or unassigned VM
    const isVoicemail = targetId?.startsWith('svm_') || (config.timeout === 0 && !config.next);
    if (isVoicemail) {
      return defaultRegistry.get('voicemail');
    }
    if (!targetId) return undefined;

    // Voice app targets render as voice app node
    if (targetId.startsWith('va_')) {
      return defaultRegistry.get('voice_app');
    }
    return undefined;
  },
});

defaultRegistry.register({
  type: 'external_dial',
  flowType: 'externalDial',
  label: 'External Number',
  description: 'Ring an external phone number',
  color: '#14b8a6',
  exits: [{ id: 'next', label: 'No Answer', configKey: 'next' }],
  component: ExternalDialNode as unknown as ComponentType<NodeProps>,
  configPanel: ExternalDialConfigPanel,
  defaultConfig: { phone_number: '', timeout: 60 },
  toFlowNode: (node: DialPlanNode) => {
    const n = node as ExternalDialNodeType;
    return {
      label: 'External Number',
      phoneNumber: formatPhoneForDisplay(n.config.phone_number),
      timeout: n.config.timeout,
      originalNode: n,
    };
  },
  icon: phoneOutgoingIcon,
});

defaultRegistry.register({
  type: 'voice_app',
  apiType: 'internal_dial',
  flowType: 'voiceApp',
  label: 'Voice App',
  description: 'Route to a voice application',
  color: '#6366f1',
  exits: [{ id: 'next', label: 'No Answer', configKey: 'next' }],
  component: VoiceAppNode as unknown as ComponentType<NodeProps>,
  configPanel: VoiceAppConfigPanel,
  defaultConfig: { target_id: '', timeout: 30 },
  toFlowNode: (node: DialPlanNode) => {
    const n = node as InternalDialNodeType;
    return {
      label: 'Voice App',
      targetId: n.config.target_id,
      timeout: n.config.timeout,
      originalNode: n,
    };
  },
  icon: voiceAppIcon,
});

defaultRegistry.register({
  type: 'voicemail',
  apiType: 'internal_dial',
  flowType: 'voicemail',
  label: 'Voicemail',
  description: 'Send to voicemail',
  color: '#8b5cf6',
  exits: [],
  component: VoicemailNode as unknown as ComponentType<NodeProps>,
  configPanel: VoicemailConfigPanel,
  defaultConfig: { target_id: '', timeout: 0 },
  toFlowNode: (node: DialPlanNode) => {
    const n = node as InternalDialNodeType;
    return {
      label: 'Voicemail',
      targetId: n.config.target_id,
      timeout: 0,
      originalNode: n,
    };
  },
  icon: voicemailIcon,
});
