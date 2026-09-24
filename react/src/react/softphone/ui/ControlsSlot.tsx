import React from 'react';

const CONTROL_SLOTS = 6;

export const ControlsSlot: React.FC = () => (
  <div className="ds-controls ds-controls-slot" aria-hidden="true">
    {Array.from({ length: CONTROL_SLOTS }, (_, i) => (
      <span key={i} className="ds-control">
        <span className="ds-control-glyph" />
        <span className="ds-control-label">&nbsp;</span>
      </span>
    ))}
  </div>
);
