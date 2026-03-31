import React from 'react';

interface OpenResourceLinkProps {
  resourceId: string;
  onOpenResource: (resourceId: string) => void;
  label: string;
}

export function OpenResourceLink({ resourceId, onOpenResource, label }: OpenResourceLinkProps) {
  return (
    <button
      type="button"
      className="ds-dial-plan-config-field__open-link"
      onClick={() => onOpenResource(resourceId)}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
      {label}
    </button>
  );
}
