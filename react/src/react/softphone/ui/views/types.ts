import type { Locale } from '@dialstack/sdk-js';
import type { PeerAvatarData } from '../../../call-ui/PeerAvatar';

export interface SoftphoneViewChrome {
  scope?: string;
  t: (key: keyof Locale['softphone']) => string;
  displayNumber: (value: string) => string;
}

export interface PeerSummary {
  id: string;
  name: string;
  number?: string | null;
  /** The host's avatar from `resolvePeer`, drawn above the name. */
  avatar?: PeerAvatarData;
}

export type OverlayPanel = 'keypad' | 'transfer' | 'devices' | 'addcall' | null;

export const DEFAULT_SCOPE = 'ds-softphone';
