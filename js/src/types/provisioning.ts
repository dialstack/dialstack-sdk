/**
 * Provisioning Configuration Types
 *
 * Types for device provisioning settings that mirror the API's DeviceSettings model.
 * Keys are snake_case, exactly as they travel on the wire: the SDK sends these
 * objects as-is, so a key spelled any other way is ignored by the server.
 *
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
 * Audio codec offered by the phone.
 */
export type AudioCodec = 'PCMU' | 'PCMA';

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
  min_ms?: number;
  /**
   * Maximum buffer depth in milliseconds (typically 150-300ms).
   */
  max_ms?: number;
}

/**
 * Audio-related device configuration.
 */
export interface AudioSettings {
  /**
   * Codecs the phone offers, in order of preference. Replaces the parent
   * layer's list entirely rather than merging with it.
   */
  codecs?: AudioCodec[];
  /**
   * Voice Activity Detection (silence suppression).
   * When true, suppresses transmission during silence to save bandwidth.
   */
  vad_enabled?: boolean;
  /**
   * Acoustic echo cancellation.
   * Should typically be enabled for speakerphone use.
   */
  echo_cancellation?: boolean;
  /**
   * Jitter buffer configuration for handling network delay variation.
   */
  jitter_buffer?: JitterBuffer;
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
  time_format?: TimeFormat;
  /**
   * Date format for the phone's date display.
   */
  date_format?: DateFormat;
  /**
   * Seconds before the backlight dims/turns off (0 = always on).
   */
  backlight_timeout?: number;
  /**
   * Backlight brightness level.
   */
  backlight_level?: BacklightLevel;
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
  tone_scheme?: string;
}

/**
 * SIP signaling transport the phone uses to reach the registrar.
 */
export type SipTransport = 'udp' | 'tcp' | 'tls';

/**
 * Network-related device configuration.
 */
export interface NetworkSettings {
  /**
   * VLAN ID for phone traffic (1-4094). Omit for untagged traffic.
   */
  vlan_id?: number;
  /**
   * DSCP value for SIP signaling packets (0-63).
   * Recommended: 26 (AF31) for signaling.
   */
  qos_dscp_sip?: number;
  /**
   * DSCP value for RTP media packets (0-63).
   * Recommended: 46 (EF) for voice media.
   */
  qos_dscp_rtp?: number;
  /**
   * Enable RTCP for quality metrics (MOS scores). Defaults to true.
   */
  rtcp_enabled?: boolean;
  /**
   * SIP signaling transport. When omitted, the platform default applies.
   * `tls` is served only to models that support encrypted signaling.
   */
  sip_transport?: SipTransport;
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
  dnd_enabled?: boolean;
  /**
   * Enable call waiting notification and toggle.
   */
  call_waiting_enabled?: boolean;
  /**
   * Enable call forwarding configuration.
   */
  call_forward_enabled?: boolean;
  /**
   * Enable auto-answer for intercom calls.
   */
  auto_answer_enabled?: boolean;
  /**
   * Enable SRTP (encrypted media).
   * Note: Requires server-side SRTP support.
   */
  srtp_enabled?: boolean;
  /**
   * Play a dial tone on the handset while a call is on hold, as a cue that a
   * second number can be dialled. Disabled by default; honoured on Snom desk
   * phones.
   */
  call_waiting_dialtone_enabled?: boolean;
  /**
   * Ring silently for calls that reach the phone through a ring group, while
   * every other call keeps its normal ringtone. A silent call still shows on
   * the screen, flashes the LED and is logged as missed. Disabled by default;
   * honoured on Snom and Yealink desk phones.
   */
  ring_group_silent_ring_enabled?: boolean;
}

/**
 * What an automatic resync fetches.
 */
export type ResyncMode = 'config_and_firmware' | 'configuration' | 'firmware';

/**
 * Automatic resync and firmware update settings.
 */
export interface ProvisioningSettings {
  /**
   * Time of day to resync configuration (HH:MM in 24-hour format, phone local time).
   */
  resync_time?: string;
  /**
   * What to resync: configuration, firmware, or both.
   */
  resync_mode?: ResyncMode;
  /**
   * Check for new configuration when the phone boots.
   */
  bootup_check_enabled?: boolean;
}

/**
 * Vendor-agnostic device settings.
 * These settings are translated to vendor-specific configuration by the provisioning system.
 */
export interface AbstractSettings {
  /**
   * Audio settings (codecs, VAD, echo cancellation, jitter buffer).
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
   * Network settings (VLAN, QoS, SIP transport).
   */
  network?: NetworkSettings;
  /**
   * Feature availability settings.
   */
  features?: FeatureSettings;
  /**
   * Automatic resync settings.
   */
  provisioning?: ProvisioningSettings;
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
 *       call_waiting_enabled: true,
 *       dnd_enabled: true,
 *     },
 *   },
 * };
 *
 * // Device-specific override: ring group calls ring silently on this phone
 * const deviceSettings: DeviceSettings = {
 *   abstractions: {
 *     features: {
 *       ring_group_silent_ring_enabled: true,
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
