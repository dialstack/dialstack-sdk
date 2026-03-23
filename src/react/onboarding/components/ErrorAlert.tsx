import React from 'react';

export const ErrorAlert: React.FC<{ message: string | null; style?: React.CSSProperties }> = ({
  message,
  style,
}) =>
  message ? (
    <div className="inline-alert error" style={style}>
      {message}
    </div>
  ) : null;
