import React from 'react';

interface ConfigFieldProps {
  label: string;
  /** Optional element rendered alongside the label in a flex header (e.g. "+ Add" button). */
  action?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Standard `<div class="ds-dial-plan-config-field">` + label wrapper.
 * Pass `action` to render a button or link to the right of the label
 * inside a flex header.
 */
export function ConfigField({ label, action, children }: ConfigFieldProps) {
  return (
    <div className="ds-dial-plan-config-field">
      {action ? (
        <div className="ds-dial-plan-config-field__header">
          <label className="ds-dial-plan-config-field__label">{label}</label>
          {action}
        </div>
      ) : (
        <label className="ds-dial-plan-config-field__label">{label}</label>
      )}
      {children}
    </div>
  );
}
