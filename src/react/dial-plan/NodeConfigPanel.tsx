import React, { useEffect } from 'react';
import type { NodeTypeRegistration, ConfigPanelProps } from './registry-types';

interface NodeConfigPanelProps {
  node: { id: string; type: string; data: Record<string, unknown> };
  registration: NodeTypeRegistration;
  onConfigChange: (
    nodeId: string,
    updates: Record<string, unknown>,
    display?: Record<string, unknown>
  ) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
  listResources: ConfigPanelProps['listResources'];
  onCreateResource?: ConfigPanelProps['onCreateResource'];
}

export function NodeConfigPanel({
  node,
  registration,
  onConfigChange,
  onDelete,
  onClose,
  listResources,
  onCreateResource,
}: NodeConfigPanelProps) {
  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  const originalNode = node.data.originalNode as { config: Record<string, unknown> } | undefined;
  const config = originalNode?.config ?? {};

  const ConfigPanel = registration.configPanel;

  return (
    <div className="ds-dial-plan-config-panel">
      <div className="ds-dial-plan-config-panel__header">
        <span className="ds-dial-plan-config-panel__header-icon">{registration.icon}</span>
        <span className="ds-dial-plan-config-panel__header-label">{registration.label}</span>
        <button
          type="button"
          className="ds-dial-plan-config-panel__delete"
          onClick={() => {
            onDelete(node.id);
            onClose();
          }}
        >
          Delete
        </button>
        <button
          className="ds-dial-plan-config-panel__close"
          onClick={onClose}
          title="Close"
          type="button"
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="ds-dial-plan-config-panel__body">
        <ConfigPanel
          config={config}
          onConfigChange={(updates, display) => onConfigChange(node.id, updates, display)}
          listResources={listResources}
          onCreateResource={onCreateResource}
        />
      </div>
    </div>
  );
}
