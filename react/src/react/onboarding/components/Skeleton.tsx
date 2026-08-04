import React from 'react';

export const SkeletonLine: React.FC<{
  width?: string;
  height?: string;
  style?: React.CSSProperties;
}> = ({ width = '100%', height = '14px', style }) => (
  <div className="skeleton-line" style={{ width, height, ...style }} />
);

export const SkeletonCircle: React.FC<{ size?: string }> = ({ size = '40px' }) => (
  <div className="skeleton-circle" style={{ width: size, height: size }} />
);

export const SkeletonCard: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div className="skeleton-card">{children}</div>
);
