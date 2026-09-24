import type { Locale } from '@dialstack/sdk-js';

export interface SoftphoneViewChrome {
  scope?: string;
  t: (key: keyof Locale['softphone']) => string;
  displayNumber: (value: string) => string;
}

export interface PeerSummary {
  id: string;
  name: string;
  number?: string | null;
}

export type OverlayPanel = 'keypad' | 'transfer' | 'devices' | 'addcall' | null;

export const DEFAULT_SCOPE = 'ds-softphone';
