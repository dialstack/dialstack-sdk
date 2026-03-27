import React, { useEffect, useState } from 'react';
import type { ConfigPanelProps } from '../registry-types';

interface ResourceGroup {
  label: string;
  items: Array<{ id: string; name: string }>;
}

export function VoicemailConfigPanel({ config, onConfigChange, listResources }: ConfigPanelProps) {
  const [groups, setGroups] = useState<ResourceGroup[]>([]);

  useEffect(() => {
    Promise.all([listResources('user'), listResources('shared_voicemail')])
      .then(([users, sharedVoicemails]) => {
        setGroups([
          { label: 'Users', items: users },
          { label: 'Shared Voicemail Boxes', items: sharedVoicemails },
        ]);
      })
      .catch(() => {});
  }, [listResources]);

  const targetId = (config.target_id as string) ?? '';

  return (
    <div className="ds-dial-plan-config-field">
      <label className="ds-dial-plan-config-field__label">Target</label>
      <select
        className="ds-dial-plan-config-field__select"
        value={targetId}
        onChange={(e) => {
          const selectedOption = e.target.selectedOptions[0];
          onConfigChange(
            { target_id: e.target.value, timeout: 0 },
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
  );
}
