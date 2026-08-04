/**
 * A single draggable device card used in the hardware assignment step.
 */

import React from 'react';

export interface AssignableDevice {
  id: string;
  type: 'deskphone' | 'dect-handset';
  label: string;
  typeLabel: string;
  baseId?: string;
}

export interface DeviceCardProps {
  device: AssignableDevice;
  isSelected: boolean;
  /** Card is behind others — not interactive */
  isStacked: boolean;
  /** px offset for visual stacking */
  stackOffset: number;
  stackZIndex: number;
  onSelect: (deviceId: string) => void;
}

const DragHandleIcon: React.FC = () => (
  <svg
    width="10"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="9" cy="5" r="1" />
    <circle cx="15" cy="5" r="1" />
    <circle cx="9" cy="12" r="1" />
    <circle cx="15" cy="12" r="1" />
    <circle cx="9" cy="19" r="1" />
    <circle cx="15" cy="19" r="1" />
  </svg>
);

const PhoneIcon: React.FC = () => (
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
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const CordlessIcon: React.FC = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
    <path d="M12 18h.01" />
  </svg>
);

export const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  isSelected,
  isStacked,
  stackOffset,
  stackZIndex,
  onSelect,
}) => {
  const style: React.CSSProperties | undefined =
    stackOffset > 0 || stackZIndex > 0
      ? {
          ...(stackOffset > 0 && {
            transform: `translateX(${stackOffset}px) translateY(${stackOffset}px)`,
          }),
          ...(stackZIndex > 0 && { zIndex: stackZIndex }),
        }
      : undefined;

  const className = [
    'hw-device-card',
    isStacked ? 'hw-device-card--stacked' : '',
    isSelected ? 'hw-device-card--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      draggable={!isStacked}
      style={style}
      onDragStart={
        !isStacked
          ? (e) => {
              e.dataTransfer.setData('text/plain', device.id);
              e.dataTransfer.effectAllowed = 'move';
              e.currentTarget.classList.add('dragging');
            }
          : undefined
      }
      onDragEnd={!isStacked ? (e) => e.currentTarget.classList.remove('dragging') : undefined}
      onClick={!isStacked ? () => onSelect(device.id) : undefined}
    >
      <span className="hw-device-card__handle">
        <DragHandleIcon />
      </span>
      <span className="hw-device-card__icon">
        {device.type === 'deskphone' ? <PhoneIcon /> : <CordlessIcon />}
      </span>
      <span className="hw-device-card__text">
        <span className="hw-device-card__label">{device.label}</span>
        <span className="hw-device-card__type">{device.typeLabel}</span>
      </span>
    </div>
  );
};
