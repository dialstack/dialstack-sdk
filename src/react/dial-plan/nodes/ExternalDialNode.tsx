import React from 'react';
import type {
  DialPlanLocale,
  DialPlanNode,
  ExternalDialNode as ExternalDialNodeType,
} from '../../../types/dial-plan';
import type { NodeDefinition, NodeTypeRegistration } from '../registry-types';
import { NodeHeader, StaticExits } from '../DialPlanNode';
import { ExternalDialConfigPanel } from '../config-panels/ExternalDialConfigPanel';
import { formatPhoneForDisplay } from '../format-phone';
import { PhoneOutgoingIcon } from '../icons';

export const config: NodeDefinition = {
  type: 'external_dial',
  flowType: 'externalDial',
  localeKey: 'externalDial',
  label: 'External Number',
  description: 'Ring an external phone number',
  color: '#f43f5e',
  exits: [{ id: 'next', label: 'No Answer', configKey: 'next', localeExitKey: 'noAnswer' }],
  configPanel: ExternalDialConfigPanel,
  defaultConfig: { phone_number: '', timeout: 60 },
  icon: PhoneOutgoingIcon,
  renderNode: (data: Record<string, unknown>, reg: NodeTypeRegistration) => (
    <>
      <NodeHeader
        icon={reg.icon}
        label={data.label as string}
        timeout={data.timeout as number | undefined}
        subtitle={data.phoneNumber as string | undefined}
      />
      <div className="ds-dial-plan-node__exits">
        <StaticExits exits={reg.exits} locale={data.locale as DialPlanLocale | undefined} />
      </div>
    </>
  ),
  toFlowNode: (node: DialPlanNode) => {
    const n = node as ExternalDialNodeType;
    return {
      label: 'External Number',
      phoneNumber: formatPhoneForDisplay(n.config.phone_number),
      timeout: n.config.timeout,
      originalNode: n,
    };
  },
};
