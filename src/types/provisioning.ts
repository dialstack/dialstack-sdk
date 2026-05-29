/**
 * Provisioning Configuration Types
 *
 * Types for device provisioning settings that mirror the API's DeviceSettings model.
 * These types support a 4-level configuration inheritance chain:
 * Global -> Platform -> Account -> Device
 *
 * Merge semantics:
 * - All fields are optional - omitting a field means "inherit from parent layer"
 * - Non-nil fields override the parent value
 *
 * @example
 * ```typescript
 * // Platform-level settings: set regional defaults for all devices
 * const platformSettings: DeviceSettings = {
 *   abstractions: {
 *     regional: {
 *       timezone: 'America/New_York',
 *       language: 'en-US',
 *     },
 *   },
 * };
 *
 * // Device-level override: this specific phone uses a different timezone
 * const deviceSettings: DeviceSettings = {
 *   abstractions: {
 *     regional: {
 *       timezone: 'America/Los_Angeles',
 *     },
 *   },
 * };
 * ```
 */

// ============================================================================
// Settings Types
// ============================================================================

/**
 * Jitter buffer mode for handling network jitter in RTP streams.
 *
 * - `adaptive`: Dynamically adjusts buffer size based on network conditions (recommended)
 * - `fixed`: Uses a fixed buffer size
 */
export type JitterBufferMode = 'adaptive' | 'fixed';

/**
 * Jitter buffer configuration for RTP audio streams.
 */
export interface JitterBuffer {
  /**
   * Buffer mode: adaptive adjusts to network conditions, fixed uses static values.
   */
  mode?: JitterBufferMode;
  /**
   * Minimum playout delay in milliseconds (typically 40-80ms).
   */
  minMs?: number;
  /**
   * Maximum buffer depth in milliseconds (typically 150-300ms).
   */
  maxMs?: number;
}

/**
 * Audio-related device configuration.
 */
export interface AudioSettings {
  /**
   * Voice Activity Detection (silence suppression).
   * When true, suppresses transmission during silence to save bandwidth.
   */
  vadEnabled?: boolean;
  /**
   * Acoustic echo cancellation.
   * Should typically be enabled for speakerphone use.
   */
  echoCancellation?: boolean;
  /**
   * Jitter buffer configuration for handling network delay variation.
   */
  jitterBuffer?: JitterBuffer;
}

/**
 * Time format for phone display.
 *
 * - `12h`: 12-hour format with AM/PM (e.g., "2:30 PM")
 * - `24h`: 24-hour format (e.g., "14:30")
 */
export type TimeFormat = '12h' | '24h';

/**
 * Date format for phone display.
 *
 * - `M/D/Y`: Month/Day/Year (US format)
 * - `D/M/Y`: Day/Month/Year (European format)
 * - `Y-M-D`: Year-Month-Day (ISO format)
 */
export type DateFormat = 'M/D/Y' | 'D/M/Y' | 'Y-M-D';

/**
 * Backlight brightness level.
 */
export type BacklightLevel = 'low' | 'medium' | 'high';

/**
 * Display-related device configuration.
 */
export interface DisplaySettings {
  /**
   * Time format for the phone's clock display.
   */
  timeFormat?: TimeFormat;
  /**
   * Date format for the phone's date display.
   */
  dateFormat?: DateFormat;
  /**
   * Seconds before the backlight dims/turns off (0 = always on).
   */
  backlightTimeout?: number;
  /**
   * Backlight brightness level.
   */
  backlightLevel?: BacklightLevel;
}

/**
 * Regional/localization device configuration.
 */
export interface RegionalSettings {
  /**
   * IANA timezone identifier (e.g., "America/New_York", "Europe/London").
   * @see https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
   */
  timezone?: string;
  /**
   * BCP 47 language code (e.g., "en-US", "de-DE", "fr-FR").
   * Controls menu language and text-to-speech locale.
   */
  language?: string;
  /**
   * ISO 3166-1 alpha-2 country code for telephony tones (e.g., "us", "gb", "de").
   * Controls dial tone, busy tone, and ringback tone patterns.
   */
  toneScheme?: string;
}

/**
 * Network-related device configuration.
 */
export interface NetworkSettings {
  /**
   * VLAN ID for phone traffic (1-4094). Omit for untagged traffic.
   */
  vlanId?: number;
  /**
   * DSCP value for SIP signaling packets (0-63).
   * Recommended: 26 (AF31) for signaling.
   */
  qosDscpSip?: number;
  /**
   * DSCP value for RTP media packets (0-63).
   * Recommended: 46 (EF) for voice media.
   */
  qosDscpRtp?: number;
  /**
   * Enable RTCP for quality metrics (MOS scores). Defaults to true.
   */
  rtcpEnabled?: boolean;
}

/**
 * Feature availability settings.
 * These control whether features are exposed on the phone UI.
 * Note: Enabling a feature here makes it available, it does not activate it.
 */
export interface FeatureSettings {
  /**
   * Enable Do Not Disturb button/function.
   */
  dndEnabled?: boolean;
  /**
   * Enable call waiting notification and toggle.
   */
  callWaitingEnabled?: boolean;
  /**
   * Enable call forwarding configuration.
   */
  callForwardEnabled?: boolean;
  /**
   * Enable auto-answer for intercom calls.
   */
  autoAnswerEnabled?: boolean;
  /**
   * Enable SRTP (encrypted media).
   * Note: Requires server-side SRTP support.
   */
  srtpEnabled?: boolean;
}

/**
 * Vendor-agnostic device settings.
 * These settings are translated to vendor-specific configuration by the provisioning system.
 */
export interface AbstractSettings {
  /**
   * Audio settings (VAD, echo cancellation, jitter buffer).
   */
  audio?: AudioSettings;
  /**
   * Display settings (time/date format, backlight).
   */
  display?: DisplaySettings;
  /**
   * Regional settings (timezone, language, tone scheme).
   */
  regional?: RegionalSettings;
  /**
   * Network settings (VLAN, QoS, NTP).
   */
  network?: NetworkSettings;
  /**
   * Feature availability settings.
   */
  features?: FeatureSettings;
}

// ============================================================================
// Top-Level Device Settings
// ============================================================================

/**
 * Complete device settings configuration.
 *
 * This type is used at all levels of the configuration hierarchy:
 * - Platform level: Sets defaults for all devices in the platform
 * - Account level: Sets defaults for all devices in the account
 * - Device level: Sets overrides for a specific device
 *
 * All fields are optional. Omitting a field means "inherit from parent layer".
 * The server resolves the final configuration by merging: Global -> Platform -> Account -> Device
 *
 * @example
 * ```typescript
 * // Account-wide settings
 * const accountSettings: DeviceSettings = {
 *   abstractions: {
 *     regional: {
 *       timezone: 'America/Chicago',
 *       language: 'en-US',
 *     },
 *     features: {
 *       callWaitingEnabled: true,
 *       dndEnabled: true,
 *     },
 *   },
 * };
 *
 * // Device-specific override
 * const deviceSettings: DeviceSettings = {
 *   abstractions: {
 *     display: {
 *       backlightLevel: 'low', // This device is in a dark room
 *     },
 *   },
 * };
 * ```
 */
export interface DeviceSettings {
  /**
   * Vendor-agnostic settings that are translated to device-specific configuration.
   */
  abstractions?: AbstractSettings;
}
