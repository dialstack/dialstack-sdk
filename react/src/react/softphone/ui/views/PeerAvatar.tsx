import React, { useState } from 'react';
import type { PeerSummary } from './types';

/**
 * The host's avatar for a peer (`resolvePeer`): an image, else initials, on the
 * accent disc. `lg` sits in a size container the call screen can shrink, and
 * below a legible size the disc hides rather than turning into a dot (see
 * styles.ts). `sm` is the fixed inline size for one-line rows. An image that
 * fails to load falls back to the initials, or to no avatar without them.
 */
export const PeerAvatar: React.FC<{ avatar: PeerSummary['avatar']; size?: 'lg' | 'sm' }> = ({
  avatar,
  size = 'lg',
}) => {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  if (!avatar) return null;
  const image = avatar.uri && avatar.uri !== failedUri ? avatar.uri : null;
  if (!image && !avatar.initials) return null;
  return (
    <div className={size === 'sm' ? 'ds-peer-avatar-sm' : 'ds-peer-avatar'} aria-hidden="true">
      <div className="ds-peer-avatar-disc">
        {image ? (
          <img src={image} alt="" onError={() => setFailedUri(image)} />
        ) : (
          <span>{avatar.initials}</span>
        )}
      </div>
    </div>
  );
};

/** A row's name block with the peer's small avatar beside it, when there is one. */
export const PeerRow: React.FC<{ avatar: PeerSummary['avatar']; children: React.ReactNode }> = ({
  avatar,
  children,
}) =>
  avatar ? (
    <div className="ds-peer-row">
      <PeerAvatar avatar={avatar} size="sm" />
      <div className="ds-peer-row-text">{children}</div>
    </div>
  ) : (
    <>{children}</>
  );
