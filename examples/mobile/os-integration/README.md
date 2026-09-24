# OS integration — the native calling worked example

An Expo app (SDK 57 / React Native 0.86) that receives DialStack calls on a
locked or killed phone through the OS call UI, using `@dialstack/sdk-native`'s
call bridge. Inbound via push wake, answer/decline from the OS surface, in-call
mute/hold/hang up, and the SDK dial pad for outbound.

**Android is built and verified here. iOS is not.** The design is
cross-platform — `OsCallAdapter` exists so CallKit slots in where Telecom does —
but building the iOS half needs an Apple Developer account for the PushKit
entitlement and an APNs VoIP certificate. Treat it as designed-for and unproven.

## Setup

Node 24 (root `.nvmrc`). Install from inside this directory — `sdk/examples/**`
is not an npm workspace, so a root install will not reach it.

```bash
# Build the SDK first: sdk-native ships only dist/, and a file: install copies
# whatever dist/ currently holds.
npm --prefix ../../../native ci
npm --prefix ../../../native run build

npm install
cp .env.example .env.local   # then fill it in
```

After changing SDK source, rebuild and reinstall so the copy is refreshed:

```bash
npm --prefix ../../../native run build
rm -rf node_modules/@dialstack && npm install
```

`@dialstack/sdk-native` inlines `@dialstack/sdk-webrtc`, so that is the only SDK
package the app installs — adding `sdk-webrtc` directly gives the app a second
copy of the phone and `Call` classes.

## Testing a wake end to end on Android

The point of this example is the cold-start path, and it needs a real device or
emulator, a Firebase project and a real inbound call.

**1. Firebase.** Create a project and add an **Android** app with package name
`ai.dialstack.osintegration.example` — it must match `app.json` exactly or the
build fails with "No matching client found". Download `google-services.json`
into this directory (gitignored). Enable the **Firebase Cloud Messaging API
(V1)** in the linked Google Cloud project, then:

```bash
gcloud auth application-default login
# or: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

**2. DialStack.** Enable push wake on the callee:

```bash
curl -X POST "$API/v1/users/$USER_ID" -H "Authorization: Bearer $SK" \
  -H 'Content-Type: application/json' \
  -d '{"config":{"mobile_push_wakeup":true}}'
```

DialStack then parks an inbound INVITE for ~30s when the user has no live
registration, and fires the `call.mobile_push_wakeup` webhook instead of failing
the call.

**3. Config.** `cp .env.example .env.local` and fill it in. Two that bite:

- `EXPO_PUBLIC_DIALSTACK_TOKEN` is a `client_secret` from
  `POST /v1/user_sessions` and is short-lived — it only seeds the first launch.
  An expired one surfaces as `Failed to fetch ICE servers: status 401`; mint a
  fresh one rather than reading that as a broken build.
- `EXPO_PUBLIC_WAKE_REGISTRY_URL` must be reachable _from the device_:
  `http://10.0.2.2:8787` on the emulator, your machine's LAN IP on hardware.
  `localhost` will not work from hardware.

**4. Build and install.**

```bash
npm run prebuild      # regenerates android/ from app.json + the config plugins
npm run android
```

Re-run `prebuild` after editing `app.json` — hand edits to `AndroidManifest.xml`
or `build.gradle` are destroyed by the next one. Grant **notifications** when
asked: a denied `POST_NOTIFICATIONS` aborts device-token registration, so the
phone will never ring.

**5. Start the harness** (the integrator-backend stand-in):

```bash
set -a; . ./.env.local; set +a
bash scripts/start-wake-rig.sh
```

**6. Point DialStack at it.** Expose port 8787 on a public URL (any tunnel) and
register it:

```bash
curl -X POST "$API/v1/webhook_endpoints" -H "Authorization: Bearer $SK" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://<your-tunnel>/webhooks/dialstack","enabled_events":["call.mobile_push_wakeup"]}'
```

Only this response returns the signing secret — capture it into
`DIALSTACK_WEBHOOK_SECRET` now if you want verification on. Re-register whenever
the tunnel hostname changes; a stale URL looks exactly like a broken push.

