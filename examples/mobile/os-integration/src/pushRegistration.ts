import { USER_ID } from './config';
import { getWakePushToken } from './os/expoCallKitTelecomAdapter';
import { requestNotificationPermission } from './permissions';

// The integrator's backend, which receives DialStack's `call.mobile_push_wakeup`
// webhook and sends the push. The rig in scripts/ plays that role.
const REGISTRY_URL = process.env.EXPO_PUBLIC_WAKE_REGISTRY_URL ?? '';

export async function registerForWakePush(log: (m: string) => void = () => {}): Promise<void> {
  if (!REGISTRY_URL || !USER_ID) {
    log('wake registry URL or user id not set — skipping push registration');
    return;
  }
  // Android 13+: the incoming-call notification is a notification. A denial only
  // affects what the user SEES — the wake push is a data message, delivered and
  // handled by the native call service regardless — so register the token either
  // way. Gating registration on it left the device unknown to the backend until a
  // full relaunch, even after the user later granted it in Settings.
  if (!(await requestNotificationPermission())) {
    log('notification permission denied — the OS will not show the incoming call');
  }
  try {
    const { token, type } = await getWakePushToken();
    const res = await fetch(`${REGISTRY_URL}/devices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: USER_ID, token, type }),
    });
    log(
      res.ok
        ? `registered ${type} token for wake push`
        : `device registration failed: HTTP ${res.status}`
    );
  } catch (err) {
    log(`device registration error: ${String(err)}`);
  }
}
