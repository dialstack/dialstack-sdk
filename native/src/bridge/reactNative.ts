import { AppRegistry, AppState, Platform, type AppStateStatus } from 'react-native';

import type { AppLifecycle, AppLifecycleState, NativeCallBridge } from './NativeCallBridge';

export const appLifecycle: AppLifecycle = {
  onChange(listener) {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) =>
      listener(s as AppLifecycleState)
    );
    return () => sub.remove();
  },
};

export const DEFAULT_WAKE_TASK = 'DialStackWake';

/**
 * Android's wake: the adapter's native push service reports the call to Telecom
 * with no JS, and something must then start a runtime so the SDK can
 * re-REGISTER and receive the parked INVITE. That is this headless task; the
 * app's HeadlessJsTaskService names it (`taskName`).
 *
 * iOS has no equivalent — PushKit launches the process and React Native starts
 * normally, so the app entry's `bridge.start()` is the whole wake path.
 *
 * A single file with a runtime branch rather than `.android.ts`/`.ios.ts`: the
 * package ships as one bundle, so Metro's platform extensions cannot apply.
 */
export function registerWakeTask(bridge: NativeCallBridge, taskName = DEFAULT_WAKE_TASK): void {
  if (Platform.OS !== 'android') return;
  AppRegistry.registerHeadlessTask(taskName, () => async () => {
    // Acquire before start(): the queued-event flush that leads to acquire()
    // inside the bridge runs on a later tick, and a task that resolves first
    // has its runtime torn down mid-setup.
    const held = bridge.hold.acquire();
    bridge.start();
    await held;
  });
}
