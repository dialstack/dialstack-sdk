const { withAndroidManifest, AndroidConfig, withDangerousMod } = require('expo/config-plugins');
const path = require('node:path');
const fs = require('node:fs');

// Every generated identifier derives from `android.package` so renaming the app id
// cannot leave a manifest <receiver>/<service> pointing at a class that no longer
// exists. Android does not validate manifest class names at build time and CI runs
// no prebuild, so a mismatch surfaces only as a wake that never starts the JS.
const androidPackage = (config) => {
  const pkg = config.android?.package;
  if (!pkg) throw new Error('withWakeHeadlessService: expo.android.package must be set');
  return pkg;
};

// The callkit plugin writes its <receiver> from this app.json string, while the
// class itself is generated here: verify they agree rather than trusting the edit.
const assertReceiverMatches = (config, pkg) => {
  const expected = `${pkg}.WakeEventReceiver`;
  const entry = (config.plugins ?? []).find(
    (p) => Array.isArray(p) && p[0] === 'expo-callkit-telecom'
  );
  const declared = entry?.[1]?.androidEventReceiver;
  if (declared !== expected) {
    throw new Error(
      `withWakeHeadlessService: expo-callkit-telecom androidEventReceiver is ${JSON.stringify(
        declared
      )} but the generated receiver is ${expected}`
    );
  }
};

/**
 * Android-only: start a JS runtime when a wake push reports an incoming call.
 * The native service rings from Kotlin with no JS, but the SDK lives in JS and
 * nothing re-REGISTERs the SIP AOR until it runs — and that REGISTER is what
 * makes the proxy release the parked INVITE. Without this the call is only
 * answerable after the user taps the notification.
 *
 * HeadlessJsTaskService runs the app's own bundle in the app's own process
 * (reusing a live runtime or starting one), so the module-scope websocket is the
 * SAME socket the UI adopts when the activity opens — not a second runtime.
 *
 * iOS needs none of this: a VoIP push launches the process and its runtime.
 */
const kotlinReceiver = (pkg) => `package ${pkg}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Starts a JS runtime when the callkit module reports a call with no live JS.
 *
 * Listens for onCallSessionAdded, not onIncomingCallReported: the emitter QUEUES
 * the reported event (flushed to JS later, never broadcast) and only broadcasts
 * events it drops. Session-added is the dropped one that reaches a receiver.
 *
 * The broadcast is only the process STARTER; the payload is deliberately not
 * forwarded — JS derives the id mapping from the queued event, the only way that
 * also works on iOS.
 */
class WakeEventReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.getStringExtra("eventName") != "onCallSessionAdded") return

    Log.d("WakeEventReceiver", "call reported with no JS — starting headless JS")
    val service = Intent(context, WakeHeadlessService::class.java)
    // Plain startService, NOT startForegroundService: the callkit module already
    // started its own foreground service in this process, so the process is
    // foreground and this service must not promote itself (which would race
    // callkit's call notification).
    context.startService(service)
  }
}
`;

const kotlinService = (pkg) => `package ${pkg}

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Boots a JS runtime with no UI so the SDK can connect and re-REGISTER.
 *
 * Does NOTHING with notifications or foreground state: on a wake the callkit
 * module already posted the call notification (id 8400) and started its own
 * network-bearing foreground service, which keeps the process and socket alive.
 * A notification here would duplicate 8400, and self-promotion would race
 * callkit's FGS and drop the notification.
 */
class WakeHeadlessService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig {
    return HeadlessJsTaskConfig(
      "DialStackWake",
      com.facebook.react.bridge.Arguments.createMap(),
      // Must outlast the whole unanswered-ring window, or the task settles mid-ring
      // and can tear the connection down before a late answer. 300s matches the
      // max park/ring, callkit incomingCallTimeout, and ANSWER_DEADLINE_MS — keep
      // all aligned. This is only the hard stop; JS releases on call end.
      300000,
      // Allowed in the foreground too, so a push while the app is open is not a
      // silent no-op.
      true,
    )
  }
}
`;

const withWakeHeadlessService = (config) => {
  const pkg = androidPackage(config);
  assertReceiverMatches(config, pkg);
  const service = `${pkg}.WakeHeadlessService`;

  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      const pkgDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app/src/main/java',
        ...pkg.split('.')
      );
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'WakeEventReceiver.kt'), kotlinReceiver(pkg));
      fs.writeFileSync(path.join(pkgDir, 'WakeHeadlessService.kt'), kotlinService(pkg));
      return cfg;
    },
  ]);

  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.service = (app.service ?? []).filter((s) => s.$?.['android:name'] !== service);
    // No foregroundServiceType: started with a plain startService while callkit's
    // own foreground service already holds the process.
    app.service.push({
      $: {
        'android:name': service,
        'android:exported': 'false',
      },
    });
    return cfg;
  });
};

module.exports = withWakeHeadlessService;
