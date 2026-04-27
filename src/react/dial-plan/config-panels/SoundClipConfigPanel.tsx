import React from 'react';
import type { ConfigPanelProps } from '../registry-types';
import { ResourceCombobox } from './ResourceCombobox';
import { ConfigField } from './fields/ConfigField';
import { useResourceGroups } from './hooks/useResourceGroups';

export function SoundClipConfigPanel({
  config,
  onConfigChange,
  listResources,
  onCreateResource,
  locale,
}: ConfigPanelProps) {
  const { groups, loading, handleCreateResource } = useResourceGroups(
    [{ type: 'audio_clip', labelKey: 'audioClips', fallback: 'Audio Clips' }],
    listResources,
    onCreateResource,
    locale
  );

  const clipId = (config.clip_id as string) ?? '';

  return (
    <ConfigField label={locale?.configLabels.audioClip ?? 'Audio Clip'}>
      <ResourceCombobox
        groups={groups}
        value={clipId}
        loading={loading}
        placeholder={locale?.configLabels.search ?? 'Search...'}
        onSelect={(id, name) => onConfigChange({ clip_id: id }, { clipName: name })}
        onCreateResource={handleCreateResource}
        selectLabel={locale?.combobox.select}
        noResultsLabel={locale?.combobox.noResults}
        loadingLabel={locale?.combobox.loading}
        createNewPrefix={locale?.combobox.createNew}
      />
    </ConfigField>
  );
}
