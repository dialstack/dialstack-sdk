import type { PresenceStatus } from '@dialstack/sdk-webrtc';

/**
 * The theme colour of a presence badge. On a call is amber, not red: red is
 * kept for Do Not Disturb, the one state that means "don't send calls here".
 * Offline is drawn hollow, so it doesn't read as one more colour to decode.
 */
export type PresenceTone = 'success' | 'warning' | 'danger' | 'muted';

export function presenceTone(presence: PresenceStatus): PresenceTone {
  switch (presence) {
    case 'available':
      return 'success';
    case 'on_call':
      return 'warning';
    case 'dnd':
      return 'danger';
    default:
      return 'muted';
  }
}
