/**
 * Schedule Node Component
 *
 * Represents a schedule-based routing node in a dial plan. Displays as a
 * diamond/decision shape with three output handles for open, closed, and holiday exits.
 */

import React, { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { ScheduleNodeData } from '../../types/dial-plan';

type ScheduleNodeType = Node<ScheduleNodeData, 'schedule'>;

export const ScheduleNode = memo(function ScheduleNode({
  data,
  selected,
}: NodeProps<ScheduleNodeType>) {
  // Use locale strings with fallbacks
  const openLabel = data.locale?.exits.open ?? 'Open';
  const closedLabel = data.locale?.exits.closed ?? 'Closed';
  const holidayLabel = data.locale?.exits.holiday ?? 'Holiday';

  return (
    <div
      className={`ds-dial-plan-node ds-dial-plan-node--schedule ${selected ? 'ds-dial-plan-node--selected' : ''}`}
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
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <span className="ds-dial-plan-node__type-label">{data.label}</span>
        {data.scheduleName && <span className="ds-dial-plan-node__name">{data.scheduleName}</span>}
      </div>
      <div className="ds-dial-plan-node__exits">
        <div className="ds-dial-plan-node__exit-row">
          <span className="ds-dial-plan-node__exit-label">{openLabel}</span>
          <Handle
            type="source"
            position={Position.Right}
            id="open"
            className="ds-dial-plan-handle ds-dial-plan-handle--open"
          />
        </div>
        <div className="ds-dial-plan-node__exit-row">
          <span className="ds-dial-plan-node__exit-label">{closedLabel}</span>
          <Handle
            type="source"
            position={Position.Right}
            id="closed"
            className="ds-dial-plan-handle ds-dial-plan-handle--closed"
          />
        </div>
        <div className="ds-dial-plan-node__exit-row">
          <span className="ds-dial-plan-node__exit-label">{holidayLabel}</span>
          <Handle
            type="source"
            position={Position.Right}
            id="holiday"
            className="ds-dial-plan-handle ds-dial-plan-handle--holiday"
          />
        </div>
      </div>
    </div>
  );
});
