# Mobile click-to-call example (no WebRTC)

The user taps a phone number in your app. DialStack rings **their own cell phone**
over the carrier network, and when they answer, connects them to the number they
tapped. The app never carries audio.

> **The light path.** No WebRTC, no push notifications, no CallKit or Telecom, no
> foreground service. The app talks only to your backend: HTTP to save the
> number, place calls and hold or hang them up, and a WebSocket for the call's
> status. The full in-app calling path, where the app itself is the phone, is in [`../os-integration`](../os-integration).
>
> **It still needs a backend.** Placing a click-to-call and saving a user's
> routing both need your account's secret key, and that key must never ship on a
> device. So the app talks to your server, and your server talks to DialStack.
> [`scripts/c2c-server.mjs`](scripts/c2c-server.mjs) stands in for that server
> here.

## Why this exists

A lot of apps only need "call this person from my phone." Full native calling is a
large project: media, push wake-up, OS call UI. This example shows the path that is
nearly all backend work, where the mobile side is a one-time setup and a dialer.

No SDK package is used. The whole integration is three DialStack endpoints, and a
wrapper around them would hide more than it saves.

## How it works

It happens in two phases, and the difference between them matters.

**Setup, once.** The user types their cell number. Your backend stores it on the
user as an **alternate Find-Me/Follow-Me ladder**, a routing profile that rings only
that number:

```jsonc
// POST /v1/users/{user_id}
{
  "config": {
    "find_me_follow_me": {
      "steps": [], // the user's usual ladder, left as it was (empty = default routing)
      "alternates": [
        {
          "key": "mobile",
          "steps": [
            { "targets": [{ "type": "external", "number": "+14165551234" }], "timeout": 30 },
          ],
          "fallback": "hangup",
        },
      ],
    },
  },
}
```

**Per call.** The app sends only the destination. Your backend names the profile
by its key:

```jsonc
// POST /v1/calls
{ "user": "user_…", "dial_string": "+12025550101", "find_me_follow_me_key": "mobile" }
```

DialStack rings the stored cell. When the user answers, DialStack dials the
destination and bridges the two.

```
app ──tap──▶ your backend ──POST /v1/calls──▶ DialStack ──rings──▶ user's cell
                                                  └──── then dials ──▶ destination
```

### Design choices worth copying

- **The number is stored, never sent with the call.** If the call request could
  carry a phone number, anyone who can reach your backend could make your account
  dial any number they like. The app names a profile, and the number comes from
  the user's stored config.
- **`fallback: "hangup"`.** The user was trying to place a call; if they do not
  pick up, there is nothing useful to route it to.
- **Only this alternate is touched.** Writing `find_me_follow_me` replaces the
  whole object, the user's usual ladder and every other alternate included. The
  backend reads it, changes only the `mobile` alternate, and writes the rest back
  unchanged. A user on default routing (no ladder of their own) gets
  `"steps": []` beside the alternate, which leaves inbound calls ringing their
  devices exactly as before.
- **The alternate is for outbound only.** Inbound calls never read alternates;
  they follow the user's primary ladder. To ring the cell for incoming calls too,
  add it to the primary — usually alongside the user's other devices, with
  `confirm_external: true` so the cell's voicemail can't take the call. The
  alternate stays cell-only, so a click-to-call rings just the phone in hand.
- **The user types their number.** Neither iOS nor Android tells an app its own
  phone number.

## Call status

