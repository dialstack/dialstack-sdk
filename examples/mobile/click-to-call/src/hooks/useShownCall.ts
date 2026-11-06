import { useCallback, useEffect, useState } from 'react';

import { isFinished, type CallRecord } from '../rig';
import { useActiveCall } from './useActiveCall';

/** How long a finished call's result stays up before it is dismissed. */
const RESULT_MS = 3000;

/**
 * The user's call as the screen shows it: hidden once dismissed, and dismissed
 * on its own a few seconds after it finishes. A dismissal names the phase it
 * was made in, so closing a call still ringing the cell hides it only while it
 * rings, or if it then goes unanswered: answering after Close brings the call
 * back, through to how it ended.
 */
export function useShownCall(userId: string) {
  const live = useActiveCall(userId);
  const [dismissed, setDismissed] = useState<Pick<CallRecord, 'requestedAt' | 'phase'> | null>(
    null
  );
  const hidden =
    !!live &&
    live.requestedAt === dismissed?.requestedAt &&
    (live.phase === dismissed.phase || live.phase === 'not_answered');
  const call = hidden ? null : live;

  const requestedAt = call?.requestedAt;
  const phase = call?.phase;
  const dismiss = useCallback(() => {
    if (requestedAt && phase) setDismissed({ requestedAt, phase });
  }, [requestedAt, phase]);

  const finished = !!call && isFinished(call);
  useEffect(() => {
    if (!finished) return;
    const back = setTimeout(dismiss, RESULT_MS);
    return () => clearTimeout(back);
  }, [finished, dismiss]);

  return { call, dismiss };
}
