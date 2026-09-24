import { useEffect, useState } from 'react';

import { subscribeToCall, type CallRecord } from '../rig';

/** The signed-in user's current call, live, wherever in the app it was placed. */
export function useActiveCall(userId: string): CallRecord | null {
  const [call, setCall] = useState<CallRecord | null>(null);
  useEffect(() => subscribeToCall(userId, setCall), [userId]);
  return call;
}
