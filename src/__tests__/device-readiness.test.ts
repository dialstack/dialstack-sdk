import { deviceReadiness, type DeviceReadinessInput } from '../utils/device-readiness';

function device(overrides: Partial<DeviceReadinessInput> = {}): DeviceReadinessInput {
  return {
    type: 'deskphone',
    status: 'provisioned',
    registration_status: 'not_registered',
    last_call_at: null,
    assignments: [],
    ...overrides,
  };
}

describe('deviceReadiness', () => {
  it('reports a freshly added device as fully pending', () => {
    const r = deviceReadiness(device({ status: 'pending-sync' }));
    expect(r).toEqual({
      provisioned: false,
      online: false,
      assigned: false,
      readyToCall: false,
      firstCall: false,
      graduated: false,
      currentStep: 'provisioned',
      completedCount: 0,
      missing: ['user', 'location'],
    });
  });

  it('moves to the online step once provisioned', () => {
    const r = deviceReadiness(device());
    expect(r.provisioned).toBe(true);
    expect(r.currentStep).toBe('online');
    expect(r.completedCount).toBe(1);
  });

  it('treats an online userless device as blocked on ready_to_call (assignment gate)', () => {
    const r = deviceReadiness(device({ registration_status: 'registered' }));
    expect(r.online).toBe(true);
    expect(r.assigned).toBe(false);
    expect(r.readyToCall).toBe(false);
    expect(r.currentStep).toBe('ready_to_call');
    expect(r.completedCount).toBe(2);
  });

  it('keeps ready_to_call current when assigned but offline', () => {
    const r = deviceReadiness(device({ assignments: [{ user_id: 'user_x' }] }));
    expect(r.assigned).toBe(true);
    expect(r.online).toBe(false);
    expect(r.readyToCall).toBe(false);
    // online is the first incomplete step on the spine
    expect(r.currentStep).toBe('online');
  });

  it('is ready to call when assigned and online', () => {
    const r = deviceReadiness(
      device({ registration_status: 'registered', assignments: [{ user_id: 'user_x' }] })
    );
    expect(r.readyToCall).toBe(true);
    expect(r.firstCall).toBe(false);
    expect(r.graduated).toBe(false);
    expect(r.currentStep).toBe('first_call');
    expect(r.completedCount).toBe(3);
  });

  it('graduates once the device has carried a call', () => {
    const r = deviceReadiness(
      device({
        registration_status: 'registered',
        assignments: [{ user_id: 'user_x' }],
        last_call_at: '2026-06-01T12:03:11Z',
      })
    );
    expect(r.firstCall).toBe(true);
    expect(r.graduated).toBe(true);
    expect(r.currentStep).toBeNull();
    expect(r.completedCount).toBe(4);
  });

  it('keeps graduation derived: a graduated device that goes offline stays graduated', () => {
    const r = deviceReadiness(
      device({
        assignments: [{ user_id: 'user_x' }],
        last_call_at: '2026-06-01T12:03:11Z',
      })
    );
    expect(r.graduated).toBe(true);
    expect(r.online).toBe(false);
  });

  it('re-opens the checklist when a device with call history loses its assignment but keeps last_call_at semantics', () => {
    // Graduation keys on last_call_at only — the backend derives it from the
    // device's *current* lines, so reassignment naturally resets it server-side.
    const r = deviceReadiness(device({ last_call_at: null, assignments: [] }));
    expect(r.graduated).toBe(false);
  });

  it('never gates a DECT base on user assignment — online means ready to call', () => {
    const r = deviceReadiness(
      device({
        type: 'dect_base',
        assignments: undefined,
        registration_status: 'registered',
      })
    );
    expect(r.assigned).toBe(true);
    expect(r.readyToCall).toBe(true);
  });

  it('keeps an offline DECT base on the online step, not the assignment gate', () => {
    const r = deviceReadiness(device({ type: 'dect_base', assignments: undefined }));
    expect(r.assigned).toBe(true);
    expect(r.readyToCall).toBe(false);
    expect(r.currentStep).toBe('online');
  });

  it('reports missing prerequisites per device type', () => {
    // deskphone: user + location
    expect(deviceReadiness(device({ location_id: null })).missing).toEqual(['user', 'location']);
    expect(
      deviceReadiness(device({ assignments: [{ user_id: 'user_x' }], location_id: 'loc_x' }))
        .missing
    ).toEqual([]);
    // handset: user + base, never location (inherited from the base)
    expect(
      deviceReadiness(device({ type: 'dect_handset', assignments: [], base_id: null })).missing
    ).toEqual(['user', 'base']);
    expect(
      deviceReadiness(
        device({ type: 'dect_handset', assignments: [{ user_id: 'user_x' }], base_id: 'dectb_x' })
      ).missing
    ).toEqual([]);
    // base: location only, never user
    expect(deviceReadiness(device({ type: 'dect_base', assignments: undefined })).missing).toEqual([
      'location',
    ]);
    expect(
      deviceReadiness(device({ type: 'dect_base', assignments: undefined, location_id: 'loc_x' }))
        .missing
    ).toEqual([]);
  });

  it('handles missing optional fields without throwing', () => {
    const r = deviceReadiness({
      status: 'provisioned',
      registration_status: 'not_registered',
      last_call_at: null,
    });
    expect(r.assigned).toBe(false);
    expect(r.currentStep).toBe('online');
  });
});
