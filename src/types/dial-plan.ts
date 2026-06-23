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
 * Exits: open (business hours), closed, and optionally holiday. Holiday is
 * per-node opt-in — when unset, holiday state folds into closed.
 */
export interface ScheduleNodeConfig {
  /** Reference to the schedule definition */
  schedule?: string;
  /** @deprecated Use `schedule`. Retained for backwards compatibility. */
  schedule_id: string;
  /** Node ID to route to when schedule is open */
  open?: string;
  /** Node ID to route to when schedule is closed */
  closed?: string;
  /**
   * Node ID to route to when schedule is on holiday. Optional: when omitted,
   * holiday state folds into the closed exit. Set to route holidays to a
   * dedicated branch (e.g., a "closed for holiday" announcement).
   */
  holiday?: string | null;
}

/**
 * Configuration for an internal dial node that rings a user or group.
 * Has optional timeout handling with next node routing.
 */
export interface InternalDialNodeConfig {
  /** User ID, group ID, or dial plan ID to dial */
  target?: string;
  /** @deprecated Use `target`. Retained for backwards compatibility. */
  target_id: string;
  /** Timeout in seconds before routing to next node */
  timeout?: number;
  /** Node ID to route to on timeout or busy */
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
  /** Node ID to route to on timeout or busy */
  next?: string;
}

/**
 * Configuration for a ring-all-users node that rings every user in the account.
 */
export interface RingAllUsersNodeConfig {
  /** Timeout in seconds before routing to next node */
  timeout: number;
  /** Node ID to route to on timeout or busy */
  next?: string;
}

/**
 * A single DTMF option in a menu node.
 */
export interface MenuOption {
  /** DTMF digit: "0"-"9", "*", or "#" */
  digit: string;
  /** Node ID to route to when this digit is pressed */
  next_node?: string;
  /** Optional display label shown next to the digit on the node (max 20 chars) */
  label?: string;
}

/**
 * Configuration for a menu (IVR) node that plays a prompt and routes by keypress.
 */
export interface MenuNodeConfig {
  /** Audio clip ID for the menu prompt */
  prompt_clip?: string;
  /** @deprecated Use `prompt_clip`. Retained for backwards compatibility. */
  prompt_clip_id: string;
  /** Seconds to wait for input (1-30) */
  timeout: number;
  /** DTMF digit options */
  options: MenuOption[];
  /** Node ID to route to on timeout (nil = replay prompt) */
  timeout_next_node?: string;
  /** Node ID to route to on invalid input (nil = replay prompt) */
  invalid_next_node?: string;
}

/**
 * Configuration for an audio clip node that plays an audio clip.
 */
export interface AudioClipNodeConfig {
  /** Audio clip ID to play */
  clip?: string;
  /** @deprecated Use `clip`. Retained for backwards compatibility. */
  clip_id: string;
  /** Node ID to route to after playback (nil = terminate) */
  next?: string;
}

/**
 * Configuration for a voice_app node. Dispatches the call to a webhook-driven
 * voice application; behavior depends on `mode`.
 */
export interface VoiceAppNodeConfig {
  /** ID of the voice app to invoke (va_ prefix) */
  voice_app?: string;
  /** @deprecated Use `voice_app`. Retained for backwards compatibility. */
  voice_app_id: string;
  /**
   * Dispatch mode:
   * - `control` (default): hands the call to the voice app. ARI answers and
   *   plays hold; the customer drives the call via the Update Call API.
   * - `notify`: fires a `call.notify` webhook for visibility (BYO Observer,
   *   transcription, analytics) while the dial plan continues routing via
   *   `next`. The call is never answered or held by this node.
   */
  mode?: 'control' | 'notify';
  /**
   * In `notify` mode, the always-taken continuation. In `control` mode, the
   * fallback on dispatch failure or when the node is unconfigured. Omitting
   * `next` terminates the call.
   */
  next?: string;
}

/**
 * Configuration for a hang_up node. Terminates the call with normal clearing.
 * Zero-config; the empty object `{}` is the canonical wire form.
 */
export type HangUpNodeConfig = Record<string, never>;

// ============================================================================
// Dial Plan Node Types
// ============================================================================

/** Supported dial plan node types (as sent by the API) */
export type DialPlanNodeType =
  | 'schedule'
  | 'internal_dial'
  | 'ring_all_users'
  | 'external_dial'
  | 'menu'
  | 'audio_clip'
  | 'voice_app'
  | 'hang_up';

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
 * A menu (IVR) node in the dial plan.
 */
