import React, { useEffect, useState } from 'react';
import type { ConfigPanelProps } from '../registry-types';

export function ScheduleConfigPanel({ config, onConfigChange, listResources }: ConfigPanelProps) {
  const [schedules, setSchedules] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    listResources('schedule')
      .then(setSchedules)
      .catch(() => {});
  }, [listResources]);

  return (
    <div className="ds-dial-plan-config-field">
      <label className="ds-dial-plan-config-field__label">Schedule</label>
      <select
        className="ds-dial-plan-config-field__select"
        value={(config.schedule_id as string) ?? ''}
        onChange={(e) => {
          const selectedOption = e.target.selectedOptions[0];
          onConfigChange(
            { schedule_id: e.target.value },
            { scheduleName: selectedOption?.textContent || '' }
          );
        }}
      >
        <option value="">— Select schedule —</option>
        {schedules.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
