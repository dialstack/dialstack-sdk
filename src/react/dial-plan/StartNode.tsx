/**
 * Start Node Component
 *
 * Represents the entry point of a dial plan. Displays as a circular
 * "Start" indicator with a single output handle.
 */

import React, { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { StartNodeData } from '../../types/dial-plan';

type StartNodeType = Node<StartNodeData, 'start'>;

export const StartNode = memo(function StartNode({ data }: NodeProps<StartNodeType>) {
  return (
    <div className="ds-dial-plan-node ds-dial-plan-node--start">
      <div className="ds-dial-plan-node__content">
        <span className="ds-dial-plan-node__label">{data.label}</span>
      </div>
      <Handle type="source" position={Position.Right} className="ds-dial-plan-handle" />
    </div>
  );
});
