import React from 'react';
import type {
  DialPlanLocale,
  DialPlanNode,
  ScheduleNode as ScheduleNodeType,
} from '../../../types/dial-plan';
import type {
  ConfigChangeContext,
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
  // Holiday is always declared so the graph's clear/rebuild serialization
  // handles it uniformly. Visibility is gated in renderNode by
  // data.holidayEnabled — the handle only appears when the user has opted in.
  exits: [
    { id: 'open', label: 'Open', configKey: 'open', localeExitKey: 'open' },
    { id: 'closed', label: 'Closed', configKey: 'closed', localeExitKey: 'closed' },
    { id: 'holiday', label: 'Holiday', configKey: 'holiday', localeExitKey: 'holiday' },
  ],
  configPanel: ScheduleConfigPanel,
  defaultConfig: { schedule_id: '' },
  icon: ClockIcon,
  renderNode: (data: Record<string, unknown>, reg: NodeTypeRegistration) => {
    const locale = data.locale as DialPlanLocale | undefined;
    const visibleExits = reg.exits.slice(0, data.holidayEnabled ? 3 : 2);
    return (
      <>
        <NodeHeader
          icon={reg.icon}
          label={data.label as string}
          subtitle={data.scheduleName as string | undefined}
        />
        <div className="ds-dial-plan-node__exits">
          <StaticExits exits={visibleExits} locale={locale} />
        </div>
      </>
    );
  },
  toFlowNode: (node: DialPlanNode) => {
    const n = node as ScheduleNodeType;
    return {
      label: 'Schedule',
      scheduleId: n.config.schedule_id,
      holidayEnabled: n.config.holiday !== undefined,
      originalNode: n,
    };
  },
  collectResourceIds: (config: Record<string, unknown>, collector: ResourceCollector) => {
    if (config.schedule_id) collector.addSchedule(config.schedule_id as string);
  },
  enrichNode: (data: Record<string, unknown>, maps: ResourceMaps, locale: DialPlanLocale) => {
    const schedule = maps.schedules.get(data.scheduleId as string);
    return { ...data, scheduleName: schedule?.name, locale };
  },
  onConfigChange: (
    nodeId: string,
    configUpdates: Record<string, unknown>,
    ctx: ConfigChangeContext
  ) => {
    // When holiday routing is turned off, drop any wired holiday edge so the
    // saved plan reflects the disabled state instead of resurrecting it on
    // the next serialize. Two-stage check: only react when *this* update
    // touched holiday (key present) AND set it to undefined — otherwise an
    // unrelated update (e.g. schedule_id change) would also nuke the edge.
    if (!('holiday' in configUpdates)) return;
    if (configUpdates.holiday !== undefined) return;
    ctx.setEdges((prev) => {
      const next = prev.filter((e) => !(e.source === nodeId && e.sourceHandle === 'holiday'));
      if (next.length !== prev.length) {
        ctx.updateDirty(ctx.nodesRef.current, next);
      }
      return next;
    });
    requestAnimationFrame(() => ctx.updateNodeInternals(nodeId));
  },
  serializeConfig: (node, _edges, baseConfig) => {
    // The default clear-and-rebuild sets every exit key from its edge, so an
    // opted-in-but-unwired holiday exit serializes as undefined and is dropped
    // by JSON.stringify — the toggle would silently revert on reload. Persist
    // the opt-in as an explicit null instead. Server-side this parses back to
    // nil and folds into Closed at runtime (see executor StateHoliday arm), so
    // it only preserves the checkbox state and never affects call routing.
    const holidayEnabled = (node.data as Record<string, unknown> | undefined)?.holidayEnabled;
    if (holidayEnabled && baseConfig.holiday === undefined) {
      return { ...baseConfig, holiday: null };
    }
    return baseConfig;
  },
};
