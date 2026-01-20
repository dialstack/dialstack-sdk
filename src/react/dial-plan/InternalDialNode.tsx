/**
 * Internal Dial Node Component
 *
 * Represents an internal dial action in a dial plan. Displays as a rounded
 * rectangle showing the target user/group with optional timeout exit.
 */

import React, { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { InternalDialNodeData } from '../../types/dial-plan';

type InternalDialNodeType = Node<InternalDialNodeData, 'internalDial'>;

export const InternalDialNode = memo(function InternalDialNode({
  data,
  selected,
}: NodeProps<InternalDialNodeType>) {
  const hasNextExit = data.originalNode.config.next !== undefined;
  const isVoicemail = data.timeout === 0;

  // Phone icon for dial nodes
  const phoneIcon = (
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
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );

  // Voicemail icon for timeout=0 nodes
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

  const nodeClass = isVoicemail
    ? 'ds-dial-plan-node ds-dial-plan-node--voicemail'
    : 'ds-dial-plan-node ds-dial-plan-node--internal-dial';

  // Use locale strings with fallbacks
  const voicemailLabel = data.locale?.nodeTypes.voicemail ?? 'Voicemail';
  const noAnswerLabel = data.locale?.exits.next ?? 'No Answer';

  return (
    <div
      className={`${nodeClass} ${selected ? 'ds-dial-plan-node--selected' : ''} ${hasNextExit ? 'ds-dial-plan-node--has-exits' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="ds-dial-plan-handle" />
      <div className="ds-dial-plan-node__header">
        <div className="ds-dial-plan-node__icon">{isVoicemail ? voicemailIcon : phoneIcon}</div>
        <span className="ds-dial-plan-node__type-label">
          {isVoicemail ? voicemailLabel : data.targetType || data.label}
          {!isVoicemail && data.timeout !== undefined && ` (${data.timeout}s)`}
        </span>
        {data.targetName && <span className="ds-dial-plan-node__name">{data.targetName}</span>}
      </div>
      {hasNextExit && (
        <div className="ds-dial-plan-node__exits">
          <div className="ds-dial-plan-node__exit-row">
            <span className="ds-dial-plan-node__exit-label">{noAnswerLabel}</span>
            <Handle
              type="source"
              position={Position.Right}
              id="next"
              className="ds-dial-plan-handle ds-dial-plan-handle--next"
            />
          </div>
        </div>
      )}
    </div>
  );
});
