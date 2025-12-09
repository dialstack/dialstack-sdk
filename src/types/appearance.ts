/**
 * Appearance and theming types for DialStack SDK
 */

/**
 * Theme variant for components
 */
export type Theme = 'light' | 'dark' | 'auto';

/**
 * Layout density variant
 */
export type LayoutVariant = 'compact' | 'comfortable' | 'default';

/**
 * CSS variable definitions for theming
 *
 * All values should be valid CSS values (colors, sizes, etc.)
 */
export interface AppearanceVariables {
  // Colors - Primary
  colorPrimary?: string;
  colorPrimaryHover?: string;

  // Colors - Semantic
  colorBackground?: string;
  colorText?: string;
  colorTextSecondary?: string;
  colorDanger?: string;
  colorSuccess?: string;
  colorWarning?: string;

  // Colors - Surface
  colorSurfaceSubtle?: string;
  colorBorder?: string;
  colorBorderSubtle?: string;

  // Typography
  fontFamily?: string;
  fontSizeBase?: string;
  fontSizeSmall?: string;
  fontSizeLarge?: string;
  fontSizeXLarge?: string;
  fontWeightNormal?: string;
  fontWeightMedium?: string;
  fontWeightBold?: string;
  lineHeight?: string;

  // Spacing
  spacingUnit?: string;
  spacingXs?: string;
  spacingSm?: string;
  spacingMd?: string;
  spacingLg?: string;
  spacingXl?: string;

  // Border
  borderRadius?: string;
  borderRadiusSmall?: string;
  borderRadiusLarge?: string;

  // Effects
  transitionDuration?: string;
  focusRingColor?: string;
  focusRingWidth?: string;

  // Icon sizes
  iconSize?: string;
  iconSizeSmall?: string;

  // Player/media controls
  playerButtonSize?: string;
  playerProgressHeight?: string;
  playerProgressHandleSize?: string;

  // Indicators
  unreadIndicatorSize?: string;

  // Spinner
  spinnerSize?: string;

  // Time display
  timeDisplayWidth?: string;
}

/**
 * Appearance options for theming components
 */
export interface AppearanceOptions {
  /**
   * Theme variant
   */
  theme?: Theme;

  /**
   * Custom variables for styling
   */
  variables?: AppearanceVariables;
}

/**
 * Options for updating component appearance
 */
export interface UpdateOptions {
  /**
   * Appearance settings to update
   */
  appearance: AppearanceOptions;
}

/**
 * SVG icon as a string (raw SVG markup)
 */
export type IconString = string;

/**
 * Default icons used by components
 */
export interface ComponentIcons {
  play?: IconString;
  pause?: IconString;
  phone?: IconString;
  trash?: IconString;
  chevronRight?: IconString;
  chevronLeft?: IconString;
  chevronDown?: IconString;
  spinner?: IconString;
  inbound?: IconString;
  outbound?: IconString;
  voicemail?: IconString;
  sparkle?: IconString;
}

// ============================================================================
// CSS Class Customization
// ============================================================================

/**
 * Base CSS class names that can be applied to component states.
 *
 * These classes are applied to the component's container element,
 * allowing integration with external CSS frameworks (Tailwind, Bootstrap, etc.)
 *
 * @example
 * ```typescript
 * // Using with Tailwind CSS
 * classes: {
 *   base: 'rounded-lg border border-gray-200',
 *   loading: 'animate-pulse bg-gray-100',
 *   error: 'border-red-500 bg-red-50',
 *   empty: 'text-gray-400 italic'
 * }
 * ```
 */
export interface BaseComponentClasses {
  /**
   * Base class applied to the container always
   * @default 'dialstack-component'
   */
  base?: string;

  /**
   * Class applied when the component is loading
   * @default 'dialstack-component--loading'
   */
  loading?: string;

  /**
   * Class applied when there's an error
   * @default 'dialstack-component--error'
   */
  error?: string;

  /**
   * Class applied when the component has no data
   * @default 'dialstack-component--empty'
   */
  empty?: string;
}

/**
 * CSS class names for Voicemails component
 */
export interface VoicemailsClasses extends BaseComponentClasses {
  /**
   * Class for the voicemail list container
   * @default 'dialstack-voicemail-list'
   */
  list?: string;

  /**
   * Class for each voicemail item
   * @default 'dialstack-voicemail-item'
   */
  item?: string;

  /**
   * Class for expanded voicemail item
   * @default 'dialstack-voicemail-item--expanded'
   */
  itemExpanded?: string;

  /**
   * Class for unread voicemail item
   * @default 'dialstack-voicemail-item--unread'
   */
  itemUnread?: string;

  /**
   * Class for the audio player
   * @default 'dialstack-voicemail-player'
   */
  player?: string;

  /**
   * Class for action buttons container
   * @default 'dialstack-voicemail-actions'
   */
  actions?: string;
}

/**
 * CSS class names for CallLogs component
 */
export interface CallLogsClasses extends BaseComponentClasses {
  /**
   * Class for the table element
   * @default 'dialstack-call-logs-table'
   */
  table?: string;

  /**
   * Class for table header
   * @default 'dialstack-call-logs-header'
   */
  header?: string;

  /**
   * Class for table rows
   * @default 'dialstack-call-logs-row'
   */
  row?: string;

  /**
   * Class for inbound call rows
   * @default 'dialstack-call-logs-row--inbound'
   */
  rowInbound?: string;

  /**
   * Class for outbound call rows
   * @default 'dialstack-call-logs-row--outbound'
   */
  rowOutbound?: string;

  /**
   * Class for pagination container
   * @default 'dialstack-call-logs-pagination'
   */
  pagination?: string;
}

/**
 * CSS class names for CallHistory component
 */
export interface CallHistoryClasses extends BaseComponentClasses {
  /**
   * Class for the call history list container
   * @default 'dialstack-call-history-list'
   */
  list?: string;

  /**
   * Class for each call history item
   * @default 'dialstack-call-history-item'
   */
  item?: string;

  /**
   * Class for inbound call items
   * @default 'dialstack-call-history-item--inbound'
   */
  itemInbound?: string;

  /**
   * Class for outbound call items
   * @default 'dialstack-call-history-item--outbound'
   */
  itemOutbound?: string;

  /**
   * Class for missed call items
   * @default 'dialstack-call-history-item--missed'
   */
  itemMissed?: string;

  /**
   * Class for voicemail call items
   * @default 'dialstack-call-history-item--voicemail'
   */
  itemVoicemail?: string;

  /**
   * Class for direction icon
   * @default 'dialstack-call-history-icon'
   */
  icon?: string;

  /**
   * Class for time display
   * @default 'dialstack-call-history-time'
   */
  time?: string;

  /**
   * Class for duration display
   * @default 'dialstack-call-history-duration'
   */
  duration?: string;
}
