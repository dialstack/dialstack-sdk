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

  const getLabel = (reg: { type: string; label: string }) => {
    if (!locale) return reg.label;
    switch (reg.type) {
      case 'schedule':
        return locale.nodeTypes.schedule;
      case 'internal_dial':
        return locale.nodeTypes.internalDial;
      case 'ring_all_users':
        return locale.nodeTypes.ringAllUsers;
      case 'voicemail':
        return locale.nodeTypes.voicemail;
      default:
        return reg.label;
    }
  };

  const getDescription = (reg: { type: string; description: string }) => {
    if (!locale) return reg.description;
    switch (reg.type) {
      case 'schedule':
        return locale.nodeDescriptions.schedule;
      case 'internal_dial':
        return locale.nodeDescriptions.internalDial;
      case 'ring_all_users':
        return locale.nodeDescriptions.ringAllUsers;
      case 'voicemail':
        return locale.nodeDescriptions.voicemail;
      default:
        return reg.description;
    }
  };

  return (
    <div className="ds-dial-plan-node-library">
      {registrations.map((reg) => (
        <div
          key={reg.type}
          className={`ds-dial-plan-node-library__item ds-dial-plan-node-library__item--${reg.type}`}
          draggable={true}
          onClick={() => onAddNode(reg.type)}
          onDragStart={(event) => {
            event.dataTransfer.setData('application/reactflow', reg.type);
            event.dataTransfer.effectAllowed = 'move';
          }}
          title={getDescription(reg)}
        >
          <span className="ds-dial-plan-node-library__item-icon">{reg.icon}</span>
          <span className="ds-dial-plan-node-library__item-label">{getLabel(reg)}</span>
        </div>
      ))}
    </div>
  );
}
