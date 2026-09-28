/**
 * A plan may reference its resources under the documented config keys or the
 * deprecated `_id` spellings, depending on who wrote it. The editor must load
 * either, and write both so neither reader sees a stale value.
 */

import type { DialPlanNode } from '@dialstack/sdk-js';
import { readRef, refUpdate } from '../config-refs';
import { defaultRegistry, nodeDefinitions } from '../default-registry';
import { nodeDataAfterConfigChange } from '../apply-config-change';
import { defaultDialPlanLocale } from '../../../locales/dial-plan-en';

const node = (type: string, config: Record<string, unknown>) =>
  ({ id: 'n1', type, config }) as unknown as DialPlanNode;

function collect(type: string, config: Record<string, unknown>) {
  const ids: string[] = [];
  const add = (id: string) => ids.push(id);
  nodeDefinitions
    .find((d) => d.type === type)
    ?.collectResourceIds?.(config, { addSchedule: add, addTarget: add, addAudioClip: add });
  return ids;
}

describe('readRef', () => {
  it('prefers the documented key', () => {
    expect(readRef({ target: 'user_new', target_id: 'user_old' }, 'target')).toBe('user_new');
  });
  it('falls back to the _id spelling', () => {
    expect(readRef({ target: '', target_id: 'user_old' }, 'target')).toBe('user_old');
  });
  it('returns an empty string when neither is set', () => {
    expect(readRef({}, 'schedule')).toBe('');
    expect(readRef(undefined, 'schedule')).toBe('');
  });
});

describe('refUpdate', () => {
  it('writes both spellings', () => {
    expect(refUpdate('prompt_clip', 'aud_1')).toEqual({
      prompt_clip: 'aud_1',
      prompt_clip_id: 'aud_1',
    });
  });
});

describe('loading a plan with only the documented keys', () => {
  const cases: Array<[string, string, Record<string, unknown>, string, string]> = [
    ['schedule', 'schedule', { schedule: 'sched_1' }, 'scheduleId', 'sched_1'],
    ['internal_dial', 'internal_dial', { target: 'user_1', timeout: 30 }, 'targetId', 'user_1'],
    ['voicemail', 'internal_dial', { target: 'svm_1', timeout: 0 }, 'targetId', 'svm_1'],
    ['menu', 'menu', { prompt_clip: 'aud_1', timeout: 5, options: [] }, 'promptClipId', 'aud_1'],
    ['audio_clip', 'audio_clip', { clip: 'aud_2' }, 'clipId', 'aud_2'],
    ['voice_app', 'voice_app', { voice_app: 'va_1', mode: 'control' }, 'voiceAppId', 'va_1'],
  ];

  it.each(cases)(
    '%s node shows and collects its reference',
    (defType, apiType, config, field, id) => {
      const reg = defaultRegistry.resolveType(node(apiType, config));
      expect(reg?.type).toBe(defType);
      const data = reg!.toFlowNode(node(apiType, config)) as Record<string, unknown>;
      expect(data[field]).toBe(id);
      expect(collect(defType, config)).toEqual([id]);
    }
  );

  it('aliases a documented va_ target to the voice app node', () => {
    const legacy = node('internal_dial', { target: 'va_1', timeout: 30, next: 'n2' });
    const reg = defaultRegistry.resolveType(legacy);
    expect(reg?.type).toBe('voice_app');
    expect(reg?.normalizeFromAlias?.(legacy).config).toEqual({
      voice_app: 'va_1',
      voice_app_id: 'va_1',
      mode: 'control',
      next: 'n2',
    });
  });
});

describe('editing a node loaded with only the documented key', () => {
  it('shows the newly picked target instead of the stored one', () => {
    const config = { target: 'user_1', timeout: 30 };
    const next = nodeDataAfterConfigChange({
      flowType: 'internalDial',
      data: { targetId: 'user_1', originalNode: { id: 'n1', type: 'internal_dial', config } },
      configUpdates: refUpdate('target', 'rg_1'),
      maps: { schedules: new Map(), audioClips: new Map(), users: new Map() },
      locale: defaultDialPlanLocale,
    });
    expect(next?.targetId).toBe('rg_1');
    expect(next?.targetType).toBeDefined();
    const saved = (next?.originalNode as { config: Record<string, unknown> }).config;
    expect(saved.target).toBe('rg_1');
    expect(saved.target_id).toBe('rg_1');
  });
});
