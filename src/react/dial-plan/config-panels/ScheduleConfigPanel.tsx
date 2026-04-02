import React, { useCallback, useEffect, useState } from 'react';
import type { ConfigPanelProps, ResourceType } from '../registry-types';
import { OpenResourceLink } from './OpenResourceLink';
import { ResourceCombobox, type ResourceGroup } from './ResourceCombobox';

export function ScheduleConfigPanel({
  config,
  onConfigChange,
  listResources,
  onCreateResource,
  onOpenResource,
  locale,
}: ConfigPanelProps) {
  const [groups, setGroups] = useState<ResourceGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSchedules = useCallback(
    () =>
      listResources('schedule')
        .then((schedules) => {
          setGroups([
            {
              label: locale?.resourceGroups.schedules ?? 'Schedules',
              type: 'schedule',
              items: schedules,
            },
          ]);
        })
        .catch(() => {})
        .finally(() => setLoading(false)),
    [listResources, locale]
  );

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const scheduleId = (config.schedule_id as string) ?? '';

  async function handleCreateResource(type: ResourceType) {
    if (!onCreateResource) return undefined;
    const created = await onCreateResource(type);
    if (created) {
      await fetchSchedules();
    }
    return created;
  }

  return (
    <div className="ds-dial-plan-config-field">
      <label className="ds-dial-plan-config-field__label">
        {locale?.configLabels.schedule ?? 'Schedule'}
      </label>
      <ResourceCombobox
        groups={groups}
        value={scheduleId}
        loading={loading}
        placeholder={locale?.configLabels.searchSchedules ?? 'Search schedules…'}
        onSelect={(id, name) => onConfigChange({ schedule_id: id }, { scheduleName: name })}
        onCreateResource={handleCreateResource}
        selectLabel={locale?.combobox.select}
        noResultsLabel={locale?.combobox.noResults}
        loadingLabel={locale?.combobox.loading}
        createNewPrefix={locale?.combobox.createNew}
        extensionLabel={locale?.combobox.extensionLabel}
      />
      {scheduleId && onOpenResource && (
        <OpenResourceLink
          resourceId={scheduleId}
          onOpenResource={onOpenResource}
          label={locale?.configLabels.openInNewTab ?? 'Open target details'}
        />
      )}
    </div>
  );
}
