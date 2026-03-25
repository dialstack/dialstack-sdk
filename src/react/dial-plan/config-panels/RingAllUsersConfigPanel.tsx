import React from 'react';
import type { ConfigPanelProps } from '../registry-types';

export function RingAllUsersConfigPanel({ config, onConfigChange }: ConfigPanelProps) {
  const timeout = (config.timeout as number) ?? 24;

  return (
    <div className="ds-dial-plan-config-field">
      <label className="ds-dial-plan-config-field__label">Timeout (seconds)</label>
      <input
        className="ds-dial-plan-config-field__input"
        type="number"
        min={1}
        max={300}
        value={timeout}
        onChange={(e) => onConfigChange({ timeout: Number(e.target.value) })}
      />
    </div>
  );
}
