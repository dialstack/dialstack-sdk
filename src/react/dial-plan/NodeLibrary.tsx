import React from 'react';
import type { NodeTypeRegistry } from './registry';

interface NodeLibraryProps {
  registry: NodeTypeRegistry;
  onAddNode: (type: string, position?: { x: number; y: number }) => void;
  onCollapse?: () => void;
}

export function NodeLibrary({
  registry,
  onAddNode,
  onCollapse,
}: NodeLibraryProps): React.ReactElement {
  const registrations = registry.getAll();

  return (
    <div className="ds-dial-plan-node-library">
      <div className="ds-dial-plan-node-library__title">
        <span>Node Library</span>
        {onCollapse && (
          <button
            type="button"
            className="ds-dial-plan-node-library__collapse"
            onClick={onCollapse}
            title="Collapse library"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="11 17 6 12 11 7" />
              <polyline points="18 17 13 12 18 7" />
            </svg>
          </button>
        )}
      </div>
      {registrations.map((reg) => (
        <div
          key={reg.type}
          className="ds-dial-plan-node-library__item"
          draggable={true}
          onClick={() => onAddNode(reg.type)}
          onDragStart={(event) => {
            event.dataTransfer.setData('application/reactflow', reg.type);
            event.dataTransfer.effectAllowed = 'move';
          }}
        >
          <span className="ds-dial-plan-node-library__item-icon">{reg.icon}</span>
          <span className="ds-dial-plan-node-library__item-label">{reg.label}</span>
          <span className="ds-dial-plan-node-library__item-desc">{reg.description}</span>
        </div>
      ))}
      <div className="ds-dial-plan-node-library__hint">Click or drag to add</div>
    </div>
  );
}
