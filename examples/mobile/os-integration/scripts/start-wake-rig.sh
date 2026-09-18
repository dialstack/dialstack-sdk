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

echo "account: $DIALSTACK_ACCOUNT"
echo "fcm project: $FCM_PROJECT_ID"
echo "key length: ${#DIALSTACK_SECRET_KEY}"
echo "webhook verification: ${DIALSTACK_WEBHOOK_SECRET:+on}${DIALSTACK_WEBHOOK_SECRET:-off (unsigned, local harness)}"

pkill -f wake-webhook-server >/dev/null 2>&1 || true
sleep 1
node scripts/wake-webhook-server.mjs
