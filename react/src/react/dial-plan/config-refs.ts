/**
 * Node configs reference resources under a documented key (`schedule`,
 * `target`, `prompt_clip`, `clip`, `voice_app`) and a deprecated `_id`
 * spelling of it. A plan may carry either one, depending on who wrote it.
 */
export type ConfigRefKey = 'schedule' | 'target' | 'prompt_clip' | 'clip' | 'voice_app';

/** Reads a reference, preferring the documented key as the API does. */
export function readRef(config: object | undefined, key: ConfigRefKey): string {
  const c = config as Record<string, unknown> | undefined;
  const value = c?.[key] || c?.[`${key}_id`];
  return typeof value === 'string' ? value : '';
}

/**
 * Builds the config update for a new reference. Both spellings are written:
 * writing only one would leave a stale value in the other, and the documented
 * key wins on read. The `_id` spelling is kept for older API and call-routing
 * versions that read only that one.
 */
export function refUpdate(key: ConfigRefKey, id: string): Record<string, string> {
  return { [key]: id, [`${key}_id`]: id };
}
