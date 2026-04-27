import React from 'react';
import type { DialPlanLocale } from '../../types/dial-plan';
import type { NodeTypeRegistry } from './registry';

interface NodeLibraryProps {
  registry: NodeTypeRegistry;
  onAddNode: (type: string, position?: { x: number; y: number }) => void;
  locale?: DialPlanLocale;
}

export function NodeLibrary({ registry, onAddNode, locale }: NodeLibraryProps): React.ReactElement {
  const registrations = registry.getAll();

  return (
    <div className="ds-dial-plan-node-library">
      {registrations.map((reg) => {
        const label = locale?.nodeTypes[reg.localeKey] ?? reg.label;
        const description = locale?.nodeDescriptions[reg.localeKey] ?? reg.description;

        return (
          <div
            key={reg.type}
            className={`ds-dial-plan-node-library__item ds-dial-plan-node-library__item--${reg.type}`}
            style={
              {
                '--node-color': reg.color,
              } as React.CSSProperties
            }
            draggable={true}
            onClick={() => onAddNode(reg.type)}
            onDragStart={(event) => {
              event.dataTransfer.setData('application/reactflow', reg.type);
              event.dataTransfer.effectAllowed = 'move';
            }}
            title={description}
          >
            <span className="ds-dial-plan-node-library__item-icon">{reg.icon}</span>
            <span className="ds-dial-plan-node-library__item-label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
