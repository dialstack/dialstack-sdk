/**
 * Where the bridge schedules its deadlines and retries. The JS timers are the
 * default, but React Native on Android pauses them in an app that is
 * backgrounded without being killed, even while a headless task runs. A wake
 * whose call never arrives (answered or cancelled before the app re-registered)
 * then waits on a deadline that never fires, and the OS keeps ringing. An
 * integration that can schedule natively passes timers here.
 */
export interface BridgeTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const jsTimers: BridgeTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
