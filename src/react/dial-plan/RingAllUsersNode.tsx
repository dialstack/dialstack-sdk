/**
 * Ring All Users Node Component
 *
 * Represents a ring-all action in a dial plan. Displays as a rounded
 * rectangle showing a users/group icon with optional timeout exit.
 */

import React, { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { RingAllUsersNodeData } from '../../types/dial-plan';

type RingAllUsersNodeType = Node<RingAllUsersNodeData, 'ringAllUsers'>;

export const RingAllUsersNode = memo(function RingAllUsersNode({
  data,
  selected,
}: NodeProps<RingAllUsersNodeType>) {
  // Always show exit handles so edges can be created in the editor.
  // In the viewer, nodesConnectable=false prevents interaction.
  const hasNextExit = true;

  const usersIcon = (
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
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );

  const ringAllLabel = data.label ?? 'Ring All';
  const noAnswerLabel = data.locale?.exits.next ?? 'No Answer';

  return (
    <div
      className={`ds-dial-plan-node ds-dial-plan-node--ring-all-users ${selected ? 'ds-dial-plan-node--selected' : ''} ${hasNextExit ? 'ds-dial-plan-node--has-exits' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="ds-dial-plan-handle" />
      <div className="ds-dial-plan-node__header">
        <div className="ds-dial-plan-node__icon">{usersIcon}</div>
        <span className="ds-dial-plan-node__type-label">
          {ringAllLabel}
          {data.timeout !== undefined && (
            <span style={{ textTransform: 'none' }}> ({data.timeout}s)</span>
          )}
        </span>
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
