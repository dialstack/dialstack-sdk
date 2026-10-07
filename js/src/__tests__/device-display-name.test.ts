import { deviceDisplayName, type DeviceDisplayNameInput } from '../utils/device-display-name';

function device(overrides: Partial<DeviceDisplayNameInput> = {}): DeviceDisplayNameInput {
  return {
    id: 'dev_01',
    type: 'deskphone',
    mac_address: '00:04:13:aa:bb:cc',
    assignments: [],
    ...overrides,
  };
}

describe('deviceDisplayName', () => {
  it('uses the stored name as an override', () => {
    const d = device({
      name: 'Front desk',
      assignments: [{ line_number: 1, user: { name: 'Jane Doe' } }],
    });
    expect(deviceDisplayName(d)).toEqual({ name: 'Front desk', source: 'override' });
  });

  it('inherits the user name when there is no override', () => {
    const d = device({ assignments: [{ line_number: 1, user: { name: 'Jane Doe' } }] });
    expect(deviceDisplayName(d)).toEqual({ name: 'Jane Doe', source: 'user' });
  });

  it('falls back to assigned_users when assignments carry only user ids', () => {
    // The raw API returns `user` as an id unless the user itself is expanded.
    const d = device({
      assignments: [{ line_number: 1, user: 'user_01' as never }],
      assigned_users: [{ name: 'Jane Doe' }],
    });
    expect(deviceDisplayName(d)).toEqual({ name: 'Jane Doe', source: 'user' });
  });

  it('still inherits when one user holds two lines', () => {
    const d = device({
      assignments: [
        { line_number: 1, user_id: 'user_1', user: { name: 'Jane Doe' } },
        { line_number: 2, user_id: 'user_1', user: { name: 'Jane Doe' } },
      ],
    });
    expect(deviceDisplayName(d)).toEqual({ name: 'Jane Doe', source: 'user' });
  });

  it('inherits nobody on a device shared by several users', () => {
    const d = device({
      assignments: [
        { line_number: 1, user: { name: 'Jane Doe' } },
        { line_number: 2, user: { name: 'John Roe' } },
      ],
    });
    expect(deviceDisplayName(d).source).toBe('hardware');
  });

  it('treats a blank override as no override', () => {
    const d = device({ name: '  ', assignments: [{ line_number: 1, user: { name: 'Jane Doe' } }] });
    expect(deviceDisplayName(d).source).toBe('user');
  });

  it('falls back to the user email when the user has no name', () => {
    const d = device({ assignments: [{ line_number: 1, user: { name: null, email: 'j@x.io' } }] });
    expect(deviceDisplayName(d)).toEqual({ name: 'j@x.io', source: 'user' });
  });

  it('falls back to assigned_users when assignments carry no user', () => {
    const d = device({ assignments: undefined, assigned_users: [{ name: 'Jane Doe' }] });
    expect(deviceDisplayName(d)).toEqual({ name: 'Jane Doe', source: 'user' });
  });

  it('falls back to the MAC for an unassigned deskphone', () => {
    expect(deviceDisplayName(device())).toEqual({
      name: '00:04:13:aa:bb:cc',
      source: 'hardware',
    });
  });

  it('reads a handset override from name, then its deprecated display_name alias', () => {
    const h = device({ type: 'dect_handset', mac_address: undefined, ipei: '0328D3C9A1' });
    expect(deviceDisplayName(h)).toEqual({ name: '0328D3C9A1', source: 'hardware' });
    expect(deviceDisplayName({ ...h, name: 'Warehouse 1' })).toEqual({
      name: 'Warehouse 1',
      source: 'override',
    });
    expect(deviceDisplayName({ ...h, display_name: 'Warehouse 2' }).name).toBe('Warehouse 2');
  });

  it('ignores display_name on non-handsets', () => {
    expect(deviceDisplayName(device({ display_name: 'stale' })).source).toBe('hardware');
  });

  it('falls back to the id when no hardware identity is known', () => {
    const d = device({ mac_address: undefined });
    expect(deviceDisplayName(d)).toEqual({ name: 'dev_01', source: 'hardware' });
  });
});
