#!/usr/bin/env bash
# Exposes the local API over HTTPS via ngrok and registers the resulting URL
# as the Telegram webhook, using ngrok.yml (committed, no secrets) merged with
# your machine's own ngrok config (for the authtoken) at start time.
#
# Usage: npm run tunnel

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

ENV_FILE=".env"
NGROK_API="http://127.0.0.1:4040/api/tunnels"

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok is not installed. Install it (e.g. \`brew install ngrok\`) and run \`ngrok config add-authtoken <token>\` once, then try again." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "No .env file found. Copy .env.example (or set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET some other way) first." >&2
  exit 1
fi

BOT_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | cut -d= -f2-)
WEBHOOK_SECRET=$(grep -E '^TELEGRAM_WEBHOOK_SECRET=' "$ENV_FILE" | cut -d= -f2-)

if [ -z "$BOT_TOKEN" ] || [ -z "$WEBHOOK_SECRET" ]; then
  echo "TELEGRAM_BOT_TOKEN and/or TELEGRAM_WEBHOOK_SECRET are missing from .env — see the README's \"Telegram bot setup\" section." >&2
  exit 1
fi

GLOBAL_CONFIG="$HOME/Library/Application Support/ngrok/ngrok.yml"
if [ ! -f "$GLOBAL_CONFIG" ]; then
  # Linux default, in case this ever runs off a Mac.
  GLOBAL_CONFIG="$HOME/.config/ngrok/ngrok.yml"
fi
if [ ! -f "$GLOBAL_CONFIG" ]; then
  echo "No ngrok authtoken configured on this machine. Run \`ngrok config add-authtoken <token>\` (from your ngrok.com dashboard) once, then try again." >&2
  exit 1
fi

echo "Starting tunnel to localhost:8091 ..."
ngrok start --config "$GLOBAL_CONFIG" --config ngrok.yml api --log=stdout > /tmp/attendance-api-ngrok.log 2>&1 &
NGROK_PID=$!
trap 'kill "$NGROK_PID" 2>/dev/null || true' EXIT

# Give the agent a few seconds to establish the tunnel before asking its API for the URL.
TUNNEL_URL=""
for _ in $(seq 1 20); do
  TUNNEL_URL=$(curl -s "$NGROK_API" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['tunnels'][0]['public_url'] if d.get('tunnels') else '')" 2>/dev/null || true)
  [ -n "$TUNNEL_URL" ] && break
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  echo "ngrok didn't come up in time — check /tmp/attendance-api-ngrok.log" >&2
  exit 1
fi

echo "Tunnel: $TUNNEL_URL"
echo "Registering webhook ..."
RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{\"url\": \"${TUNNEL_URL}/telegram/webhook\", \"secret_token\": \"${WEBHOOK_SECRET}\"}")
echo "$RESPONSE" | python3 -m json.tool

OK=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok'))" 2>/dev/null || echo "False")
if [ "$OK" != "True" ]; then
  echo "setWebhook failed — check TELEGRAM_BOT_TOKEN in .env." >&2
  exit 1
fi

echo ""
echo "Webhook live at ${TUNNEL_URL}/telegram/webhook — message @<your bot> on Telegram to test."
echo "Press Ctrl+C to stop the tunnel."
wait "$NGROK_PID"