**7. Register the device.** Launch the app once; it posts its FCM token to the
rig. Confirm with `curl localhost:8787/devices`.

On a **physical device** with a `localhost` registry URL, forward the port first
(otherwise `localhost` is the phone itself and registration silently fails):

```bash
adb reverse tcp:8787 tcp:8787
```

The forward does not survive an unplug. On the emulator use `http://10.0.2.2:8787`
and skip this.

**8. Check the push path alone**, before involving a call:

```bash
curl -X POST localhost:8787/test -H 'Content-Type: application/json' \
  -d '{"user_id":"user_…"}'
```

The phone should ring with no app running. If this fails, the problem is FCM or
the token — not DialStack.

**9. The real thing.** Kill the app the way the OS would:

```bash
adb shell am kill ai.dialstack.osintegration.example
```

Never `force-stop` to test this: `FLAG_STOPPED` blocks FCM delivery entirely, so
the app legitimately never wakes and you will chase a bug that is not there.

Now call the user's extension from another phone. Expected: the device rings
within a couple of seconds with no JS running, answering from the lock screen
connects, and audio works both ways. Cold start to answered is ~3–5s. Watch it
in `adb logcat` — the wake receiver, the headless task starting, then the SDK
registering.

### Release builds

`npm run android` produces a debug build, which exercises the wake path fine and
is what you want while iterating. But debug timings are not representative: the
bundle loads from Metro and the JS runs unoptimised, so cold start is several
seconds slower than what a user sees. The ~3–5s above is a release figure, so
any timing you intend to quote should come from one.

```bash
npm run android -- --variant release
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

The JS bundle is embedded, so the APK runs with Metro stopped and the phone
unplugged. Expo signs release with the **debug keystore** by default, so this
installs with no signing setup — and is a test artifact, not something
distributable. Shipping needs your own keystore, per
[the React Native signing guide](https://reactnative.dev/docs/signed-apk-android);
since `prebuild` regenerates `android/`, real signing config belongs in
`app.json` or an EAS profile.

## What the wake path does

1. A call arrives for a user with `mobile_push_wakeup` on and no live
   registration. DialStack parks the INVITE and sends the
   `call.mobile_push_wakeup` webhook to the integrator's backend.
2. The backend sends a high-priority FCM data message to the device.
3. The call library reports the call to Telecom/CallKit **with no JS running** —
   the phone rings instantly — and starts the headless JS task.
4. The app boots, the SDK re-REGISTERs, and DialStack re-forks the parked
   INVITE. An Answer tapped while this ran is applied on arrival.

If nothing is delivered within 5s of registering, the bridge ends the OS session
and drops the registration so the next call parks again.

`scripts/` is a **local test harness**, not the shape of a real integration: it
keeps device tokens in memory and accepts unsigned webhooks unless
`DIALSTACK_WEBHOOK_SECRET` is set. A real integrator runs a deployed server with
durable token storage, mandatory signature verification and a stable URL.

## Swapping the call library

`src/os/expoCallKitTelecomAdapter.ts` is the only file that imports
`expo-callkit-telecom`, so a callkeep (or hand-rolled CallKit/Telecom) twin is a
drop-in. An eslint rule holds that line: a second subscriber to the OS call
events races the bridge on every answer, and the two then disagree about who
owns the session.

Two things about the port are easy to get wrong; the contract suite in
`@dialstack/sdk-native/testing` is what catches them.

**Report outbound calls, not just inbound.** On iOS CallKit owns the audio
session, so an unreported outbound call gets no call UI, no audio-session
activation and no system call-log entry. On Android the report is what starts
the network-bearing foreground service, so a backgrounded outbound call is
reaped mid-dial. Report before placing, and end the OS session if placement
fails.

**Replay events that fired before JS subscribed.** A push-woken call is reported
natively before any runtime exists, so its `incomingReported` — and an Answer
tapped on the lock screen seconds later — happen with nothing listening. An
adapter must queue those and flush them to the first subscriber. Otherwise a
cold-start call rings and then does nothing when answered.

## Checks

```bash
npm run typecheck && npm run lint && npm run format:check
```
