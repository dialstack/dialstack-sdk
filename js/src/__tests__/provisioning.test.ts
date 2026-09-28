/**
 * Type-level tests for provisioning configuration types.
 * These tests verify that the types compile correctly and
 * match the expected structure from the API.
 */

import type {
  JitterBufferMode,
  JitterBuffer,
  AudioSettings,
  TimeFormat,
  DateFormat,
  BacklightLevel,
  DisplaySettings,
  RegionalSettings,
  NetworkSettings,
  FeatureSettings,
  AbstractSettings,
  DeviceSettings,
} from '../types/provisioning';

describe('Provisioning Types', () => {
  describe('DeviceSettings', () => {
    it('allows empty object (inherit all from parent)', () => {
      const settings: DeviceSettings = {};
      expect(settings).toEqual({});
    });

    it('allows partial abstractions (sparse override)', () => {
      const settings: DeviceSettings = {
        abstractions: {
          regional: {
            timezone: 'America/Los_Angeles',
          },
        },
      };
      expect(settings.abstractions?.regional?.timezone).toBe('America/Los_Angeles');
    });

    it('allows full configuration', () => {
      const settings: DeviceSettings = {
        abstractions: {
          audio: {
            vad_enabled: false,
            echo_cancellation: true,
            jitter_buffer: {
              mode: 'adaptive',
              min_ms: 40,
              max_ms: 200,
            },
          },
          display: {
            time_format: '24h',
            date_format: 'Y-M-D',
            backlight_timeout: 60,
            backlight_level: 'medium',
          },
          regional: {
            timezone: 'Europe/London',
            language: 'en-GB',
            tone_scheme: 'gb',
          },
          network: {
            vlan_id: 100,
            qos_dscp_sip: 26,
            qos_dscp_rtp: 46,
            rtcp_enabled: true,
          },
          features: {
            dnd_enabled: true,
            call_waiting_enabled: true,
            call_forward_enabled: true,
            auto_answer_enabled: false,
            srtp_enabled: true,
          },
        },
      };

      expect(settings.abstractions?.audio?.jitter_buffer?.mode).toBe('adaptive');
      expect(settings.abstractions?.network?.vlan_id).toBe(100);
    });
  });

  describe('Type exports from index', () => {
    it('all types can be imported from types/index', async () => {
      // Dynamic import to verify types are exported
      const types = await import('../types');

      // Type-only exports won't appear at runtime,
      // but this verifies the module loads without error
      expect(types).toBeDefined();
    });
  });

  describe('Type compile checks', () => {
    it('JitterBufferMode accepts valid values', () => {
      const adaptive: JitterBufferMode = 'adaptive';
      const fixed: JitterBufferMode = 'fixed';
      expect(adaptive).toBe('adaptive');
      expect(fixed).toBe('fixed');
    });

    it('TimeFormat accepts valid values', () => {
      const h12: TimeFormat = '12h';
      const h24: TimeFormat = '24h';
      expect(h12).toBe('12h');
      expect(h24).toBe('24h');
    });

    it('DateFormat accepts valid values', () => {
      const mdy: DateFormat = 'M/D/Y';
      const dmy: DateFormat = 'D/M/Y';
      const ymd: DateFormat = 'Y-M-D';
      expect(mdy).toBe('M/D/Y');
      expect(dmy).toBe('D/M/Y');
      expect(ymd).toBe('Y-M-D');
    });

    it('BacklightLevel accepts valid values', () => {
      const low: BacklightLevel = 'low';
      const medium: BacklightLevel = 'medium';
      const high: BacklightLevel = 'high';
      expect(low).toBe('low');
      expect(medium).toBe('medium');
      expect(high).toBe('high');
    });

    it('JitterBuffer interface works with all optional fields', () => {
      const empty: JitterBuffer = {};
      const partial: JitterBuffer = { mode: 'adaptive' };
      const full: JitterBuffer = { mode: 'fixed', min_ms: 40, max_ms: 200 };
      expect(empty).toEqual({});
      expect(partial.mode).toBe('adaptive');
      expect(full.max_ms).toBe(200);
    });

    it('AudioSettings interface works with all optional fields', () => {
      const empty: AudioSettings = {};
      const partial: AudioSettings = { vad_enabled: true };
      const full: AudioSettings = {
        vad_enabled: false,
        echo_cancellation: true,
        jitter_buffer: { mode: 'adaptive' },
      };
      expect(empty).toEqual({});
      expect(partial.vad_enabled).toBe(true);
      expect(full.jitter_buffer?.mode).toBe('adaptive');
    });

    it('DisplaySettings interface works with all optional fields', () => {
      const empty: DisplaySettings = {};
      const full: DisplaySettings = {
        time_format: '24h',
        date_format: 'Y-M-D',
        backlight_timeout: 30,
        backlight_level: 'high',
      };
      expect(empty).toEqual({});
      expect(full.time_format).toBe('24h');
    });

    it('RegionalSettings interface works with all optional fields', () => {
      const empty: RegionalSettings = {};
      const full: RegionalSettings = {
        timezone: 'America/New_York',
        language: 'en-US',
        tone_scheme: 'us',
      };
      expect(empty).toEqual({});
      expect(full.timezone).toBe('America/New_York');
    });

    it('NetworkSettings interface works with all optional fields', () => {
      const empty: NetworkSettings = {};
      const full: NetworkSettings = {
        vlan_id: 100,
        qos_dscp_sip: 26,
        qos_dscp_rtp: 46,
        rtcp_enabled: true,
      };
      expect(empty).toEqual({});
      expect(full.vlan_id).toBe(100);
      expect(full.rtcp_enabled).toBe(true);
    });

    it('FeatureSettings interface works with all optional fields', () => {
      const empty: FeatureSettings = {};
      const full: FeatureSettings = {
        dnd_enabled: true,
        call_waiting_enabled: true,
        call_forward_enabled: true,
        auto_answer_enabled: false,
        srtp_enabled: true,
        call_waiting_dialtone_enabled: false,
        ring_group_silent_ring_enabled: true,
      };
      expect(empty).toEqual({});
      expect(full.dnd_enabled).toBe(true);
      expect(full.ring_group_silent_ring_enabled).toBe(true);
    });

    it('AbstractSettings interface works with all optional fields', () => {
      const empty: AbstractSettings = {};
      const partial: AbstractSettings = {
        regional: { timezone: 'UTC' },
      };
      const full: AbstractSettings = {
        audio: { vad_enabled: true },
        display: { time_format: '12h' },
        regional: { timezone: 'UTC' },
        network: { vlan_id: 100 },
        features: { dnd_enabled: true },
      };
      expect(empty).toEqual({});
      expect(partial.regional?.timezone).toBe('UTC');
      expect(full.features?.dnd_enabled).toBe(true);
    });
  });
});
