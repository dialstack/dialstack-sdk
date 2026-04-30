import React from 'react';
import type { ConfigPanelProps } from '../registry-types';
import { OpenResourceLink } from './OpenResourceLink';
import { ResourceCombobox } from './ResourceCombobox';
import { ConfigField } from './fields/ConfigField';
import { useResourceGroups } from './hooks/useResourceGroups';

export function VoiceAppConfigPanel({
  config,
  onConfigChange,
  listResources,
  onCreateResource,
  onOpenResource,
  locale,
}: ConfigPanelProps) {
  const { groups, handleCreateResource } = useResourceGroups(
    [{ type: 'voice_app', labelKey: 'voiceApps', fallback: 'Voice Apps' }],
    listResources,
    onCreateResource,
    locale
  );

  const voiceAppId = (config.voice_app_id as string) ?? '';

  return (
    <ConfigField label={locale?.configLabels.target ?? 'Target'}>
      <ResourceCombobox
        groups={groups}
        value={voiceAppId}
        placeholder={locale?.configLabels.searchTargets ?? 'Search targets\u2026'}
        onSelect={(id, name) => onConfigChange({ voice_app_id: id }, { voiceAppName: name })}
        onCreateResource={handleCreateResource}
        selectLabel={locale?.combobox.select}
        noResultsLabel={locale?.combobox.noResults}
        loadingLabel={locale?.combobox.loading}
        createNewPrefix={locale?.combobox.createNew}
        extensionLabel={locale?.combobox.extensionLabel}
      />
      {voiceAppId && onOpenResource && (
        <OpenResourceLink
          resourceId={voiceAppId}
          onOpenResource={onOpenResource}
          label={locale?.configLabels.openInNewTab ?? 'Open target details'}
        />
      )}
    </ConfigField>
  );
}
