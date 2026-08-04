import React from 'react';
import type { ConfigPanelProps } from '../registry-types';
import { OpenResourceLink } from './OpenResourceLink';
import { ResourceCombobox } from './ResourceCombobox';
import { ConfigField } from './fields/ConfigField';
import { useResourceGroups } from './hooks/useResourceGroups';

export const ScheduleConfigPanel = ({
  config,
  onConfigChange,
  listResources,
  onCreateResource,
  onOpenResource,
  locale,
}: ConfigPanelProps) => {
  const { groups, loading, handleCreateResource } = useResourceGroups(
    [{ type: 'schedule', labelKey: 'schedules', fallback: 'Schedules' }],
    listResources,
    onCreateResource,
    locale
  );

  const scheduleId = (config.schedule_id as string) ?? '';
  // Opt-in signal: the holiday key is present (even if null/unwired). When
  // absent, holiday folds into the closed exit.
  const holidayEnabled = config.holiday !== undefined;

  // Toggling on materializes config.holiday as null so the handle appears
  // (ScheduleNode reads config.holiday !== undefined for data.holidayEnabled).
  // Toggling off clears it; the node's onConfigChange hook also drops any
  // wired holiday edge.
  const toggleHoliday = (next: boolean) =>
    onConfigChange({ holiday: next ? null : undefined }, { holidayEnabled: next });

  return (
    <>
      <ConfigField label={locale?.configLabels.schedule ?? 'Schedule'}>
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
      </ConfigField>
      <div className="ds-dial-plan-config-field">
        <label className="ds-dial-plan-config-field__checkbox">
          <input
            type="checkbox"
            checked={holidayEnabled}
            onChange={(e) => toggleHoliday(e.target.checked)}
          />
          <span>{locale?.configLabels.routeHolidaySeparately ?? 'Route holidays separately'}</span>
        </label>
        <p className="ds-dial-plan-config-field__hint">
          {locale?.configLabels.routeHolidaySeparatelyHint ??
            'When on, holidays route to a dedicated branch you wire below. Otherwise holidays follow the Closed exit.'}
        </p>
      </div>
    </>
  );
};
