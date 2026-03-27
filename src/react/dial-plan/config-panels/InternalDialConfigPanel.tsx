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
    Promise.all([
      listResources('user'),
      listResources('ring_group'),
      listResources('dial_plan'),
      listResources('voice_app'),
    ])
      .then(([users, ringGroups, dialPlans, voiceApps]) => {
        setGroups([
          { label: 'Users', items: users },
          { label: 'Ring Groups', items: ringGroups },
          { label: 'Dial Plans', items: dialPlans },
          { label: 'Voice Apps', items: voiceApps },
        ]);
      })
      .catch(() => {});
  }, [listResources]);

  const targetId = (config.target_id as string) ?? '';
  const timeout = (config.timeout as number) ?? 30;

  // Terminal targets (voice apps, dial plans, shared voicemail) have no timeout
  const isTerminalTarget =
    targetId.startsWith('va_') || targetId.startsWith('dp_') || targetId.startsWith('svm_');

  function handleChange(updates: Record<string, unknown>, display?: Record<string, unknown>) {
    onConfigChange({ target_id: targetId, timeout, ...updates }, display);
  }

  function handleTargetChange(newTargetId: string, targetName: string) {
    const terminal =
      newTargetId.startsWith('va_') ||
      newTargetId.startsWith('dp_') ||
      newTargetId.startsWith('svm_');
    handleChange(
      { target_id: newTargetId, ...(terminal ? { timeout: 0, next: undefined } : {}) },
      { targetName }
    );
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
            handleTargetChange(e.target.value, selectedOption?.textContent || '');
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
      {!isTerminalTarget && (
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
      )}
    </>
  );
}
