import React from 'react';
import type { ConfigPanelProps } from '../registry-types';
import { OpenResourceLink } from './OpenResourceLink';
import { ResourceCombobox } from './ResourceCombobox';
import { ConfigField } from './fields/ConfigField';
import { TimeoutField } from './fields/TimeoutField';
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

  const targetId = (config.target_id as string) ?? '';
  const timeout = (config.timeout as number) ?? 30;

  return (
    <>
      <TimeoutField
        value={timeout}
        min={0}
        max={300}
        onChange={(t) => onConfigChange({ timeout: t })}
        locale={locale}
      />
      <ConfigField label={locale?.configLabels.target ?? 'Target'}>
        <ResourceCombobox
          groups={groups}
          value={targetId}
          placeholder={locale?.configLabels.searchTargets ?? 'Search targets\u2026'}
          onSelect={(id, name) => onConfigChange({ target_id: id }, { targetName: name })}
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
    </>
  );
}
