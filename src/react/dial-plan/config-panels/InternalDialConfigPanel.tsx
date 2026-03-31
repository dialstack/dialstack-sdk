import React, { useCallback, useEffect, useState } from 'react';
import type { ConfigPanelProps, ResourceType } from '../registry-types';
import { OpenResourceLink } from './OpenResourceLink';
import { ResourceCombobox, type ResourceGroup } from './ResourceCombobox';

export function InternalDialConfigPanel({
  config,
  onConfigChange,
  listResources,
  onCreateResource,
  onOpenResource,
  locale,
}: ConfigPanelProps) {
  const [groups, setGroups] = useState<ResourceGroup[]>([]);

  const fetchResources = useCallback(
    () =>
      Promise.all([
        listResources('user'),
        listResources('ring_group'),
        listResources('dial_plan'),
        listResources('voice_app'),
      ])
        .then(([users, ringGroups, dialPlans, voiceApps]) => {
          setGroups([
            { label: locale?.resourceGroups.users ?? 'Users', type: 'user', items: users },
            {
              label: locale?.resourceGroups.ringGroups ?? 'Ring Groups',
              type: 'ring_group',
              items: ringGroups,
            },
            {
              label: locale?.resourceGroups.dialPlans ?? 'Dial Plans',
              type: 'dial_plan',
              items: dialPlans,
            },
            {
              label: locale?.resourceGroups.voiceApps ?? 'Voice Apps',
              type: 'voice_app',
              items: voiceApps,
            },
          ]);
        })
        .catch(() => {}),
    [listResources, locale]
  );

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const targetId = (config.target_id as string) ?? '';
  const timeout = (config.timeout as number) ?? 30;

  function handleChange(updates: Record<string, unknown>, display?: Record<string, unknown>) {
    onConfigChange({ target_id: targetId, timeout, ...updates }, display);
  }

  function handleTargetChange(newTargetId: string, targetName: string) {
    handleChange({ target_id: newTargetId }, { targetName });
  }

  async function handleCreateResource(type: ResourceType) {
    if (!onCreateResource) return undefined;
    const created = await onCreateResource(type);
    if (created) {
      await fetchResources();
    }
    return created;
  }

  return (
    <>
      <div className="ds-dial-plan-config-field">
        <label className="ds-dial-plan-config-field__label">
          {locale?.configLabels.timeout ?? 'Timeout (seconds)'}
        </label>
        <input
          className="ds-dial-plan-config-field__input"
          type="number"
          min={0}
          max={300}
          value={timeout}
          onChange={(e) => handleChange({ timeout: Number(e.target.value) })}
        />
      </div>
      <div className="ds-dial-plan-config-field">
        <label className="ds-dial-plan-config-field__label">
          {locale?.configLabels.target ?? 'Target'}
        </label>
        <ResourceCombobox
          groups={groups}
          value={targetId}
          placeholder={locale?.configLabels.searchTargets ?? 'Search targets…'}
          onSelect={handleTargetChange}
          onCreateResource={handleCreateResource}
          selectLabel={locale?.combobox.select}
          noResultsLabel={locale?.combobox.noResults}
          loadingLabel={locale?.combobox.loading}
          createNewPrefix={locale?.combobox.createNew}
          extensionLabel={locale?.combobox.extensionLabel}
        />
        {targetId && onOpenResource && (
          <OpenResourceLink
            resourceId={targetId}
            onOpenResource={onOpenResource}
            label={locale?.configLabels.openInNewTab ?? 'Open target details'}
          />
        )}
      </div>
    </>
  );
}
