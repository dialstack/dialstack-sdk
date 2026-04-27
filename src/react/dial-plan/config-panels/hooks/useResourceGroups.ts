import { useCallback, useEffect, useState } from 'react';
import type { DialPlanLocale } from '../../../../types/dial-plan';
import type { ConfigPanelProps, ResourceType } from '../../registry-types';
import type { ResourceGroup } from '../ResourceCombobox';

export interface ResourceGroupSpec {
  type: ResourceType;
  labelKey: keyof DialPlanLocale['resourceGroups'];
  fallback: string;
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

  const fetchAll = useCallback(
    () =>
      Promise.all(specs.map((s) => listResources(s.type)))
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
    // specs is constructed inline by callers; depend on listResources/locale
    // instead. This matches the pre-refactor dependency pattern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listResources, locale]
  );

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const wrappedCreate = useCallback(
    async (type: ResourceType) => {
      if (!onCreateResource) return undefined;
      const created = await onCreateResource(type);
      if (created) {
        await fetchAll();
      }
      return created;
    },
    [onCreateResource, fetchAll]
  );

  return {
    groups,
    loading,
    handleCreateResource: onCreateResource ? wrappedCreate : undefined,
  };
}
