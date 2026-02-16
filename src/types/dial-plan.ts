/**
 * Dial Plan Types
 *
 * Types for representing dial plans and their visual representation
 * in the DialPlanViewer component.
 */

// ============================================================================
// Node Configuration Types
// ============================================================================

/**
 * Configuration for a schedule node that routes calls based on time schedules.
 * Has three possible exits: open (business hours), closed, and holiday.
 */
export interface ScheduleNodeConfig {
  /** Reference to the schedule definition */
  schedule_id: string;
  /** Node ID to route to when schedule is open */
  open?: string;
  /** Node ID to route to when schedule is closed */
  closed?: string;
  /** Node ID to route to on holidays */
  holiday?: string;
}

/**
 * Configuration for an internal dial node that rings a user or group.
 * Has optional timeout handling with next node routing.
 */
export interface InternalDialNodeConfig {
  /** User ID, group ID, or dial plan ID to dial */
  target_id: string;
  /** Timeout in seconds before routing to next node */
  timeout?: number;
  /** Node ID to route to on timeout/no answer */
  next?: string;
}

// ============================================================================
// Dial Plan Node Types
// ============================================================================

/** Supported dial plan node types */
export type DialPlanNodeType = 'schedule' | 'internal_dial';

/**
 * Base interface for all dial plan nodes.
 */
interface DialPlanNodeBase {
  /** Unique identifier for this node within the dial plan */
  id: string;
  /** Optional position for visual layout (if not provided, auto-layout is used) */
  position?: { x: number; y: number };
}

/**
 * A schedule node in the dial plan.
 */
export interface ScheduleNode extends DialPlanNodeBase {
  type: 'schedule';
  config: ScheduleNodeConfig;
}

/**
 * An internal dial node in the dial plan.
 */
export interface InternalDialNode extends DialPlanNodeBase {
  type: 'internal_dial';
  config: InternalDialNodeConfig;
}

/**
 * Union type for all dial plan node types.
 */
export type DialPlanNode = ScheduleNode | InternalDialNode;

// ============================================================================
// Dial Plan Types
// ============================================================================

/**
 * A complete dial plan definition.
 */
export interface DialPlan {
  /** Unique identifier for the dial plan */
  id: string;
  /** Human-readable name for the dial plan */
  name: string;
  /** ID of the first node to execute when a call enters this dial plan */
  entry_node: string;
  /** Array of nodes that make up this dial plan */
  nodes: DialPlanNode[];
  /** ISO timestamp of when the dial plan was created */
  created_at: string;
  /** ISO timestamp of when the dial plan was last updated */
  updated_at: string;
}

// ============================================================================
// Component Props Types
// ============================================================================

/** Locale strings for dial plan nodes */
export interface DialPlanLocale {
  nodeTypes: {
    start: string;
    schedule: string;
    internalDial: string;
    voicemail: string;
  };
  exits: {
    open: string;
    closed: string;
    holiday: string;
    next: string;
    timeout: string;
  };
}

/**
 * Props for the DialPlanViewer React component.
 */
export interface DialPlanViewerProps {
  /** The ID of the dial plan to fetch and display */
  dialPlanId: string;
  /** Whether the viewer is in read-only mode (default: true) */
  readonly?: boolean;
  /** Whether to show the minimap for navigation (default: false) */
  showMinimap?: boolean;
  /** Locale strings for node labels and exits */
  locale?: DialPlanLocale;
  /** Callback fired when a node is clicked */
  onNodeClick?: (nodeId: string, node: DialPlanNode) => void;
  /** Callback fired when the dial plan starts loading */
  onLoaderStart?: () => void;
  /** Callback fired when the dial plan finishes loading */
  onLoaderEnd?: (dialPlan: DialPlan) => void;
  /** Callback fired when there's an error loading the dial plan */
  onLoadError?: (error: Error) => void;
  /** Optional CSS class name for the container */
  className?: string;
  /** Optional inline styles for the container */
  style?: React.CSSProperties;
}

// ============================================================================
// Graph Node Types (for React Flow)
// ============================================================================

/** Types of nodes in the visual graph */
export type GraphNodeType = 'start' | 'schedule' | 'internalDial';

/**
 * Data payload for the Start node.
 */
export interface StartNodeData extends Record<string, unknown> {
  label: string;
  locale?: DialPlanLocale;
}

/**
 * Data payload for a Schedule node in the graph.
 */
export interface ScheduleNodeData extends Record<string, unknown> {
  label: string;
  scheduleId: string;
  scheduleName?: string;
  originalNode: ScheduleNode;
  locale?: DialPlanLocale;
}

/**
 * Data payload for an Internal Dial node in the graph.
 */
export interface InternalDialNodeData extends Record<string, unknown> {
  label: string;
  targetId: string;
  targetName?: string;
  targetType?: string;
  timeout?: number;
  originalNode: InternalDialNode;
  locale?: DialPlanLocale;
}

/** Union type for all graph node data */
export type GraphNodeData = StartNodeData | ScheduleNodeData | InternalDialNodeData;

/** Edge labels for schedule exits */
export type ScheduleExitType = 'open' | 'closed' | 'holiday';

/** Edge labels for internal dial exits */
export type InternalDialExitType = 'next' | 'timeout';

// ============================================================================
// Extension Types
// ============================================================================

/**
 * Extension status
 */
export type ExtensionStatus = 'active' | 'inactive';

/**
 * An extension maps a short dial code to a target (user, dial plan, or voice app).
 */
export interface Extension {
  /** The extension number (dial code) */
  number: string;
  /** The target ID (user, dial plan, or voice app) */
  target: string;
  /** Extension status */
  status: ExtensionStatus;
  /** ISO timestamp of when the extension was created */
  created_at: string;
  /** ISO timestamp of when the extension was last updated */
  updated_at: string;
}

/**
 * Paginated list response for extensions
 */
export interface ExtensionListResponse {
  object: 'list';
  url: string;
  next_page_url: string | null;
  previous_page_url: string | null;
  data: Extension[];
}
