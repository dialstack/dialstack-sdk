import React from 'react';
import type {
  DialPlanLocale,
  DialPlanNode,
  ScheduleNode as ScheduleNodeType,
} from '../../../types/dial-plan';
import type {
  NodeDefinition,
  NodeTypeRegistration,
  ResourceCollector,
  ResourceMaps,
} from '../registry-types';
import { NodeHeader, StaticExits } from '../DialPlanNode';
import { ScheduleConfigPanel } from '../config-panels/ScheduleConfigPanel';
import { ClockIcon } from '../icons';

export const config: NodeDefinition = {
  type: 'schedule',
  flowType: 'schedule',
  localeKey: 'schedule',
  label: 'Schedule',
  description: 'Route calls by schedule',
  color: '#0ea5e9',
  exits: [
    { id: 'open', label: 'Open', configKey: 'open', localeExitKey: 'open' },
    { id: 'closed', label: 'Closed', configKey: 'closed', localeExitKey: 'closed' },
  ],
  configPanel: ScheduleConfigPanel,
  defaultConfig: { schedule_id: '' },
  icon: ClockIcon,
  renderNode: (data: Record<string, unknown>, reg: NodeTypeRegistration) => (
    <>
      <NodeHeader
        icon={reg.icon}
        label={data.label as string}
        subtitle={data.scheduleName as string | undefined}
      />
      <div className="ds-dial-plan-node__exits">
        <StaticExits exits={reg.exits} locale={data.locale as DialPlanLocale | undefined} />
      </div>
    </>
  ),
  toFlowNode: (node: DialPlanNode) => {
    const n = node as ScheduleNodeType;
    return { label: 'Schedule', scheduleId: n.config.schedule_id, originalNode: n };
  },
  collectResourceIds: (config: Record<string, unknown>, collector: ResourceCollector) => {
    if (config.schedule_id) collector.addSchedule(config.schedule_id as string);
  },
  enrichNode: (data: Record<string, unknown>, maps: ResourceMaps, locale: DialPlanLocale) => {
    const schedule = maps.schedules.get(data.scheduleId as string);
    return { ...data, scheduleName: schedule?.name, locale };
  },
};
