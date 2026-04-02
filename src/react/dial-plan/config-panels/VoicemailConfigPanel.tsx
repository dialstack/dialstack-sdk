import React, { useCallback, useEffect, useState } from 'react';
import type { ConfigPanelProps, ResourceType } from '../registry-types';
import { OpenResourceLink } from './OpenResourceLink';
import { ResourceCombobox, type ResourceGroup } from './ResourceCombobox';

export function VoicemailConfigPanel({
  config,
  onConfigChange,
  listResources,
  onCreateResource,
  onOpenResource,
  locale,
}: ConfigPanelProps) {
  const [groups, setGroups] = useState<ResourceGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchResources = useCallback(
    () =>
      Promise.all([listResources('user'), listResources('shared_voicemail')])
        .then(([users, sharedVoicemails]) => {
          setGroups([
            { label: locale?.resourceGroups.users ?? 'Users', type: 'user', items: users },
            {
              label: locale?.resourceGroups.sharedVoicemails ?? 'Shared Voicemails',
              type: 'shared_voicemail',
              items: sharedVoicemails,
            },
          ]);
        })
        .catch(() => {})
        .finally(() => setLoading(false)),
    [listResources, locale]
  );

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const targetId = (config.target_id as string) ?? '';

  async function handleCreateResource(type: ResourceType) {
    if (!onCreateResource) return undefined;
    const created = await onCreateResource(type);
    if (created) {
      await fetchResources();
    }
    return created;
  }

  return (
    <div className="ds-dial-plan-config-field">
      <label className="ds-dial-plan-config-field__label">
        {locale?.configLabels.target ?? 'Target'}
      </label>
      <ResourceCombobox
        groups={groups}
        value={targetId}
        loading={loading}
        placeholder={locale?.configLabels.searchTargets ?? 'Search targets…'}
        onSelect={(id, name) => onConfigChange({ target_id: id, timeout: 0 }, { targetName: name })}
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
  );
}
