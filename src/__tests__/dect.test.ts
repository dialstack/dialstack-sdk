/**
 * Type-level tests for DECT provisioning types.
 * These tests verify that the types compile correctly and
 * match the expected structure from the API.
 */

import type {
  MulticellRole,
  DECTBase,
  HandsetStatus,
  DECTHandset,
  DECTExtension,
  CreateDECTBaseRequest,
  UpdateDECTBaseRequest,
  UpdateDECTHandsetRequest,
  CreateDECTExtensionRequest,
} from '../types/dect';

describe('DECT Types', () => {
  describe('MulticellRole', () => {
    it('accepts all valid roles', () => {
      const roles: MulticellRole[] = ['single', 'data_master', 'secondary'];
      expect(roles).toHaveLength(3);
    });
  });

  describe('HandsetStatus', () => {
    it('accepts all valid statuses', () => {
      const statuses: HandsetStatus[] = ['unpaired', 'registered', 'provisioned'];
      expect(statuses).toHaveLength(3);
    });
  });

  describe('DECTBase', () => {
    it('allows full base object', () => {
      const base: DECTBase = {
        id: 'dectb_01h455vb4pex5vsknk084sn02t',
        mac_address: '00:04:13:12:34:56',
        vendor: 'snom',
        model: 'M500',
        status: 'provisioned',
        multicell_role: 'single',
        max_handsets: 20,
        firmware_version: '1.0.0',
        overrides: {},
        current_ip_address: '192.168.1.100',
        last_provisioned_at: '2024-01-01T00:00:00Z',
        handsets: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(base.id).toContain('dectb_');
      expect(base.vendor).toBe('snom');
      expect(base.multicell_role).toBe('single');
    });

    it('allows optional fields to be undefined', () => {
      const base: DECTBase = {
        id: 'dectb_01h455vb4pex5vsknk084sn02t',
        mac_address: '00:04:13:12:34:56',
        vendor: 'snom',
        status: 'pending-sync',
        multicell_role: 'single',
        max_handsets: 20,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(base.model).toBeUndefined();
      expect(base.firmware_version).toBeUndefined();
      expect(base.overrides).toBeUndefined();
      expect(base.current_ip_address).toBeUndefined();
      expect(base.last_provisioned_at).toBeUndefined();
      expect(base.handsets).toBeUndefined();
    });
  });

  describe('DECTHandset', () => {
    it('allows full handset object', () => {
      const handset: DECTHandset = {
        id: 'decth_01h455vb4pex5vsknk084sn02t',
        base_id: 'dectb_01h455vb4pex5vsknk084sn02t',
        ipei: '00234E1234567890ABCD',
        status: 'registered',
        display_name: 'Reception',
        slot_number: 1,
        model: 'M55',
        firmware_version: '2.0.0',
        registered_at: '2024-01-01T00:00:00Z',
        extensions: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(handset.ipei).toBe('00234E1234567890ABCD');
      expect(handset.slot_number).toBe(1);
    });

    it('allows optional fields to be undefined', () => {
      const handset: DECTHandset = {
        id: 'decth_01h455vb4pex5vsknk084sn02t',
        base_id: 'dectb_01h455vb4pex5vsknk084sn02t',
        ipei: '00234E1234567890ABCD',
        status: 'unpaired',
        slot_number: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(handset.display_name).toBeUndefined();
      expect(handset.model).toBeUndefined();
      expect(handset.firmware_version).toBeUndefined();
      expect(handset.registered_at).toBeUndefined();
      expect(handset.extensions).toBeUndefined();
    });
  });

  describe('DECTExtension', () => {
    it('allows full extension object', () => {
      const ext: DECTExtension = {
        id: 'decte_01h455vb4pex5vsknk084sn02t',
        handset_id: 'decth_01h455vb4pex5vsknk084sn02t',
        endpoint_id: 'ep_01h455vb4pex5vsknk084sn02t',
        display_name: 'Line 1',
        endpoint: {
          id: 'ep_01h455vb4pex5vsknk084sn02t',
          sip_username: 'user1001',
          name: 'John Doe',
        },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(ext.endpoint_id).toContain('ep_');
      expect(ext.endpoint?.sip_username).toBe('user1001');
    });

    it('allows optional fields to be undefined', () => {
      const ext: DECTExtension = {
        id: 'decte_01h455vb4pex5vsknk084sn02t',
        handset_id: 'decth_01h455vb4pex5vsknk084sn02t',
        endpoint_id: 'ep_01h455vb4pex5vsknk084sn02t',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(ext.display_name).toBeUndefined();
      expect(ext.endpoint).toBeUndefined();
    });

    it('allows endpoint without optional name field', () => {
      const ext: DECTExtension = {
        id: 'decte_01h455vb4pex5vsknk084sn02t',
        handset_id: 'decth_01h455vb4pex5vsknk084sn02t',
        endpoint_id: 'ep_01h455vb4pex5vsknk084sn02t',
        endpoint: {
          id: 'ep_01h455vb4pex5vsknk084sn02t',
          sip_username: 'user1001',
        },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(ext.endpoint?.name).toBeUndefined();
      expect(ext.endpoint?.sip_username).toBe('user1001');
    });
  });

  describe('CreateDECTBaseRequest', () => {
    it('requires mac_address', () => {
      const req: CreateDECTBaseRequest = {
        mac_address: '00:04:13:12:34:56',
      };
      expect(req.mac_address).toBeDefined();
    });

    it('allows optional fields', () => {
      const req: CreateDECTBaseRequest = {
        mac_address: '00:04:13:12:34:56',
        model: 'M500',
        multicell_role: 'data_master',
        overrides: { vendorOverrides: { custom_key: 'value' } },
      };
      expect(req.model).toBe('M500');
      expect(req.multicell_role).toBe('data_master');
      expect(req.overrides).toBeDefined();
    });
  });

  describe('UpdateDECTBaseRequest', () => {
    it('allows all fields to be optional', () => {
      const req: UpdateDECTBaseRequest = {};
      expect(req).toEqual({});
    });

    it('allows partial updates', () => {
      const req: UpdateDECTBaseRequest = {
        status: 'provisioned',
        multicell_role: 'secondary',
      };
      expect(req.status).toBe('provisioned');
      expect(req.multicell_role).toBe('secondary');
    });

    it('allows model and overrides update', () => {
      const req: UpdateDECTBaseRequest = {
        model: 'M700',
        overrides: {
          abstractions: {
            network: { vlanId: 200 },
          },
        },
      };
      expect(req.model).toBe('M700');
      expect(req.overrides?.abstractions?.network?.vlanId).toBe(200);
    });
  });

  describe('UpdateDECTHandsetRequest', () => {
    it('allows all fields to be optional', () => {
      const req: UpdateDECTHandsetRequest = {};
      expect(req).toEqual({});
    });

    it('allows display_name update', () => {
      const req: UpdateDECTHandsetRequest = {
        display_name: 'New Name',
      };
      expect(req.display_name).toBe('New Name');
    });
  });

  describe('CreateDECTExtensionRequest', () => {
    it('requires endpoint_id', () => {
      const req: CreateDECTExtensionRequest = {
        endpoint_id: 'ep_01h455vb4pex5vsknk084sn02t',
      };
      expect(req.endpoint_id).toBeDefined();
    });

    it('allows optional display_name', () => {
      const req: CreateDECTExtensionRequest = {
        endpoint_id: 'ep_01h455vb4pex5vsknk084sn02t',
        display_name: 'Line 1',
      };
      expect(req.display_name).toBe('Line 1');
    });
  });

  describe('Type compile checks', () => {
    it('MulticellRole accepts valid values', () => {
      const single: MulticellRole = 'single';
      const master: MulticellRole = 'data_master';
      const secondary: MulticellRole = 'secondary';
      expect(single).toBe('single');
      expect(master).toBe('data_master');
      expect(secondary).toBe('secondary');
    });

    it('HandsetStatus accepts valid values', () => {
      const unpaired: HandsetStatus = 'unpaired';
      const registered: HandsetStatus = 'registered';
      const provisioned: HandsetStatus = 'provisioned';
      expect(unpaired).toBe('unpaired');
      expect(registered).toBe('registered');
      expect(provisioned).toBe('provisioned');
    });

    it('DECTBase status uses DeviceStatus values', () => {
      const pendingBase: DECTBase = {
        id: 'dectb_01',
        account_id: 'acct_01',
        mac_address: '00:04:13:00:00:01',
        vendor: 'snom',
        status: 'pending-sync',
        multicell_role: 'single',
        max_handsets: 10,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      const provisionedBase: DECTBase = {
        id: 'dectb_02',
        account_id: 'acct_01',
        mac_address: '00:04:13:00:00:02',
        vendor: 'snom',
        status: 'provisioned',
        multicell_role: 'data_master',
        max_handsets: 30,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(pendingBase.status).toBe('pending-sync');
      expect(provisionedBase.status).toBe('provisioned');
    });

    it('DECTBase overrides accepts DeviceSettings', () => {
      const base: DECTBase = {
        id: 'dectb_01',
        account_id: 'acct_01',
        mac_address: '00:04:13:00:00:01',
        vendor: 'snom',
        status: 'provisioned',
        multicell_role: 'single',
        max_handsets: 20,
        overrides: {
          abstractions: {
            regional: { timezone: 'America/New_York' },
            network: { vlanId: 100, qosDscpRtp: 46 },
          },
          vendorOverrides: { some_vendor_param: 'value' },
        },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(base.overrides?.abstractions?.regional?.timezone).toBe('America/New_York');
      expect(base.overrides?.vendorOverrides?.some_vendor_param).toBe('value');
    });

    it('DECTHandset allows all multicell roles on parent base', () => {
      const handset: DECTHandset = {
        id: 'decth_01',
        base_id: 'dectb_01',
        ipei: '00234E0000000000AAAA',
        status: 'provisioned',
        slot_number: 5,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(handset.status).toBe('provisioned');
      expect(handset.slot_number).toBe(5);
    });

    it('DECTExtension endpoint has required and optional fields', () => {
      const withName: DECTExtension = {
        id: 'decte_01',
        handset_id: 'decth_01',
        endpoint_id: 'ep_01',
        endpoint: { id: 'ep_01', sip_username: 'user100', name: 'Alice' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      const withoutName: DECTExtension = {
        id: 'decte_02',
        handset_id: 'decth_01',
        endpoint_id: 'ep_02',
        endpoint: { id: 'ep_02', sip_username: 'user200' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(withName.endpoint?.name).toBe('Alice');
      expect(withoutName.endpoint?.name).toBeUndefined();
    });
  });

  describe('Type exports from index', () => {
    it('all DECT types can be imported from types/index', async () => {
      const types = await import('../types');
      expect(types).toBeDefined();
    });
  });
});
