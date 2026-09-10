/**
 * A config edit rebuilds a node's flow data from its stored config, which knows
 * nothing about the resources the node references. Everything the canvas shows
 * that was resolved at load has to survive that rebuild — the Internal
 * Extension badge above all, since toggling the override is exactly when the
 * badge is read and exactly when the rebuild runs.
 */

import { nodeDataAfterConfigChange, enrichNodeData } from '../apply-config-change';
import { defaultDialPlanLocale } from '../../../locales/dial-plan-en';
import type { ResourceMaps } from '../registry-types';

const emptyMaps = (): ResourceMaps => ({
  schedules: new Map(),
  audioClips: new Map(),
  users: new Map(),
});

const mapsWith = (targetId: string, ownTimeout?: number): ResourceMaps => ({
  ...emptyMaps(),
  users: new Map([[targetId, { id: targetId, name: 'Support', timeout_seconds: ownTimeout }]]),
});

const internalDialNode = (config: Record<string, unknown>) => ({
  targetId: config.target_id,
  timeout: config.timeout,
  timeoutOverride: config.timeout_override ?? false,
  originalNode: { id: 'n1', type: 'internal_dial', config },
});

const change = (
  data: Record<string, unknown>,
  configUpdates: Record<string, unknown>,
  maps: ResourceMaps,
  displayUpdates?: Record<string, unknown>
) =>
  nodeDataAfterConfigChange({
    flowType: 'internalDial',
    data,
    configUpdates,
    displayUpdates,
    maps,
    locale: defaultDialPlanLocale,
  });

describe('nodeDataAfterConfigChange', () => {
  it("keeps the badge on the target's own duration after an unrelated edit", () => {
    // A 600s queue behind a node storing 30: the badge says 600 at load, and
    // editing anything else must not turn it back into 30.
    const loaded = enrichNodeData(
      'internalDial',
      internalDialNode({ target_id: 'qu_1', timeout: 30, timeout_override: false }),
      mapsWith('qu_1', 600),
      defaultDialPlanLocale
    );
    expect(loaded.timeout).toBe(600);

    const next = change(loaded, { next: 'n2' }, mapsWith('qu_1', 600));
    expect(next?.timeout).toBe(600);
  });

  it('re-derives the badge when the override is toggled', () => {
    const data = internalDialNode({ target_id: 'qu_1', timeout: 30, timeout_override: false });
    const maps = mapsWith('qu_1', 600);

    const on = change(data, { timeout_override: true }, maps);
    expect(on?.timeout).toBe(30);

    const off = change(on!, { timeout_override: false }, maps);
    expect(off?.timeout).toBe(600);
  });

  it('caps the badge at a laddered user, and stops capping when the target changes', () => {
    const data = internalDialNode({ target_id: 'user_1', timeout: 120, timeout_override: true });
    const capped = change(data, {}, mapsWith('user_1', 90));
    expect(capped?.timeout).toBe(90);

    // A ring group keeps waiting, so an override longer than its own timeout
    // is not inert the way a spent ladder is.
    const swapped = change(data, { target_id: 'rg_1' }, mapsWith('rg_1', 20));
    expect(swapped?.timeout).toBe(120);
  });

  it("keeps the panel's name for a resource the resolved maps have never seen", () => {
    const data = internalDialNode({ target_id: 'user_1', timeout: 30, timeout_override: false });
    const next = change(data, { target_id: 'rg_9' }, emptyMaps(), { targetName: 'Sales' });
    expect(next?.targetName).toBe('Sales');
    // Nothing knows how long rg_9 rings yet, so the stored number is the best
    // answer available until it resolves.
    expect(next?.timeout).toBe(30);
  });

  it('leaves a node with no stored node untouched', () => {
    expect(change({ timeout: 30 }, { timeout: 45 }, emptyMaps())).toBeNull();
  });
});

describe('enrichNodeData', () => {
  it('lifts the badge onto the target once the target resolves', () => {
    const data = internalDialNode({ target_id: 'rg_9', timeout: 30, timeout_override: false });
    expect(enrichNodeData('internalDial', data, emptyMaps(), defaultDialPlanLocale).timeout).toBe(
      30
    );
    expect(
      enrichNodeData('internalDial', data, mapsWith('rg_9', 45), defaultDialPlanLocale).timeout
    ).toBe(45);
  });
});