export interface MenuNode extends DialPlanNodeBase {
  type: 'menu';
  config: MenuNodeConfig;
}

/**
 * An audio clip node in the dial plan.
 */
export interface AudioClipNode extends DialPlanNodeBase {
  type: 'audio_clip';
  config: AudioClipNodeConfig;
}

/**
 * A voice_app node in the dial plan.
 */
export interface VoiceAppNode extends DialPlanNodeBase {
  type: 'voice_app';
  config: VoiceAppNodeConfig;
}

/**
 * A hang_up node in the dial plan. Terminates the call with normal clearing.
 */
export interface HangUpNode extends DialPlanNodeBase {
  type: 'hang_up';
  config: HangUpNodeConfig;
}

/**
 * Union type for all dial plan node types.
 */
export type DialPlanNode =
  | ScheduleNode
  | InternalDialNode
  | RingAllUsersNode
  | ExternalDialNode
  | MenuNode
  | AudioClipNode
  | VoiceAppNode
  | HangUpNode;

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
    menu: string;
    audioClip: string;
    hangUp: string;
  };
  exits: {
    open: string;
    closed: string;
    holiday: string;
    next: string;
    timeout: string;
    invalid: string;
  };
  nodeDescriptions: {
    schedule: string;
    internalDial: string;
    voicemail: string;
    ringAllUsers: string;
    externalDial: string;
    voiceApp: string;
    menu: string;
    audioClip: string;
    hangUp: string;
  };
  targetTypes: {
    user: string;
    ringGroup: string;
    dialPlan: string;
    queue: string;
    voiceApp: string;
    sharedVoicemail: string;
  };
  resourceGroups: {
    users: string;
    ringGroups: string;
    dialPlans: string;
    queues: string;
    voiceApps: string;
    sharedVoicemails: string;
    schedules: string;
    audioClips: string;
  };
  configLabels: {
    timeout: string;
    target: string;
    schedule: string;
    search: string;
    searchTargets: string;
    searchSchedules: string;
    openInNewTab: string;
    promptClip: string;
    audioClip: string;
    digit: string;
    options: string;
    addOption: string;
    removeOption: string;
    optionLabel: string;
    optionLabelPlaceholder: string;
    routeHolidaySeparately: string;
    routeHolidaySeparatelyHint: string;
    mode: string;
  };
  voiceAppMode: {
    control: string;
    notify: string;
    controlBadge: string;
    notifyBadge: string;
    controlHint: string;
    notifyHint: string;
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
  | 'voiceApp'
  | 'menu'
  | 'audioClip'
  | 'hangUp';

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
  /** Editor hint: render the holiday exit handle when true. */
  holidayEnabled?: boolean;
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
  voiceAppId: string;
  voiceAppName?: string;
  originalNode: VoiceAppNode;
  locale?: DialPlanLocale;
}

/**
 * Data payload for a Menu node in the graph.
 */
export interface MenuNodeData extends Record<string, unknown> {
  label: string;
  promptClipId: string;
  promptClipName?: string;
  timeout: number;
  options: MenuOption[];
  originalNode: MenuNode;
  locale?: DialPlanLocale;
}

/**
 * Data payload for an Audio Clip node in the graph.
 */
export interface AudioClipNodeData extends Record<string, unknown> {
  label: string;
  clipId: string;
  clipName?: string;
  originalNode: AudioClipNode;
  locale?: DialPlanLocale;
}

/**
 * Data payload for a Hang Up node in the graph.
 */
export interface HangUpNodeData extends Record<string, unknown> {
  label: string;
  originalNode: HangUpNode;
  locale?: DialPlanLocale;
}

/** Union type for all graph node data */
export type GraphNodeData =
  | StartNodeData
  | ScheduleNodeData
  | InternalDialNodeData
  | RingAllUsersNodeData
  | ExternalDialNodeData
  | VoiceAppNodeData
  | MenuNodeData
  | AudioClipNodeData
  | HangUpNodeData;

// ============================================================================
// Component Types
// ============================================================================

/** Display mode for the DialPlan component */
export type DialPlanMode = 'view' | 'edit' | 'preview';

/** Imperative handle exposed via ref on the DialPlan component */
export interface DialPlanHandle {
  /** Trigger a save programmatically. Resolves when save succeeds, rejects on error. */
  save: () => Promise<void>;
}

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
