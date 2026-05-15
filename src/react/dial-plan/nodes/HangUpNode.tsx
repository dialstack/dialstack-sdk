import React from 'react';
import type {
  DialPlanLocale,
  DialPlanNode,
  HangUpNode as HangUpNodeType,
} from '../../../types/dial-plan';
import type { ConfigPanelProps, NodeDefinition, NodeTypeRegistration } from '../registry-types';
import { NodeHeader } from '../DialPlanNode';
import { PhoneOffIcon } from '../icons';

const HangUpConfigPanel: React.FC<ConfigPanelProps> = ({ locale }) => (
  <div className="ds-dial-plan-config-panel__note">
    {locale?.nodeDescriptions.hangUp ?? 'End the call'}
  </div>
);

export const config: NodeDefinition = {
  type: 'hang_up',
  flowType: 'hangUp',
  localeKey: 'hangUp',
  label: 'Hang Up',
  description: 'End the call',
  color: '#ef4444',
  exits: [],
  configPanel: HangUpConfigPanel,
  defaultConfig: {},
  icon: PhoneOffIcon,
  renderNode: (data: Record<string, unknown>, reg: NodeTypeRegistration) => (
    <NodeHeader icon={reg.icon} label={data.label as string} />
  ),
  toFlowNode: (node: DialPlanNode) => {
    const n = node as HangUpNodeType;
    return { label: 'Hang Up', originalNode: n };
  },
  enrichNode: (data: Record<string, unknown>, _maps, locale: DialPlanLocale) => ({
    ...data,
    label: locale.nodeTypes.hangUp,
    locale,
  }),
};
