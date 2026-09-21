import React from 'react';
import type {
  DialPlanLocale,
  DialPlanNode,
  InternalDialNode as InternalDialNodeType,
} from '@dialstack/sdk-js';
import type {
  NodeDefinition,
  NodeTypeRegistration,
  ResourceCollector,
  ResourceMaps,
} from '../registry-types';
import { NodeHeader, StaticExits } from '../DialPlanNode';
import { InternalDialConfigPanel } from '../config-panels/InternalDialConfigPanel';
import { PhoneIcon } from '../icons';
import {
  resolveOverriddenTimeout,
  resolveTargetName,
  resolveTargetType,
  targetOwnsTiming,
} from './resolve-target';

export const config: NodeDefinition = {
  type: 'internal_dial',
  flowType: 'internalDial',
  localeKey: 'internalDial',
  label: 'Internal Extension',
  description: 'Ring a user, group, or plan',
  color: '#22c55e',
  exits: [{ id: 'next', label: 'Timeout', configKey: 'next', localeExitKey: 'timeout' }],
  configPanel: InternalDialConfigPanel,
  defaultConfig: { target_id: '', timeout: 30, timeout_override: true },
  icon: PhoneIcon,
  renderNode: (data: Record<string, unknown>, reg: NodeTypeRegistration) => (
    <>
      <NodeHeader
        icon={reg.icon}
        label={data.label as string}
        timeout={data.timeoutInert ? undefined : (data.timeout as number | undefined)}
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
      label: 'Internal Extension',
      targetId: n.config.target_id,
      timeout: n.config.timeout,
      timeoutOverride: n.config.timeout_override ?? false,
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
    const stored = data.timeout as number | undefined;
    // The badge is a promise about the call, so it prints nothing rather than a
    // number the call ignores. What makes the number inert is the target owning
    // timing of its own, not the override being off: routing applies the node's
    // number to a user with no Find Me / Follow Me ladder either way. A stored 0
    // is never inert — every dispatch site reads it as "skip without dialing"
    // before it reads anything else.
    const timeoutInert = !data.timeoutOverride && stored !== 0 && targetOwnsTiming(targetId, maps);
    const timeout = data.timeoutOverride
      ? resolveOverriddenTimeout(targetId, stored, maps)
      : stored;
    return { ...data, targetName, targetType, timeout, timeoutInert, locale };
  },
};
