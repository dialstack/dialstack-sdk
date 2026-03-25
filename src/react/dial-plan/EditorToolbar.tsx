/**
 * EditorToolbar Component
 *
 * Toolbar positioned at the top-right of the canvas with Auto Layout and Save.
 */

import React, { memo } from 'react';

export interface EditorToolbarProps {
  onAutoLayout: () => void;
  onSave?: () => void;
  isDirty?: boolean;
}

export const EditorToolbar = memo(function EditorToolbar({
  onAutoLayout,
  onSave,
  isDirty,
}: EditorToolbarProps) {
  return (
    <div className="ds-dial-plan-editor-toolbar">
      <button
        className="ds-dial-plan-editor-toolbar__button"
        onClick={onAutoLayout}
        title="Auto Layout"
        type="button"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <line x1="6.5" y1="10" x2="6.5" y2="17" />
          <line x1="6.5" y1="17" x2="14" y2="17.5" />
        </svg>
        <span>Auto Layout</span>
      </button>
      {onSave && (
        <button
          className="ds-dial-plan-editor-toolbar__button"
          onClick={onSave}
          title="Save"
          type="button"
          disabled={!isDirty}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          <span>Save</span>
        </button>
      )}
    </div>
  );
});
