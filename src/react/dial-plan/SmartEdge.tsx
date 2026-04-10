/**
 * SmartEdge — renders a straight line when source and target handles are
 * nearly aligned vertically, otherwise falls back to SmoothStep routing.
 */

import React from 'react';
import { getSmoothStepPath, getStraightPath, BaseEdge, type EdgeProps } from '@xyflow/react';

/** Maximum Y difference (px) before switching from straight to smoothstep */
const STRAIGHT_THRESHOLD = 1;

export function SmartEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style } =
    props;

  const dy = Math.abs(sourceY - targetY);

  const [path] =
    dy <= STRAIGHT_THRESHOLD
      ? getStraightPath({ sourceX, sourceY, targetX, targetY })
      : getSmoothStepPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition,
          targetPosition,
          borderRadius: 8,
        });

  return <BaseEdge path={path} markerEnd={markerEnd} style={style} />;
}
