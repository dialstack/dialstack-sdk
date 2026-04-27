import type { NodeProps, Edge, Node } from '@xyflow/react';
import type { DialPlanNode, DialPlanLocale } from '../../types/dial-plan';

export interface ExitDefinition {
  /** Handle ID (e.g., "open", "closed", "next") */
  id: string;
  /** Display label (used as fallback if no locale key matches) */
  label: string;
  /** Config key that stores the target node ID */
  configKey: string;
  /** Optional key into locale.exits for i18n. If omitted, label is used directly. */
  localeExitKey?: string;
}

export type ResourceType =
  | 'schedule'
  | 'user'
  | 'ring_group'
  | 'dial_plan'
  | 'voice_app'
  | 'shared_voicemail'
  | 'audio_clip';

export interface ConfigPanelProps {
  config: Record<string, unknown>;
  onConfigChange: (updates: Record<string, unknown>, display?: Record<string, unknown>) => void;
  listResources: (
    type: ResourceType
  ) => Promise<Array<{ id: string; name: string; extension_number?: string }>>;
  onCreateResource?: (
    type: ResourceType
  ) => Promise<{ id: string; name: string; extension_number?: string } | undefined>;
  onOpenResource?: (resourceId: string) => void;
  locale?: DialPlanLocale;
}

export interface NodeTypeRegistration {
  type: string;
  /** Actual API node type when serializing. Defaults to `type` if not set. */
  apiType?: string;
  flowType: string;
  label: string;
  description: string;
  /** Key into locale.nodeTypes and locale.nodeDescriptions */
  localeKey: Exclude<keyof DialPlanLocale['nodeTypes'], 'start'>;
  icon: React.ReactElement;
  color: string;
  component: React.ComponentType<NodeProps>;
  configPanel: React.ComponentType<ConfigPanelProps>;
  defaultConfig: Record<string, unknown>;
  exits: ExitDefinition[];
  /** Render the node content inside the shell. Compose from NodeHeader, ExitRow, StaticExits. */
  renderNode: (data: Record<string, unknown>, reg: NodeTypeRegistration) => React.ReactNode;
  toFlowNode: (node: DialPlanNode) => Record<string, unknown>;
  /** When loading, inspect an API node to decide if a different registration should render it. */
  resolveAlias?: (node: DialPlanNode) => NodeTypeRegistration | undefined;
  /** Override default edge creation for nodes with dynamic exits (e.g., menu per-digit options). */
  createEdgesForNode?: (node: DialPlanNode, nodeMap: Map<string, DialPlanNode>) => Edge[];
  /** Override default config serialization when saving (e.g., rebuild options array from edges). */
  serializeConfig?: (
    node: Node,
    edges: Edge[],
    baseConfig: Record<string, unknown>
  ) => Record<string, unknown>;
  /** Allow direct self-loop edges (source === target). Defaults to false. */
  allowSelfLoop?: boolean;
}

/** Collects resource IDs that need fetching during dial plan load. */
export interface ResourceCollector {
  addSchedule(id: string): void;
  addTarget(id: string): void;
  addAudioClip(id: string): void;
}

/** Resolved resource maps passed to enrichNode. */
export interface ResourceMaps {
  schedules: Map<string, { id: string; name: string }>;
  users: Map<string, { id: string; name?: string; email?: string; extension_number?: string }>;
  audioClips: Map<string, { id: string; name: string }>;
}

/** Context passed to onConfigChange for side-effects. */
export interface ConfigChangeContext {
  setEdges: (updater: (edges: Edge[]) => Edge[]) => void;
  updateNodeInternals: (nodeId: string) => void;
  nodesRef: React.MutableRefObject<Node[]>;
  updateDirty: (nodes: Node[], edges: Edge[]) => void;
}

/** Config exported by each node definition file — everything except `component` (added by registry). */
export interface NodeDefinition extends Omit<NodeTypeRegistration, 'component'> {
  /** Collect resource IDs from this node's config that need fetching. */
  collectResourceIds?: (config: Record<string, unknown>, collector: ResourceCollector) => void;
  /** Enrich flow node data with resolved resource names. */
  enrichNode?: (
    data: Record<string, unknown>,
    maps: ResourceMaps,
    locale: DialPlanLocale
  ) => Record<string, unknown>;
  /** Resolve a source handle ID to a human-readable label for the edge panel. */
  resolveExitLabel?: (handleId: string) => string | undefined;
  /** Side-effects when config changes in the editor (e.g., clean up orphaned edges). */
  onConfigChange?: (
    nodeId: string,
    configUpdates: Record<string, unknown>,
    ctx: ConfigChangeContext
  ) => void;
}
