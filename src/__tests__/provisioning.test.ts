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

    it('allows vendor overrides', () => {
      const settings: DeviceSettings = {
        vendorOverrides: {
          user_phone_wallpaper: 'logo.png',
          user_ringer1: 'Ringer4',
        },
      };
      expect(Object.keys(settings.vendorOverrides ?? {})).toHaveLength(2);
    });

    it('allows full configuration', () => {
      const settings: DeviceSettings = {
        abstractions: {
          audio: {
            vadEnabled: false,
            echoCancellation: true,
            jitterBuffer: {
              mode: 'adaptive',
              minMs: 40,
              maxMs: 200,
            },
          },
          display: {
            timeFormat: '24h',
            dateFormat: 'Y-M-D',
            backlightTimeout: 60,
            backlightLevel: 'medium',
          },
          regional: {
            timezone: 'Europe/London',
            language: 'en-GB',
            toneScheme: 'gb',
          },
          network: {
            vlanId: 100,
            qosDscpSip: 26,
            qosDscpRtp: 46,
            ntpServer: 'pool.ntp.org',
            rtcpEnabled: true,
          },
          features: {
            dndEnabled: true,
            callWaitingEnabled: true,
            callForwardEnabled: true,
            autoAnswerEnabled: false,
            srtpEnabled: true,
          },
        },
        vendorOverrides: {
          user_phone_wallpaper: 'corporate.png',
        },
      };

      expect(settings.abstractions?.audio?.jitterBuffer?.mode).toBe('adaptive');
      expect(settings.vendorOverrides?.user_phone_wallpaper).toBe('corporate.png');
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
      const full: JitterBuffer = { mode: 'fixed', minMs: 40, maxMs: 200 };
      expect(empty).toEqual({});
      expect(partial.mode).toBe('adaptive');
      expect(full.maxMs).toBe(200);
    });

    it('AudioSettings interface works with all optional fields', () => {
      const empty: AudioSettings = {};
      const partial: AudioSettings = { vadEnabled: true };
      const full: AudioSettings = {
        vadEnabled: false,
        echoCancellation: true,
        jitterBuffer: { mode: 'adaptive' },
      };
      expect(empty).toEqual({});
      expect(partial.vadEnabled).toBe(true);
      expect(full.jitterBuffer?.mode).toBe('adaptive');
    });

    it('DisplaySettings interface works with all optional fields', () => {
      const empty: DisplaySettings = {};
      const full: DisplaySettings = {
        timeFormat: '24h',
        dateFormat: 'Y-M-D',
        backlightTimeout: 30,
        backlightLevel: 'high',
      };
      expect(empty).toEqual({});
      expect(full.timeFormat).toBe('24h');
    });

    it('RegionalSettings interface works with all optional fields', () => {
      const empty: RegionalSettings = {};
      const full: RegionalSettings = {
        timezone: 'America/New_York',
        language: 'en-US',
        toneScheme: 'us',
      };
      expect(empty).toEqual({});
      expect(full.timezone).toBe('America/New_York');
    });

    it('NetworkSettings interface works with all optional fields', () => {
      const empty: NetworkSettings = {};
      const full: NetworkSettings = {
        vlanId: 100,
        qosDscpSip: 26,
        qosDscpRtp: 46,
        ntpServer: 'pool.ntp.org',
        rtcpEnabled: true,
      };
      expect(empty).toEqual({});
      expect(full.vlanId).toBe(100);
      expect(full.rtcpEnabled).toBe(true);
    });

    it('FeatureSettings interface works with all optional fields', () => {
      const empty: FeatureSettings = {};
      const full: FeatureSettings = {
        dndEnabled: true,
        callWaitingEnabled: true,
        callForwardEnabled: true,
        autoAnswerEnabled: false,
        srtpEnabled: true,
      };
      expect(empty).toEqual({});
      expect(full.dndEnabled).toBe(true);
    });

    it('AbstractSettings interface works with all optional fields', () => {
      const empty: AbstractSettings = {};
      const partial: AbstractSettings = {
        regional: { timezone: 'UTC' },
      };
      const full: AbstractSettings = {
        audio: { vadEnabled: true },
        display: { timeFormat: '12h' },
        regional: { timezone: 'UTC' },
        network: { vlanId: 100 },
        features: { dndEnabled: true },
      };
      expect(empty).toEqual({});
      expect(partial.regional?.timezone).toBe('UTC');
      expect(full.features?.dndEnabled).toBe(true);
    });
  });
});
