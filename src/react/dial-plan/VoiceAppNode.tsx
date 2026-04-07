/**
 * Voice App Node Component
 *
 * Represents a voice application action in a dial plan. Features an AI-inspired
 * gradient design with a sparkle/brain icon to distinguish it from other nodes.
 */

import React, { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { VoiceAppNodeData } from '../../types/dial-plan';

type VoiceAppNodeType = Node<VoiceAppNodeData, 'voiceApp'>;

export const VoiceAppNode = memo(function VoiceAppNode({
  data,
  selected,
}: NodeProps<VoiceAppNodeType>) {
  const noAnswerLabel = data.locale?.exits.next ?? 'No Answer';

  return (
    <div
      className={`ds-dial-plan-node ds-dial-plan-node--voice-app ${selected ? 'ds-dial-plan-node--selected' : ''} ds-dial-plan-node--has-exits`}
    >
      <Handle type="target" position={Position.Left} className="ds-dial-plan-handle" />
      <div className="ds-dial-plan-node__header">
        <div className="ds-dial-plan-node__icon">
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
            <path d="M12 8V4H8" />
            <rect width="16" height="12" x="4" y="8" rx="2" />
            <path d="M2 14h2" />
            <path d="M20 14h2" />
            <path d="M15 13v2" />
            <path d="M9 13v2" />
          </svg>
        </div>
        <span className="ds-dial-plan-node__type-label">
          {data.label}
          {data.timeout !== undefined && (
            <span style={{ textTransform: 'none' }}> ({data.timeout}s)</span>
          )}
        </span>
        {data.targetName && <span className="ds-dial-plan-node__name">{data.targetName}</span>}
      </div>
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
    </div>
  );
});
