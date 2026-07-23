import React from 'react';
import type { ConfigPanelProps } from '../registry-types';
import { TimeoutField } from './fields/TimeoutField';

export const RingAllUsersConfigPanel = ({ config, onConfigChange, locale }: ConfigPanelProps) => {
  const timeout = (config.timeout as number) ?? 24;

  return (
    <TimeoutField
      value={timeout}
      min={1}
      max={300}
      onChange={(t) => onConfigChange({ timeout: t })}
      locale={locale}
    />
  );
};
