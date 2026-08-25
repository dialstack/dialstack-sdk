import React from 'react';

interface ConfigFieldProps {
  label: string;
  /**
   * Id of the control this labels. The label is a sibling of the control rather
   * than wrapping it, so without this the two never associate and the control
   * has no accessible name.
   */
  htmlFor?: string;
  /** Optional element rendered alongside the label in a flex header (e.g. "+ Add" button). */
  action?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Standard `<div class="ds-dial-plan-config-field">` + label wrapper.
 * Pass `action` to render a button or link to the right of the label
 * inside a flex header.
 */
export const ConfigField = ({ label, htmlFor, action, children }: ConfigFieldProps) => {
  return (
    <div className="ds-dial-plan-config-field">
      {action ? (
        <div className="ds-dial-plan-config-field__header">
          <label className="ds-dial-plan-config-field__label" htmlFor={htmlFor}>
            {label}
          </label>
          {action}
        </div>
      ) : (
        <label className="ds-dial-plan-config-field__label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
    </div>
  );
};
