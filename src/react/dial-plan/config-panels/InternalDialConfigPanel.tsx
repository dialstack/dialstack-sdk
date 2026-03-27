import React, { useCallback, useEffect, useState } from 'react';
import type { ConfigPanelProps, ResourceType } from '../registry-types';
import { ResourceCombobox, type ResourceGroup } from './ResourceCombobox';

export function InternalDialConfigPanel({
  config,
  onConfigChange,
  listResources,
  onCreateResource,
}: ConfigPanelProps) {
  const [groups, setGroups] = useState<ResourceGroup[]>([]);

  const fetchResources = useCallback(
    () =>
      Promise.all([
        listResources('user'),
        listResources('ring_group'),
        listResources('dial_plan'),
        listResources('voice_app'),
      ])
        .then(([users, ringGroups, dialPlans, voiceApps]) => {
          setGroups([
            { label: 'Users', type: 'user', items: users },
            { label: 'Ring Groups', type: 'ring_group', items: ringGroups },
            { label: 'Dial Plans', type: 'dial_plan', items: dialPlans },
            { label: 'Voice Apps', type: 'voice_app', items: voiceApps },
          ]);
        })
        .catch(() => {}),
    [listResources]
  );

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const targetId = (config.target_id as string) ?? '';
  const timeout = (config.timeout as number) ?? 30;

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

  async function handleCreateResource(type: ResourceType) {
    if (!onCreateResource) return undefined;
    const created = await onCreateResource(type);
    if (created) {
      await fetchResources();
    }
    return created;
  }

  return (
    <>
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
      <div className="ds-dial-plan-config-field">
        <label className="ds-dial-plan-config-field__label">Target</label>
        <ResourceCombobox
          groups={groups}
          value={targetId}
          placeholder="Search targets…"
          onSelect={handleTargetChange}
          onCreateResource={handleCreateResource}
        />
      </div>
    </>
  );
}
