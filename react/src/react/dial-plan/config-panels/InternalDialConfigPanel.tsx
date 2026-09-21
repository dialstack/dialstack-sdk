import React, { useRef } from 'react';
import type { ConfigPanelProps } from '../registry-types';
import { OpenResourceLink } from './OpenResourceLink';
import { ResourceCombobox } from './ResourceCombobox';
import { ConfigField } from './fields/ConfigField';
import { SegmentedField } from './fields/SegmentedField';
import { TimeoutField } from './fields/TimeoutField';
import { useResourceGroups } from './hooks/useResourceGroups';

export const InternalDialConfigPanel = ({
  nodeId,
  config,
  nodeData,
  onConfigChange,
  listResources,
  onCreateResource,
  onOpenResource,
  locale,
}: ConfigPanelProps) => {
  const { groups, loading, handleCreateResource } = useResourceGroups(
    [
      { type: 'user', labelKey: 'users', fallback: 'Users' },
      { type: 'ring_group', labelKey: 'ringGroups', fallback: 'Ring Groups' },
      { type: 'queue', labelKey: 'queues', fallback: 'Queues' },
      { type: 'dial_plan', labelKey: 'dialPlans', fallback: 'Dial Plans' },
    ],
    listResources,
    onCreateResource,
    locale
  );

  const targetId = (config.target_id as string) ?? '';
  const timeout = (config.timeout as number) ?? 30;
  const timeoutOverride = (config.timeout_override as boolean) ?? false;

  // The API refuses an override of 0, because 0 means "skip this node without
  // dialing" and a node that dials nothing has nothing to overrule. The panel
  // keeps that pair unreachable rather than letting it fail at save, where it
  // arrives as a 400 on the whole plan.
  const minTimeout = timeoutOverride ? 1 : 0;

  // Grey the number only where it is genuinely inert — the override off *and*
  // the target owning timing of its own. Against a user with no Find Me /
  // Follow Me ladder the number rings their devices whatever the toggle says,
  // and a stored 0 skips the node whatever the target owns, so both stay
  // editable. enrichNode computes this, since the target's timing is known
  // only once the resource resolves.
  const timeoutInert = nodeData?.timeoutInert === true;

  // Turning the override on over a skipped node raises the 0 to 1 so the
  // rejected pair is never stored. Remember it for the length of this edit:
  // the number is greyed for a target that owns timing, so without this the
  // toggle would be the only way in and turning it back off would leave a
  // one-second ring where the plan meant to skip. The panel instance is reused
  // across selections, so the memory carries the node it belongs to.
  const promotedFrom = useRef<{ nodeId?: string; timeout: number } | null>(null);

  // Target sits above Timeout so it stays anchored under the panel header as
  // the target type and the toggle state change the fields below it.
  return (
    <>
      <ConfigField label={locale?.configLabels.target ?? 'Target'}>
        <ResourceCombobox
          groups={groups}
          value={targetId}
          loading={loading}
          placeholder={locale?.configLabels.searchTargets ?? 'Search targets…'}
          onSelect={(id, name) => onConfigChange({ target_id: id }, { targetName: name })}
          onCreateResource={handleCreateResource}
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
      </ConfigField>
      <SegmentedField<'off' | 'on'>
        label={locale?.configLabels.timeoutOverride ?? 'Override resource timeout'}
        value={timeoutOverride ? 'on' : 'off'}
        options={[
          { value: 'off', label: locale?.configLabels.timeoutOverrideOff ?? 'Off' },
          { value: 'on', label: locale?.configLabels.timeoutOverrideOn ?? 'On' },
        ]}
        onChange={(next) => {
          if (next === 'on') {
            promotedFrom.current = timeout === 0 ? { nodeId, timeout: 0 } : null;
            onConfigChange(
              timeout === 0 ? { timeout_override: true, timeout: 1 } : { timeout_override: true }
            );
            return;
          }
          const promoted = promotedFrom.current;
          const restored = promoted && promoted.nodeId === nodeId ? promoted.timeout : undefined;
          promotedFrom.current = null;
          onConfigChange(
            restored === undefined
              ? { timeout_override: false }
              : { timeout_override: false, timeout: restored }
          );
        }}
      />
      <TimeoutField
        value={timeout}
        min={minTimeout}
        max={300}
        disabled={timeoutInert}
        onChange={(t) => {
          promotedFrom.current = null;
          onConfigChange({ timeout: t });
        }}
        locale={locale}
      />
    </>
  );
};
