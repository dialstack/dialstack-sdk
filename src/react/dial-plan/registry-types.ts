import type { NodeProps } from '@xyflow/react';
import type { DialPlanNode } from '../../types/dial-plan';

export interface ExitDefinition {
  /** Handle ID (e.g., "open", "closed", "next") */
  id: string;
  /** Display label */
  label: string;
  /** Config key that stores the target node ID */
  configKey: string;
}

export interface ConfigPanelProps {
  config: Record<string, unknown>;
  onConfigChange: (updates: Record<string, unknown>, display?: Record<string, unknown>) => void;
  listResources: (
    type: 'schedule' | 'user' | 'ring_group' | 'dial_plan'
  ) => Promise<Array<{ id: string; name: string }>>;
}

export interface NodeTypeRegistration {
  type: string;
  flowType: string;
  label: string;
  description: string;
  icon: React.ReactElement;
  color: string;
  component: React.ComponentType<NodeProps>;
  configPanel: React.ComponentType<ConfigPanelProps>;
  defaultConfig: Record<string, unknown>;
  exits: ExitDefinition[];
  toFlowNode: (node: DialPlanNode) => Record<string, unknown>;
}
