import React from 'react';
import { CheckIcon } from './icons';

export interface StepSidebarItem {
  key: string;
  label: string;
  description?: string;
}

export interface StepSidebarProps {
  icon: React.ReactNode;
  title: string;
  items: StepSidebarItem[];
  activeIndex: number;
  children?: React.ReactNode;
}

export const StepSidebar: React.FC<StepSidebarProps> = ({
  icon,
  title,
  items,
  activeIndex,
  children,
}) => (
  <aside className="step-sidebar" aria-label={title}>
    <div className="step-sidebar-header">
      <div className="step-sidebar-icon">{icon}</div>
      <span className="step-sidebar-title">{title}</span>
    </div>
    <div className="step-timeline">
      {items.map((s, i) => {
        const status = i < activeIndex ? 'completed' : i === activeIndex ? 'active' : '';
        return (
          <div key={s.key} className={`step-timeline-item ${status}`}>
            <div className="step-timeline-dot">{i < activeIndex && <CheckIcon />}</div>
            <div className="step-timeline-text">
              <span className="step-timeline-label">{s.label}</span>
              {s.description && <span className="step-timeline-desc">{s.description}</span>}
            </div>
          </div>
        );
      })}
    </div>
    {children}
  </aside>
);