Once the cell number is saved, the dialer is the app's main screen. It shows the
call it just placed in place of the keypad: calling your phone, dialing,
connected with a timer, then the result for a few seconds before the keypad
comes back. The call is an ordinary carrier call to the user's
cell, so it is answered on the phone's own call screen; once it is up, the app
can also hang it up or put the other side on hold (see
[Call control](#call-control)).

The status comes from DialStack webhooks, which reach your backend, not the
phone. The rig relays them to the app over a WebSocket:

```
DialStack ──webhook──▶ your backend ──WebSocket──▶ app
```

| Event                                            | Means                                            | Shown as                                        |
| ------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------- |
| _(your `202`)_                                   | the user's cell is ringing                       | Calling your phone…                             |
| `call.initiated`                                 | they answered; the destination is being dialed   | Dialing …                                       |
| `call.answered`                                  | the destination picked up                        | Connected, with a timer from `connected_at`     |
| `call.end`                                       | the call is over                                 | `status`, and `duration_seconds` once connected |
| `call.command_succeeded` / `call.command_failed` | a hold, resume or hang-up took effect, or didn't | the button settles, or the reason shows         |

Two things make this less direct than it looks:

- **`POST /v1/calls` returns no call id.** The backend keeps a pending record
  per user from its own request, and binds it to the `call_id` of the first
  `call.initiated` for that `user` and `to_number`. Everything after that
  matches on `call_id`.
- **Nothing fires while the user's own cell rings, and nothing at all if they
  never answer.** The rig gives the attempt 45 seconds (the profile rings for
  30), then reports it as not answered.
- **A destination that never picks up still ends as `completed`,** with a
  duration counted from when the user answered their own phone. The rig reports
  it as `no-answer` with no duration, so nothing downstream reads it as a call
  that happened.

## Call control

Once the call has an id, the backend can act on it:

```jsonc
// POST /v1/calls/{call_id}/hold     (and /unhold)
{ "party": "callee", "metadata": { "user_id": "user_…", "command": "7" } }

// POST /v1/calls/{call_id}/hangup
{ "metadata": { "user_id": "user_…", "command": "8" } }
```

| Phase               | The app offers                                             |
| ------------------- | ---------------------------------------------------------- |
| Calling your phone… | Close (leaves the screen; decline on the phone to stop it) |
| Dialing …           | End                                                        |
| Connected           | End, Hold / Resume                                         |

- **Hold names the destination.** `party: "callee"` puts the person the user
  called on hold music; the user's own cell goes quiet. Holding `caller` would
  play the music to the user instead.
- **Every command is answered `202` and settled by a webhook.** The rig marks
  the command `pending` and clears it on `call.command_succeeded` or
  `call.command_failed` (with a `reason`, such as `unsupported_call_state`).
  There is no "on hold" event; the success of a hold is what says so.
- **Outcomes are matched by the command's own token.** The outcome echoes the
  command's `metadata`, so a late outcome or timeout from an earlier command
  never settles a newer one.
- **A hang-up is done when `call.end` arrives,** not when the command succeeds,
  so the dialer reads "Ending…" until then. If the hang-up fails or goes
  unanswered, the call is most likely already gone and its `call.end` never
  reached the rig, so the rig ends the call anyway rather than leave one that
  looks live and blocks every new call.
- **A command can go unanswered.** A call the platform cannot find reports
  nothing, so the rig gives each command 10 seconds before showing "No
  response".
- **Webhooks can arrive out of order.** Once `call.end` has arrived, nothing
  later brings the call back, and `call.answered` only counts while dialing.
- **Nothing can be sent while the user's cell rings.** The call id only arrives
  with `call.initiated`, when they answer. Declining on the phone is the way to
  cancel.

## Incoming calls on the cell

The `mobile` alternate is for calls the user places. To have incoming calls
ring the cell as well, the switch on the mobile profile card writes the user's
**primary** ladder, ringing the cell beside their other devices. It does this
only for a user on default routing:

```jsonc
// a user on default routing gets one step: their devices and the cell together
{
  "steps": [
    {
      "targets": [
        { "type": "user", "id": "user_…" },
        { "type": "external", "number": "+14165551234" },
      ],
      "timeout": 25,
    },
  ],
  "fallback": "voicemail",
  "confirm_external": true,
  "alternates": [/* the mobile alternate, unchanged */],
}
```

- `confirm_external: true` makes the cell press a key to take the call, so its
  voicemail can't answer for the user. It covers every external number on a
  ladder, so the rig refuses (`409`) a user with a ladder of their own rather
  than change how their other targets answer. Add the cell to such a ladder
  in the admin portal.
- Switching it off takes the cell out again, and the ladder the rig wrote goes
  back to `steps: []`, the user's default routing.
- Changing the number moves both the alternate and the incoming step; removing
  it removes both.

## Known limits

- `POST /v1/calls` answers `202` with no call id, so the app cannot cancel the
  call while it is still ringing the user's cell.
- A destination DialStack can't dial reports nothing at all, not even
  `call.initiated` once the user answers, so the app shows "Calling your
  phone…" until the user closes it or the rig's 45-second timeout reports it as
  not connected.
- The rig keeps call status in memory, one call per user. It refuses (`409`) a
  new call while one is dialing or connected, since that record is the only
  handle the app has on the live call.
- The account needs a phone number for outbound caller ID. Without one, the call
  to the user's cell is skipped.
- The cell number appears in call logs, since it is an ordinary outbound leg.
- The callback connects on answer. `confirm_external` gates calls offered to
  the user, not a click-to-call they placed themselves, so if their carrier
  voicemail picks up the callback, the destination is dialed into it.

## Run it

Node 24 and an Android emulator or iOS simulator. The account needs a phone number
to present as caller ID.

```bash
npm install

cp .env.example .env.local   # fill in DIALSTACK_SECRET_KEY and DIALSTACK_ACCOUNT
set -a; . ./.env.local; set +a

npm run rig                  # the backend stand-in, on :8788
npx expo run:android         # or: npx expo run:ios
```

1. Pick a user. The picker stands in for your own sign-in: a real app knows who
   is signed in and never lists the account's users.
2. Enter a cell phone you can answer.
3. The patients use fictional 555-01xx numbers, so tapping one rings your cell
   and then goes nowhere. To hear the whole flow, change one of them in
   [`src/contacts.ts`](src/contacts.ts) to a second phone you have.

For call status, DialStack has to reach the rig's webhook, which listens on its
own port, 8789, so a tunnel exposes that one route and nothing else. Never tunnel
8788: it holds your secret key and authenticates no one. Expose 8789 on a public
URL (any tunnel, e.g. `cloudflared tunnel --url http://localhost:8789`) and
register it:

```bash
curl -X POST "$DIALSTACK_API_BASE_URL/v1/webhook_endpoints" \
  -H "Authorization: Bearer $DIALSTACK_SECRET_KEY" -H "DialStack-Account: $DIALSTACK_ACCOUNT" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<your-tunnel>/webhooks/dialstack","enabled_events":["call.initiated","call.answered","call.end","call.command_succeeded","call.command_failed"]}'
```

The response is the only place the signing `secret` appears: put it in
`DIALSTACK_WEBHOOK_SECRET` and restart the rig to verify deliveries. Re-register
whenever the tunnel URL changes; a stale one looks exactly like a call stuck on
"Calling your phone…".

Nothing is changed when the rig starts. It only writes routing when you save or
remove a mobile number or flip the incoming-calls switch in the app, and it only
ever touches the `mobile` alternate and the cell's place in the first ring step.

On a physical Android device, forward the port with `adb reverse tcp:8788 tcp:8788`
and set `EXPO_PUBLIC_RIG_URL=http://127.0.0.1:8788`. Android blocks cleartext HTTP
by default; [`plugins/withLocalRigCleartext.js`](plugins/withLocalRigCleartext.js)
allows it for loopback addresses only.

On an iPhone, the rig has to listen beyond loopback: start it with
`HOST=0.0.0.0 npm run rig`, on a network you trust, since it holds your secret
key and authenticates no one. Set `EXPO_PUBLIC_RIG_URL` to your Mac's LAN
address (for example `http://192.168.1.20:8788`) and build with your Apple team, which
[`app.config.js`](app.config.js) reads so it never lands in `app.json`:

```bash
APPLE_TEAM_ID=XXXXXXXXXX npx expo run:ios --device
```

The first device build of this bundle id has no provisioning profile yet, and
`expo run:ios` will not ask Xcode to make one. Build it once from Xcode
(`ios/*.xcworkspace`), or with `xcodebuild … -allowProvisioningUpdates`. On a
phone that has never run your developer builds, trust the developer under
Settings → General → VPN & Device Management before the app will open.

## Checks

```bash
npm run precommit   # format, lint, typecheck
```
