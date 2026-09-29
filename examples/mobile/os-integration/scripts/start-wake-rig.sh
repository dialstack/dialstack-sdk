#!/usr/bin/env bash
# Starts the wake webhook harness with the credentials its /session mint needs.
#
# Reads everything from the environment — copy .env.example to .env.local, fill it
# in, and `set -a; . ./.env.local; set +a` before running this. Nothing is defaulted
# to a real account or key: an unset value aborts here rather than sending a call
# somewhere unexpected.
set -euo pipefail

: "${DIALSTACK_SECRET_KEY:?set DIALSTACK_SECRET_KEY (an sk_live_… key for the account below)}"
: "${DIALSTACK_ACCOUNT:?set DIALSTACK_ACCOUNT (acct_…)}"
: "${FCM_PROJECT_ID:?set FCM_PROJECT_ID (the Firebase project that owns google-services.json)}"

# Optional: the endpoint's signing secret (only the /v1/webhook_endpoints create
# response returns it). Set it to have the harness verify webhooks; unset, it
# accepts them unsigned and warns — fine for a local harness behind a rotating
# tunnel, not for a deployed integrator server.
export DIALSTACK_WEBHOOK_SECRET="${DIALSTACK_WEBHOOK_SECRET:-}"

# Optional: APNs, needed only once an iOS device registers. Exported empty rather
# than left unset so `set -u` doesn't abort the harness for Android-only users —
# the server reports which of these is missing if an iOS push is actually tried.
export APNS_KEY_PATH="${APNS_KEY_PATH:-}"
export APNS_KEY_ID="${APNS_KEY_ID:-}"
export APNS_TEAM_ID="${APNS_TEAM_ID:-}"
export APNS_BUNDLE_ID="${APNS_BUNDLE_ID:-ai.dialstack.osintegration.example}"
export APNS_HOST="${APNS_HOST:-api.sandbox.push.apple.com}"

echo "account: $DIALSTACK_ACCOUNT"
echo "fcm project: $FCM_PROJECT_ID"
echo "key length: ${#DIALSTACK_SECRET_KEY}"
if [ -n "$DIALSTACK_WEBHOOK_SECRET" ]; then
  echo "webhook verification: on"
else
  echo "webhook verification: off (unsigned, local harness)"
fi
if [ -n "$APNS_KEY_ID" ]; then
  echo "apns: $APNS_KEY_ID -> $APNS_HOST"
else
  echo "apns: unconfigured (Android only)"
fi

pkill -f wake-webhook-server >/dev/null 2>&1 || true
sleep 1
node scripts/wake-webhook-server.mjs
