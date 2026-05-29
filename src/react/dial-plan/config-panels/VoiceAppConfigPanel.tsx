import React, { useEffect } from 'react';
import type { ConfigPanelProps } from '../registry-types';
import { OpenResourceLink } from './OpenResourceLink';
import { ResourceCombobox } from './ResourceCombobox';
import { ConfigField } from './fields/ConfigField';
import { SegmentedField } from './fields/SegmentedField';
import { useResourceGroups } from './hooks/useResourceGroups';

type VoiceAppMode = 'control' | 'notify';

export function VoiceAppConfigPanel({
  config,
  onConfigChange,
  listResources,
  onCreateResource,
  onOpenResource,
  locale,
}: ConfigPanelProps) {
  const voiceAppId = (config.voice_app_id as string) ?? '';
  const mode: VoiceAppMode = (config.mode as VoiceAppMode | undefined) ?? 'control';

  const { groups, handleCreateResource } = useResourceGroups(
    [
      {
        type: 'voice_app',
        labelKey: 'voiceApps',
        fallback: 'Voice Apps',
        options: { notifyEligible: mode === 'notify' },
      },
    ],
    listResources,
    onCreateResource,
    locale
  );

  useEffect(() => {
    if (mode !== 'notify' || !voiceAppId) return;
    const items = groups[0]?.items ?? [];
    if (items.length === 0) return;
    const stillSelectable = items.some((item) => item.id === voiceAppId);
    if (!stillSelectable) {
      onConfigChange({ voice_app_id: '' }, { voiceAppName: undefined });
    }
  }, [mode, voiceAppId, groups, onConfigChange]);

  return (
    <>
      <ConfigField label={locale?.configLabels.target ?? 'Target'}>
        <ResourceCombobox
          groups={groups}
          value={voiceAppId}
          placeholder={locale?.configLabels.searchTargets ?? 'Search targets…'}
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
      <SegmentedField<VoiceAppMode>
        label={locale?.configLabels.mode ?? 'Mode'}
        value={mode}
        options={[
          { value: 'control', label: locale?.voiceAppMode.control ?? 'Control' },
          { value: 'notify', label: locale?.voiceAppMode.notify ?? 'Notify' },
        ]}
        onChange={(next) => onConfigChange({ mode: next })}
        hint={
          mode === 'notify'
            ? (locale?.voiceAppMode.notifyHint ??
              'Notifies the voice app of the call in the background. The dial plan keeps routing via Next without waiting.')
            : (locale?.voiceAppMode.controlHint ??
              'Hands the call off to the voice app, which takes over the conversation.')
        }
      />
    </>
  );
}
