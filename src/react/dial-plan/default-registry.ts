import React from 'react';
import type { NodeProps } from '@xyflow/react';
import type { ComponentType } from 'react';
import { NodeTypeRegistry } from './registry';
import { ScheduleNode } from './ScheduleNode';
import { InternalDialNode } from './InternalDialNode';
import { RingAllUsersNode } from './RingAllUsersNode';
import { ScheduleConfigPanel } from './config-panels/ScheduleConfigPanel';
import { InternalDialConfigPanel } from './config-panels/InternalDialConfigPanel';
import { RingAllUsersConfigPanel } from './config-panels/RingAllUsersConfigPanel';
import type {
  DialPlanNode,
  ScheduleNode as ScheduleNodeType,
  InternalDialNode as InternalDialNodeType,
  RingAllUsersNode as RingAllUsersNodeType,
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
  type: 'internal_dial',
  flowType: 'internalDial',
  label: 'Dial',
  description: 'Ring a user, group, or plan',
  color: '#22c55e',
  exits: [{ id: 'next', label: 'No Answer', configKey: 'next' }],
  component: InternalDialNode as unknown as ComponentType<NodeProps>,
  configPanel: InternalDialConfigPanel,
  defaultConfig: { target_id: '', timeout: 30 },
  toFlowNode: (node: DialPlanNode) => {
    const n = node as InternalDialNodeType;
    return {
      label: 'Dial',
      targetId: n.config.target_id,
      timeout: n.config.timeout,
      originalNode: n,
    };
  },
  icon: phoneIcon,
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
