import React, { useEffect, useState } from 'react';
import type { ConfigPanelProps } from '../registry-types';

interface ResourceGroup {
  label: string;
  items: Array<{ id: string; name: string }>;
}

export function InternalDialConfigPanel({
  config,
  onConfigChange,
  listResources,
}: ConfigPanelProps) {
  const [groups, setGroups] = useState<ResourceGroup[]>([]);

  useEffect(() => {
    Promise.all([listResources('user'), listResources('ring_group'), listResources('dial_plan')])
      .then(([users, ringGroups, dialPlans]) => {
        setGroups([
          { label: 'Users', items: users },
          { label: 'Ring Groups', items: ringGroups },
          { label: 'Dial Plans', items: dialPlans },
        ]);
      })
      .catch(() => {});
  }, [listResources]);

  const targetId = (config.target_id as string) ?? '';
  const timeout = (config.timeout as number) ?? 30;

  function handleChange(updates: Record<string, unknown>, display?: Record<string, unknown>) {
    onConfigChange({ target_id: targetId, timeout, ...updates }, display);
  }

  return (
    <>
      <div className="ds-dial-plan-config-field">
        <label className="ds-dial-plan-config-field__label">Target</label>
        <select
          className="ds-dial-plan-config-field__select"
          value={targetId}
          onChange={(e) => {
            const selectedOption = e.target.selectedOptions[0];
            handleChange(
              { target_id: e.target.value },
              { targetName: selectedOption?.textContent || '' }
            );
          }}
        >
          <option value="">— Select target —</option>
          {groups.map((group) =>
            group.items.length > 0 ? (
              <optgroup key={group.label} label={group.label}>
                {group.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            ) : null
          )}
        </select>
      </div>
      <div className="ds-dial-plan-config-field">
        <label className="ds-dial-plan-config-field__label">Timeout (seconds)</label>
        <input
          className="ds-dial-plan-config-field__input"
          type="number"
          min={0}
          max={300}
          value={timeout}
          onChange={(e) => handleChange({ timeout: Number(e.target.value) })}
        />
      </div>
    </>
  );
}
