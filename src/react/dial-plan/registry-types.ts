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

export type ResourceType =
  | 'schedule'
  | 'user'
  | 'ring_group'
  | 'dial_plan'
  | 'voice_app'
  | 'shared_voicemail';

export interface ConfigPanelProps {
  config: Record<string, unknown>;
  onConfigChange: (updates: Record<string, unknown>, display?: Record<string, unknown>) => void;
  listResources: (type: ResourceType) => Promise<Array<{ id: string; name: string }>>;
  onCreateResource?: (type: ResourceType) => Promise<{ id: string; name: string } | undefined>;
}

export interface NodeTypeRegistration {
  type: string;
  /** Actual API node type when serializing. Defaults to `type` if not set. */
  apiType?: string;
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
  /** When loading, inspect an API node to decide if a different registration should render it. */
  resolveAlias?: (node: DialPlanNode) => NodeTypeRegistration | undefined;
}
