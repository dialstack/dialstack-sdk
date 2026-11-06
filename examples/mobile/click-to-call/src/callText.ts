import { type CallRecord } from './rig';

const ENDED: Record<string, string> = {
  completed: 'Call ended',
  'no-answer': 'No answer',
  busy: 'Busy',
  failed: 'Call failed',
};

const FAILURE: Record<string, string> = {
  unsupported_call_state: 'The call can’t do that right now.',
  party_not_connected: 'They’re no longer on the call.',
  timeout: 'No response from the call. Try again.',
};

/** Seconds as m:ss. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** How an ended call ended, with how long it lasted once connected. */
export function endedText(call: CallRecord): string {
  const ended = ENDED[call.status ?? ''] ?? 'Call ended';
  return call.connectedAt && call.durationSeconds
    ? `${ended} · ${clock(call.durationSeconds)}`
    : ended;
}

/** Why a hold, resume or hang-up didn't happen, from the reason the rig reports. */
export const failureText = (reason: string) => FAILURE[reason] ?? `Couldn’t do that (${reason}).`;
