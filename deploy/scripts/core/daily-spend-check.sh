#!/bin/bash
# daily-spend-check.sh — Monitor Anthropic API spend and pause crons if over budget
#
# Usage: daily-spend-check.sh <instance-name> [daily-limit]
#
# Run via cron at end of business day, e.g.:
#   0 18 * * 1-5 /path/to/daily-spend-check.sh archie 10.00
#
# Requires:
#   - ANTHROPIC_API_KEY env var (or set in the instance's .env)
#   - python3 available
#   - curl available
#
# What it does:
#   1. Fetches today's usage from Anthropic's API
#   2. If spend exceeds the daily limit, creates a .cron-paused file
#   3. The wrapper script checks for .cron-paused and skips execution
#   4. To resume: rm ~/.openclaw-<instance>/.cron-paused

set -euo pipefail

INSTANCE="${1:?Usage: $0 <instance-name> [daily-limit]}"
DAILY_LIMIT="${2:-10.00}"

WORKSPACE="$HOME/.openclaw-${INSTANCE}"
PAUSE_FILE="${WORKSPACE}/.cron-paused"
LOG_DIR="${WORKSPACE}/memory"
LOG_FILE="${LOG_DIR}/spend-$(date +%Y-%m-%d).log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Load API key from instance .env if not already set
if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -f "${WORKSPACE}/.env" ]; then
    export $(grep ANTHROPIC_API_KEY "${WORKSPACE}/.env" | head -1)
fi

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    echo "$(date -Iseconds) ERROR: ANTHROPIC_API_KEY not set" >> "$LOG_FILE"
    exit 1
fi

TODAY=$(date +%Y-%m-%d)

# ── Fetch usage from Anthropic API ──────────────────────────────────
# NOTE: The exact API endpoint may vary. Check Anthropic's docs for the
# current usage/billing endpoint. This uses the documented pattern as of
# early 2026. If this fails, fall back to parsing the downloaded CSV.

API_RESPONSE=$(curl -s "https://api.anthropic.com/v1/organizations/usage" \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d "{\"start_date\": \"${TODAY}\", \"end_date\": \"${TODAY}\"}" \
    2>/dev/null) || true

echo "$(date -Iseconds) API_RESPONSE: $API_RESPONSE" >> "$LOG_FILE"

# Try to extract cost from response
SPEND=$(echo "$API_RESPONSE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    # Try common response shapes
    cost = d.get('total_cost_usd') or d.get('total_cost') or d.get('cost') or 0
    print(f'{float(cost):.2f}')
except:
    print('ERROR')
" 2>/dev/null) || SPEND="ERROR"

# ── Fallback: estimate from local cron logs ─────────────────────────
# If the API didn't work, count today's Haiku invocations and estimate
if [ "$SPEND" = "ERROR" ] || [ "$SPEND" = "0.00" ]; then
    echo "$(date -Iseconds) WARN: Could not fetch spend from API. Estimating from logs." >> "$LOG_FILE"

    # Count Haiku invocations today (each is roughly $0.005-0.01)
    HAIKU_COUNT=$(grep -c "HAIKU_RESULT" "${LOG_DIR}/cron-${TODAY}.log" 2>/dev/null || echo "0")
    # Rough estimate: each Haiku call ~ $0.008 (2K input tokens + 500 output)
    SPEND=$(python3 -c "print(f'{int(${HAIKU_COUNT}) * 0.008:.2f}')")

    echo "$(date -Iseconds) ESTIMATED: ${HAIKU_COUNT} Haiku calls, ~\$${SPEND}" >> "$LOG_FILE"
fi

# ── Check against limit ─────────────────────────────────────────────
OVER=$(python3 -c "print('yes' if float('$SPEND') > float('$DAILY_LIMIT') else 'no')" 2>/dev/null || echo "no")

if [ "$OVER" = "yes" ]; then
    touch "$PAUSE_FILE"
    MSG="ALERT: Daily spend \$${SPEND} exceeds limit \$${DAILY_LIMIT}. Crons paused for ${INSTANCE}."
    echo "$(date -Iseconds) $MSG" >> "$LOG_FILE"

    # ── Optional: Send notification ─────────────────────────────────
    # Uncomment one of these to get alerted:
    #
    # Email (requires mailutils or similar):
    # echo "$MSG" | mail -s "OpenClaw Spend Alert: ${INSTANCE}" your@email.com
    #
    # macOS notification:
    # osascript -e "display notification \"$MSG\" with title \"OpenClaw Spend Alert\""
    #
    # Slack webhook:
    # curl -s -X POST "$SLACK_WEBHOOK_URL" -d "{\"text\": \"$MSG\"}"

    echo "$MSG"
    exit 1
else
    echo "$(date -Iseconds) OK: Spend \$${SPEND} within limit \$${DAILY_LIMIT}" >> "$LOG_FILE"

    # If crons were previously paused and we're now under limit, unpause
    if [ -f "$PAUSE_FILE" ]; then
        rm "$PAUSE_FILE"
        echo "$(date -Iseconds) RESUMED: Crons unpaused (spend back under limit)" >> "$LOG_FILE"
    fi
fi
