import React, { useCallback, useEffect, useState } from 'react';
import type { ConfigPanelProps } from '../registry-types';
import { OpenResourceLink } from './OpenResourceLink';
import { ResourceCombobox, type ResourceGroup } from './ResourceCombobox';

export function VoiceAppConfigPanel({
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
      listResources('voice_app')
        .then((voiceApps) => {
          setGroups([
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
          onChange={(e) => onConfigChange({ timeout: Number(e.target.value) })}
        />
      </div>
      <div className="ds-dial-plan-config-field">
        <label className="ds-dial-plan-config-field__label">
          {locale?.configLabels.target ?? 'Target'}
        </label>
        <ResourceCombobox
          groups={groups}
          value={targetId}
          placeholder={locale?.configLabels.searchTargets ?? 'Search targets\u2026'}
          onSelect={(id, name) => onConfigChange({ target_id: id }, { targetName: name })}
          onCreateResource={
            onCreateResource
              ? async (type) => {
                  const created = await onCreateResource(type);
                  if (created) await fetchResources();
                  return created;
                }
              : undefined
          }
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
