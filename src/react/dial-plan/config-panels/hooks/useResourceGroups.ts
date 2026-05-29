import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DialPlanLocale } from '../../../../types/dial-plan';
import type { ConfigPanelProps, ListResourcesOptions, ResourceType } from '../../registry-types';
import type { ResourceGroup } from '../ResourceCombobox';

export interface ResourceGroupSpec {
  type: ResourceType;
  labelKey: keyof DialPlanLocale['resourceGroups'];
  fallback: string;
  /**
   * Per-type filter options passed to `listResources`. Refetches when these
   * change — set by callers (e.g. VoiceAppConfigPanel) to react to mode toggles.
   */
  options?: ListResourcesOptions;
}

export interface UseResourceGroupsResult {
  groups: ResourceGroup[];
  loading: boolean;
  /**
   * `undefined` when the host did not pass `onCreateResource`, so callers can
   * forward it to ResourceCombobox without surfacing a no-op "Create new" button.
   */
  handleCreateResource:
    | ((
        type: ResourceType
      ) => Promise<{ id: string; name: string; extension_number?: string } | undefined>)
    | undefined;
}

/**
 * Fetches resources for one or more groups, exposes a unified loading flag,
 * and wraps onCreateResource so a successful create refetches the list.
 *
 * Errors are swallowed (matches existing per-panel behavior); loading is set
 * false in the finally branch so the combobox falls back to the empty state.
 */
export function useResourceGroups(
  specs: ResourceGroupSpec[],
  listResources: ConfigPanelProps['listResources'],
  onCreateResource: ConfigPanelProps['onCreateResource'],
  locale?: DialPlanLocale
): UseResourceGroupsResult {
  const [groups, setGroups] = useState<ResourceGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // specs is constructed inline by callers (each render produces a new array
  // reference). Serialize once per render so the effect re-runs only when the
  // logical contents change — not on every render.
  const specsKey = useMemo(() => JSON.stringify(specs), [specs]);

  const fetchAll = useCallback(
    () =>
      Promise.all(specs.map((s) => listResources(s.type, s.options)))
        .then((results) => {
          setGroups(
            specs.map((s, i) => ({
              label: locale?.resourceGroups[s.labelKey] ?? s.fallback,
              type: s.type,
              items: results[i] ?? [],
            }))
          );
        })
        .catch(() => {})
        .finally(() => setLoading(false)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listResources, locale, specsKey]
  );

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const wrappedCreate = useCallback(
    async (type: ResourceType) => {
      if (!onCreateResource) return undefined;
      // Forward the spec's per-type filter options so the create dialog can
      // skip incompatible choices (e.g. AI Agent when mode === notify).
      const specOptions = specs.find((s) => s.type === type)?.options;
      const created = await onCreateResource(type, specOptions);
      if (created) {
        await fetchAll();
      }
      return created;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onCreateResource, fetchAll, specsKey]
  );

  return {
    groups,
    loading,
    handleCreateResource: onCreateResource ? wrappedCreate : undefined,
  };
}
