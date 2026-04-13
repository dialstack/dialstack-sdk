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
 * Has two possible exits: open (business hours) and closed (including holidays).
 */
export interface ScheduleNodeConfig {
  /** Reference to the schedule definition */
  schedule_id: string;
  /** Node ID to route to when schedule is open */
  open?: string;
  /** Node ID to route to when schedule is closed or on holiday */
  closed?: string;
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

/**
 * Configuration for an external dial node that dials an external PSTN number.
 * Has optional timeout handling with next node routing.
 */
export interface ExternalDialNodeConfig {
  /** E.164 formatted phone number to dial (e.g., +14155551234) */
  phone_number: string;
  /** Timeout in seconds before routing to next node (1-120) */
  timeout: number;
  /** Node ID to route to on timeout/no answer */
  next?: string;
}

/**
 * Configuration for a ring-all-users node that rings every user in the account.
 */
export interface RingAllUsersNodeConfig {
  /** Timeout in seconds before routing to next node */
  timeout: number;
  /** Node ID to route to on timeout/no answer */
  next?: string;
}

// ============================================================================
// Dial Plan Node Types
// ============================================================================

/** Supported dial plan node types (as sent by the API) */
export type DialPlanNodeType = 'schedule' | 'internal_dial' | 'ring_all_users' | 'external_dial';

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
 * A ring-all-users node in the dial plan.
 */
export interface RingAllUsersNode extends DialPlanNodeBase {
  type: 'ring_all_users';
  config: RingAllUsersNodeConfig;
}

/**
 * An external dial node in the dial plan.
 */
export interface ExternalDialNode extends DialPlanNodeBase {
  type: 'external_dial';
  config: ExternalDialNodeConfig;
}

/**
 * Union type for all dial plan node types.
 */
export type DialPlanNode = ScheduleNode | InternalDialNode | RingAllUsersNode | ExternalDialNode;

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
    externalDial: string;
    ringAllUsers: string;
    voiceApp: string;
  };
  exits: {
    open: string;
    closed: string;
    next: string;
    timeout: string;
  };
  nodeDescriptions: {
    schedule: string;
    internalDial: string;
    voicemail: string;
    ringAllUsers: string;
    externalDial: string;
    voiceApp: string;
  };
  targetTypes: {
    user: string;
    ringGroup: string;
    dialPlan: string;
    voiceApp: string;
    sharedVoicemail: string;
  };
  resourceGroups: {
    users: string;
    ringGroups: string;
    dialPlans: string;
    voiceApps: string;
    sharedVoicemails: string;
    schedules: string;
  };
  configLabels: {
    timeout: string;
    target: string;
    schedule: string;
    search: string;
    searchTargets: string;
    searchSchedules: string;
    openInNewTab: string;
  };
  toolbar: {
    autoLayout: string;
    save: string;
  };
  panel: {
    delete_: string;
    close: string;
    connection: string;
    from: string;
    exit: string;
    to: string;
  };
  combobox: {
    select: string;
    search: string;
    noResults: string;
    loading: string;
    createNew: string;
    extensionLabel: string;
    noName: string;
  };
  status: {
    loading: string;
    loadError: string;
    notFound: string;
    saveError: string;
    newDialPlan: string;
  };
}

// ============================================================================
// Graph Node Types (for React Flow)
// ============================================================================

/** Types of nodes in the visual graph */
export type GraphNodeType =
  | 'start'
  | 'schedule'
  | 'internalDial'
  | 'ringAllUsers'
  | 'voicemail'
  | 'externalDial'
  | 'voiceApp';

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

/**
 * Data payload for a Ring All Users node in the graph.
 */
export interface RingAllUsersNodeData extends Record<string, unknown> {
  label: string;
  timeout: number;
  originalNode: RingAllUsersNode;
  locale?: DialPlanLocale;
}

/**
 * Data payload for an External Dial node in the graph.
 */
export interface ExternalDialNodeData extends Record<string, unknown> {
  label: string;
  phoneNumber: string;
  timeout: number;
  originalNode: ExternalDialNode;
  locale?: DialPlanLocale;
}

/**
 * Data payload for a Voice App node in the graph.
 */
export interface VoiceAppNodeData extends Record<string, unknown> {
  label: string;
  targetId: string;
  targetName?: string;
  timeout?: number;
  originalNode: InternalDialNode;
  locale?: DialPlanLocale;
}

/** Union type for all graph node data */
export type GraphNodeData =
  | StartNodeData
  | ScheduleNodeData
  | InternalDialNodeData
  | RingAllUsersNodeData
  | ExternalDialNodeData
  | VoiceAppNodeData;

/** Edge labels for schedule exits */
export type ScheduleExitType = 'open' | 'closed';

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
