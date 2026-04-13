import React, { useEffect, useRef } from 'react';
import type { DialPlanLocale } from '../../types/dial-plan';
import type { NodeTypeRegistration, ConfigPanelProps } from './registry-types';

export const trashIcon = (
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
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

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
  onOpenResource?: ConfigPanelProps['onOpenResource'];
  locale?: DialPlanLocale;
}

export function NodeConfigPanel({
  node,
  registration,
  onConfigChange,
  onDelete,
  onClose,
  listResources,
  onCreateResource,
  onOpenResource,
  locale,
}: NodeConfigPanelProps) {
  // Close on Escape key
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    const rootNode = panelRef.current?.getRootNode();
    const target: Pick<Document, 'addEventListener' | 'removeEventListener'> =
      rootNode instanceof ShadowRoot || rootNode instanceof Document ? rootNode : document;
    const onKey = ((e: KeyboardEvent) => handleKeyDown(e)) as EventListener;
    target.addEventListener('keydown', onKey);
    return () => target.removeEventListener('keydown', onKey);
  }, [onClose]);
  const originalNode = node.data.originalNode as { config: Record<string, unknown> } | undefined;
  const config = originalNode?.config ?? {};

  const ConfigPanel = registration.configPanel;

  return (
    <div ref={panelRef} className="ds-dial-plan-config-panel">
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
          title={locale?.panel.delete_ ?? 'Delete'}
        >
          {trashIcon}
        </button>
        <button
          className="ds-dial-plan-config-panel__close"
          onClick={onClose}
          title={locale?.panel.close ?? 'Close'}
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
          onOpenResource={onOpenResource}
          locale={locale}
        />
      </div>
    </div>
  );
}
