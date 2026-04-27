import React from 'react';
import type {
  DialPlanLocale,
  DialPlanNode,
  RingAllUsersNode as RingAllUsersNodeType,
} from '../../../types/dial-plan';
import type { NodeDefinition, NodeTypeRegistration } from '../registry-types';
import { NodeHeader, StaticExits } from '../DialPlanNode';
import { RingAllUsersConfigPanel } from '../config-panels/RingAllUsersConfigPanel';
import { UsersIcon } from '../icons';

export const config: NodeDefinition = {
  type: 'ring_all_users',
  flowType: 'ringAllUsers',
  localeKey: 'ringAllUsers',
  label: 'Ring All',
  description: 'Ring all account users',
  color: '#f59e0b',
  exits: [{ id: 'next', label: 'No Answer', configKey: 'next', localeExitKey: 'noAnswer' }],
  configPanel: RingAllUsersConfigPanel,
  defaultConfig: { timeout: 24 },
  icon: UsersIcon,
  renderNode: (data: Record<string, unknown>, reg: NodeTypeRegistration) => (
    <>
      <NodeHeader
        icon={reg.icon}
        label={data.label as string}
        timeout={data.timeout as number | undefined}
      />
      {reg.exits.length > 0 && (
        <div className="ds-dial-plan-node__exits">
          <StaticExits exits={reg.exits} locale={data.locale as DialPlanLocale | undefined} />
        </div>
      )}
    </>
  ),
  toFlowNode: (node: DialPlanNode) => {
    const n = node as RingAllUsersNodeType;
    return { label: 'Ring All', timeout: n.config.timeout, originalNode: n };
  },
};
