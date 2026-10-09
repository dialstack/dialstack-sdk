import React from 'react';

interface OpenResourceLinkProps {
  resourceId: string;
  onOpenResource: (resourceId: string) => void;
  label: string;
}

export const OpenResourceLink = ({ resourceId, onOpenResource, label }: OpenResourceLinkProps) => {
  return (
    <button
      type="button"
      className="ds-dial-plan-config-field__open-link"
      onClick={() => onOpenResource(resourceId)}
    >
      {/* Expand, not external-link: the host decides whether this opens a modal or a tab. */}
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
        <polyline points="15 3 21 3 21 9" />
        <polyline points="9 21 3 21 3 15" />
        <line x1="21" y1="3" x2="14" y2="10" />
        <line x1="3" y1="21" x2="10" y2="14" />
      </svg>
      {label}
    </button>
  );
};
