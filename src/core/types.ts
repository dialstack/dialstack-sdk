/**
 * Core type definitions for the DialStack SDK
 */

import type { Locale } from '../locales';

/**
 * Component tag names for embedded components
 */
export type ComponentTagName = 'call-logs' | 'voicemails';

/**
 * Appearance options for theming components
 */
export interface AppearanceOptions {
  /**
   * Theme variant
   */
  theme?: 'light' | 'dark' | 'auto';

  /**
   * Custom variables for styling
   */
  variables?: {
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
  };
}

// ============================================================================
// Callback Types
// ============================================================================

/**
 * Event fired when a component starts loading
 */
export interface LoaderStart {
  elementTagName: string;
}

/**
 * Event fired when a component fails to load
 */
export interface LoadError {
  error: string;
  elementTagName: string;
}

/**
 * Common callbacks shared by all components
 */
export interface CommonComponentCallbacks {
  onLoaderStart?: (event: LoaderStart) => void;
  onLoadError?: (event: LoadError) => void;
}

/**
 * Voicemails component callbacks
 */
export interface VoicemailsCallbacks extends CommonComponentCallbacks {
  onVoicemailSelect?: (event: { voicemailId: string }) => void;
  onVoicemailPlay?: (event: { voicemailId: string }) => void;
  onVoicemailPause?: (event: { voicemailId: string }) => void;
  onVoicemailDelete?: (event: { voicemailId: string }) => void;
  onCallBack?: (event: { phoneNumber: string }) => void;
}

/**
 * Call log data structure
 */
export interface CallLog {
  id: string;
  user_id?: string;
  endpoint_id?: string;
  did_id?: string;
  direction: 'inbound' | 'outbound' | 'internal';
  from_number: string;
  to_number: string;
  started_at: string;
  answered_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  status: 'completed' | 'no-answer' | 'busy' | 'failed' | 'voicemail';
}

/**
 * CallLogs component callbacks
 */
export interface CallLogsCallbacks extends CommonComponentCallbacks {
  onPageChange?: (event: { offset: number; limit: number }) => void;
  onRowClick?: (event: { callId: string; call: CallLog }) => void;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Formatting options for components
 */
export interface FormattingOptions {
  /**
   * Default country code for phone number formatting (ISO 3166-1 alpha-2)
   * @default 'US'
   */
  defaultCountry?: string;

  /**
   * Locale for date/time formatting (BCP 47 language tag)
   * @default 'en-US'
   */
  dateLocale?: string;

  /**
   * Use 24-hour time format
   * @default false
   */
  use24HourTime?: boolean;

  /**
   * Show timezone in date/time display
   * @default true
   */
  showTimezone?: boolean;
}

/**
 * Component-level configuration
 */
export interface ComponentConfig {
  /**
   * Locale for UI strings
   */
  locale?: Locale;

  /**
   * Formatting options
   */
  formatting?: FormattingOptions;
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
 * Initialization parameters for loadDialstackAndInitialize()
 */
export interface DialStackInitParams {
  /**
   * Your DialStack publishable API key (starts with pk_live_ or pk_test_)
   */
  publishableKey: string;

  /**
   * Function that fetches a client secret from your backend
   */
  fetchClientSecret: () => Promise<string>;

  /**
   * Optional appearance configuration
   */
  appearance?: AppearanceOptions;

  /**
   * Optional API endpoint URL (defaults to https://api.dialstack.ai)
   */
  apiUrl?: string;
}

/**
 * Web Component element types
 */
export interface ComponentElement {
  'call-logs': HTMLElement & {
    setInstance: (instance: DialStackInstanceImpl) => void;
  };
  'voicemails': HTMLElement & {
    setInstance: (instance: DialStackInstanceImpl) => void;
  };
}

/**
 * The DialStack SDK instance returned by loadDialstackAndInitialize()
 */
export interface DialStackInstance {
  /**
   * Create a new embedded component
   *
   * @param tagName - The component type to create
   * @returns The component element
   *
   * @example
   * ```typescript
   * const callLogs = dialstack.create('call-logs');
   * document.getElementById('container').appendChild(callLogs);
   * ```
   */
  create<T extends ComponentTagName>(tagName: T): ComponentElement[T];

  /**
   * Update appearance for all components
   *
   * @param updateOptions - The options to update
   *
   * @example
   * ```typescript
   * dialstack.update({
   *   appearance: {
   *     theme: 'dark',
   *     variables: { colorPrimary: '#6772E5' }
   *   }
   * });
   * ```
   */
  update(updateOptions: UpdateOptions): void;

  /**
   * Log out and clean up the session
   *
   * @returns Promise that resolves when logout is complete
   *
   * @example
   * ```typescript
   * await dialstack.logout();
   * ```
   */
  logout(): Promise<void>;
}

/**
 * Internal session data
 */
export interface SessionData {
  /**
   * Client secret token
   */
  clientSecret: string;

  /**
   * Session expiry timestamp
   */
  expiresAt: Date;
}

/**
 * Internal implementation of DialStackInstance (used by components)
 */
export interface DialStackInstanceImpl extends DialStackInstance {
  /**
   * Get current client secret
   */
  getClientSecret(): Promise<string>;

  /**
   * Get current appearance options
   */
  getAppearance(): AppearanceOptions | undefined;

  /**
   * Make authenticated API request
   */
  fetchApi(path: string, options?: RequestInit): Promise<Response>;
}
