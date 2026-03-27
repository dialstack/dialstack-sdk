import React, { useCallback, useEffect, useState } from 'react';
import type { ConfigPanelProps, ResourceType } from '../registry-types';
import { ResourceCombobox, type ResourceGroup } from './ResourceCombobox';

export function VoicemailConfigPanel({
  config,
  onConfigChange,
  listResources,
  onCreateResource,
}: ConfigPanelProps) {
  const [groups, setGroups] = useState<ResourceGroup[]>([]);

  const fetchResources = useCallback(
    () =>
      Promise.all([listResources('user'), listResources('shared_voicemail')])
        .then(([users, sharedVoicemails]) => {
          setGroups([
            { label: 'Users', type: 'user', items: users },
            { label: 'Shared Voicemail Boxes', type: 'shared_voicemail', items: sharedVoicemails },
          ]);
        })
        .catch(() => {}),
    [listResources]
  );

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const targetId = (config.target_id as string) ?? '';

  async function handleCreateResource(type: ResourceType) {
    if (!onCreateResource) return undefined;
    const created = await onCreateResource(type);
    if (created) {
      await fetchResources();
    }
    return created;
  }

  return (
    <div className="ds-dial-plan-config-field">
      <label className="ds-dial-plan-config-field__label">Target</label>
      <ResourceCombobox
        groups={groups}
        value={targetId}
        placeholder="Search targets…"
        onSelect={(id, name) => onConfigChange({ target_id: id, timeout: 0 }, { targetName: name })}
        onCreateResource={handleCreateResource}
      />
    </div>
  );
}
