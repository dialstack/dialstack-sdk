#!/usr/bin/env bash
# Starts the click-to-call rig with the credentials it calls DialStack with.
#
# Reads everything from the environment — copy .env.example to .env.local, fill it
# in, and `set -a; . ./.env.local; set +a` before running this. Nothing is defaulted
# to a real account or key: an unset value aborts here rather than writing routing
# on an account you did not mean.
set -euo pipefail

: "${DIALSTACK_SECRET_KEY:?set DIALSTACK_SECRET_KEY (an sk_live_… key for the account below)}"
: "${DIALSTACK_ACCOUNT:?set DIALSTACK_ACCOUNT (acct_…)}"

echo "account: $DIALSTACK_ACCOUNT"
echo "api: ${DIALSTACK_API_BASE_URL:-https://api.dialstack.ai}"
echo "listening on: ${HOST:-127.0.0.1}"
echo "key length: ${#DIALSTACK_SECRET_KEY}"

exec node "$(dirname "$0")/c2c-server.mjs"
