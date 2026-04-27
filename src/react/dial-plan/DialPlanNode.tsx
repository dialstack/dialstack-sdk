import React, { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { DialPlanLocale } from '../../types/dial-plan';
import type { NodeTypeRegistry } from './registry';
import type { ExitDefinition } from './registry-types';

// ============================================================================
// Composable building blocks — used by renderNode implementations
// ============================================================================

/** Standard node header: icon + label + optional timeout + optional subtitle. */
export function NodeHeader({
  icon,
  label,
  timeout,
  subtitle,
}: {
  icon: React.ReactElement;
  label: string;
  timeout?: number;
  subtitle?: string;
}) {
  return (
    <div className="ds-dial-plan-node__header">
      <div className="ds-dial-plan-node__icon">{icon}</div>
      <span className="ds-dial-plan-node__type-label">
        {label}
        {timeout !== undefined && <span style={{ textTransform: 'none' }}> ({timeout}s)</span>}
      </span>
      {subtitle && <span className="ds-dial-plan-node__name">{subtitle}</span>}
    </div>
  );
}

/** A single exit row with label and source handle. */
export function ExitRow({ id, label }: { id: string; label: string }) {
  return (
    <div className="ds-dial-plan-node__exit-row">
      <span className="ds-dial-plan-node__exit-label">{label}</span>
      <Handle
        type="source"
        position={Position.Right}
        id={id}
        className="ds-dial-plan-handle ds-dial-plan-handle--next"
      />
    </div>
  );
}

/** Render static exits from registration definitions, with optional locale lookup. */
export function StaticExits({
  exits,
  locale,
}: {
  exits: ExitDefinition[];
  locale?: DialPlanLocale;
}) {
  if (exits.length === 0) return null;
  return (
    <>
      {exits.map((exit) => (
        <ExitRow
          key={exit.id}
          id={exit.id}
          label={
            (exit.localeExitKey &&
              locale?.exits[exit.localeExitKey as keyof typeof locale.exits]) ||
            exit.label
          }
        />
      ))}
    </>
  );
}

// ============================================================================
// Node shell — the outer chrome shared by all nodes
// ============================================================================

interface DialPlanNodeData extends Record<string, unknown> {
  label: string;
  locale?: DialPlanLocale;
}

type DialPlanNodeType = Node<DialPlanNodeData>;

/** Creates a memo'd DialPlanNode component bound to a specific registry. */
export function createDialPlanNode(registry: NodeTypeRegistry) {
  return memo(function DialPlanNode({ data, selected, type }: NodeProps<DialPlanNodeType>) {
    const reg = registry.getByFlowType(type ?? '');
    if (!reg) return null;

    const content = reg.renderNode(data, reg);
    // Convert flowType (camelCase) to CSS class (kebab-case): internalDial → internal-dial
    const typeClass = reg.type.replace(/_/g, '-');

    return (
      <div
        className={`ds-dial-plan-node ds-dial-plan-node--themed ds-dial-plan-node--${typeClass} ${selected ? 'ds-dial-plan-node--selected' : ''}`}
        style={{ '--node-color': reg.color } as React.CSSProperties}
      >
        <Handle type="target" position={Position.Left} className="ds-dial-plan-handle" />
        {content}
      </div>
    );
  });
}
