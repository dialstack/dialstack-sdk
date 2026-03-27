import React, { useCallback, useEffect, useState } from 'react';
import type { ConfigPanelProps, ResourceType } from '../registry-types';
import { ResourceCombobox, type ResourceGroup } from './ResourceCombobox';

export function ScheduleConfigPanel({
  config,
  onConfigChange,
  listResources,
  onCreateResource,
}: ConfigPanelProps) {
  const [groups, setGroups] = useState<ResourceGroup[]>([]);

  const fetchSchedules = useCallback(
    () =>
      listResources('schedule')
        .then((schedules) => {
          setGroups([{ label: 'Schedules', type: 'schedule', items: schedules }]);
        })
        .catch(() => {}),
    [listResources]
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
      <label className="ds-dial-plan-config-field__label">Schedule</label>
      <ResourceCombobox
        groups={groups}
        value={scheduleId}
        placeholder="Search schedules…"
        onSelect={(id, name) => onConfigChange({ schedule_id: id }, { scheduleName: name })}
        onCreateResource={handleCreateResource}
      />
    </div>
  );
}
