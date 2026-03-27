/**
 * Voicemail Node Component
 *
 * Represents a voicemail action in a dial plan. Routes the call directly
 * to a user's voicemail or a shared voicemail box. Terminal node — no exits.
 */

import React, { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { InternalDialNodeData } from '../../types/dial-plan';

type VoicemailNodeType = Node<InternalDialNodeData, 'voicemail'>;

const voicemailIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="5.5" cy="11.5" r="4.5" />
    <circle cx="18.5" cy="11.5" r="4.5" />
    <line x1="5.5" y1="16" x2="18.5" y2="16" />
  </svg>
);

export const VoicemailNode = memo(function VoicemailNode({
  data,
  selected,
}: NodeProps<VoicemailNodeType>) {
  const voicemailLabel = data.locale?.nodeTypes.voicemail ?? 'Voicemail';

  return (
    <div
      className={`ds-dial-plan-node ds-dial-plan-node--voicemail ${selected ? 'ds-dial-plan-node--selected' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="ds-dial-plan-handle" />
      <div className="ds-dial-plan-node__header">
        <div className="ds-dial-plan-node__icon">{voicemailIcon}</div>
        <span className="ds-dial-plan-node__type-label">{voicemailLabel}</span>
        {(data.targetType || data.targetName) && (
          <span className="ds-dial-plan-node__name">
            {data.targetType && data.targetName
              ? `${data.targetType}: ${data.targetName}`
              : data.targetType || data.targetName}
          </span>
        )}
      </div>
    </div>
  );
});
