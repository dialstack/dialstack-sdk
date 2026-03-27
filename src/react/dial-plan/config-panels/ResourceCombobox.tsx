import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Command } from 'cmdk';
import type { ResourceType } from '../registry-types';

export interface ResourceGroup {
  label: string;
  type?: ResourceType;
  items: Array<{ id: string; name: string }>;
}

interface ResourceComboboxProps {
  groups: ResourceGroup[];
  value: string;
  placeholder?: string;
  onSelect: (id: string, name: string) => void;
  onCreateResource?: (type: ResourceType) => Promise<{ id: string; name: string } | undefined>;
}

export function ResourceCombobox({
  groups,
  value,
  placeholder = 'Search…',
  onSelect,
  onCreateResource,
}: ResourceComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setSearch('');
      }
    }
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [open]);

  const selectedName = useMemo(() => {
    if (!value) return '';
    for (const group of groups) {
      const item = group.items.find((i) => i.id === value);
      if (item) return item.name;
    }
    return '';
  }, [value, groups]);

  async function handleCreateNew(type: ResourceType) {
    if (!onCreateResource) return;
    const created = await onCreateResource(type);
    if (created) {
      onSelect(created.id, created.name);
      setOpen(false);
      setSearch('');
    }
  }

  function handleSelect(id: string, name: string) {
    onSelect(id, name);
    setOpen(false);
    setSearch('');
  }

  if (!open) {
    return (
      <button type="button" className="ds-resource-combobox__trigger" onClick={() => setOpen(true)}>
        <span className={selectedName ? '' : 'ds-resource-combobox__trigger-placeholder'}>
          {selectedName || '— Select —'}
        </span>
        <svg
          className="ds-resource-combobox__trigger-chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    );
  }

  const hasItems = groups.some((g) => g.items.length > 0);

  return (
    <div ref={containerRef}>
      <Command className="ds-resource-combobox" shouldFilter={true} loop>
        <Command.Input
          className="ds-resource-combobox__input"
          placeholder={placeholder}
          value={search}
          onValueChange={setSearch}
          autoFocus
        />
        <Command.List className="ds-resource-combobox__list">
          <Command.Empty className="ds-resource-combobox__empty">No results found</Command.Empty>
          {groups.map((group) => (
            <Command.Group
              key={group.label}
              heading={group.label}
              className="ds-resource-combobox__group"
            >
              {group.items.map((item) => (
                <Command.Item
                  key={item.id}
                  value={`${item.name} ${group.label} ${item.id}`}
                  className={`ds-resource-combobox__item${item.id === value ? ' ds-resource-combobox__item--selected' : ''}`}
                  onSelect={() => handleSelect(item.id, item.name)}
                >
                  {item.name}
                  {item.id === value && <span className="ds-resource-combobox__check">✓</span>}
                </Command.Item>
              ))}
              {onCreateResource && group.type && (
                <Command.Item
                  forceMount
                  value={`create new ${group.label}`}
                  className="ds-resource-combobox__create"
                  onSelect={() => handleCreateNew(group.type!)}
                >
                  + Create new…
                </Command.Item>
              )}
            </Command.Group>
          ))}
          {!hasItems && !search && <div className="ds-resource-combobox__empty">Loading…</div>}
        </Command.List>
      </Command>
    </div>
  );
}
