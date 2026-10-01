# DialStack shared-tab softphone example

One softphone connection per browser, shared by every tab of your app.

A user can have up to three concurrent softphone sessions, counting browsers and mobile apps together. If every tab of a web app connected its own `DialStackPhone`, three tabs would use them all, and a fourth would push one out with `session_replaced`. This example connects once per browser instead:

- One tab is elected **leader** with the [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API). Only the leader creates the `DialStackPhone`, holds the connection, and plays call audio. Audio plays normally from a background tab.
- The leader relays call state to the other tabs over a [`BroadcastChannel`](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel), so every tab rings and can show an Answer button.
- A click in any tab sends a command to the leader, which runs it and reports any failure back to that tab.
- When the leader tab closes, the next tab takes over and connects.

The logic is in [`shared-phone.mjs`](shared-phone.mjs), which has no dependency on this page and can be copied into your app. [`index.html`](index.html) is a minimal UI on top of it, and [`server.mjs`](server.mjs) serves the page and mints user session tokens so your secret key never reaches the browser.

## Run it

```bash
# Build the SDK first. The page imports @dialstack/sdk-webrtc from its dist/.
# Run from sdk/examples/shared-tab-softphone; --prefix ../.. points at the SDK.
npm install --prefix ../..
npm run build --prefix ../..

DIALSTACK_SECRET_KEY=sk_live_replace_me \
DIALSTACK_ACCOUNT=acct_replace_me \
DIALSTACK_USER=user_replace_me \
node server.mjs
```

Open http://localhost:3000 in two or three tabs and call the user. There are no dependencies to install and no build step for the example itself. `DIALSTACK_API_BASE_URL` overrides the API host.

## Commands

Every tab calls `send(command)`. The leader runs the command:

| `action`                                                         | Fields        | Runs in the leader                                                  |
| ---------------------------------------------------------------- | ------------- | ------------------------------------------------------------------- |
| `call`                                                           | `destination` | `phone.call(destination)`                                           |
| `answer`, `reject`, `hangup`, `hold`, `resume`, `mute`, `unmute` | `callId`      | The same method on that call                                        |
| `setMicrophone`                                                  | `deviceId`    | `phone.setAudioInputDevice(deviceId)`                               |
| `setSpeaker`                                                     | `deviceId`    | `setSinkId(deviceId)` on each call's `<audio>` element              |
| `setEmergencyAddress`                                            | `address`     | `phone.setEmergencyAddress(address)`, then `reconnectWithEmergency` |
| `connect`                                                        | —             | Connects again, for example after `session_replaced`                |

## Things to plan for

- **All tabs must share an origin.** Web Locks and `BroadcastChannel` are scoped to the origin, so tabs on different subdomains each elect their own leader.
- **Grant microphone access in a visible tab.** The leader is often a background tab, and a browser won't show a permission prompt there. Microphone permission covers the whole origin, so the page asks for it in the tab where the user clicks Call or Answer.
- **Show the emergency location prompt where the user is looking.** `network.changed` fires only in the leader. The shared state carries `needsLocation`, so every tab can show the prompt and send a `setEmergencyAddress` command.
- **Don't reconnect on your own after `session_replaced`.** That would push out another of the user's sessions, which would reconnect in turn. Reconnect when the user asks, with the `connect` command.
- **Expect a reconnect when the leader tab closes.** The next tab connects within a few seconds. A call in progress on the closed tab ends.
