import React from 'react';
import type { ConfigPanelProps } from '../registry-types';
import { OpenResourceLink } from './OpenResourceLink';
import { ResourceCombobox } from './ResourceCombobox';
import { ConfigField } from './fields/ConfigField';
import { useResourceGroups } from './hooks/useResourceGroups';

export function VoicemailConfigPanel({
  config,
  onConfigChange,
  listResources,
  onCreateResource,
  onOpenResource,
  locale,
}: ConfigPanelProps) {
  const { groups, loading, handleCreateResource } = useResourceGroups(
    [
      { type: 'user', labelKey: 'users', fallback: 'Users' },
      { type: 'shared_voicemail', labelKey: 'sharedVoicemails', fallback: 'Shared Voicemails' },
    ],
    listResources,
    onCreateResource,
    locale
  );

  const targetId = (config.target_id as string) ?? '';

  return (
    <ConfigField label={locale?.configLabels.target ?? 'Target'}>
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
    </ConfigField>
  );
}
