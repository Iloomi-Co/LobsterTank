#!/bin/bash
# openclaw-agent-wrapper.sh — Two-tier email polling with fresh sessions
#
# Usage: openclaw-agent-wrapper.sh <poller-agent> <processor-agent> <message> [channel]
#
# Example cron:
#   */5 8-18 * * 1-5  ~/bin/openclaw-agent-wrapper.sh bee-email-poller bee-email-processor "Check and process emails" slack
#
# How it works:
#   Tier 1: Poller agent checks for new mail (free/local model via agent config)
#   Tier 2: Processor agent parses + responds (Haiku via agent config)
#   Model selection is controlled by each agent's config in openclaw.json,
#   NOT hardcoded in this script.
#
# Session management:
#   Uses --session-id with a unique timestamp per run so sessions never
#   accumulate context. Each poll/parse is a fresh ~200-2K token session.

set -euo pipefail

POLLER_ID="${1:?Usage: $0 <poller-agent> <processor-agent> <message> [channel]}"
PROCESSOR_ID="${2:?Usage: $0 <poller-agent> <processor-agent> <message> [channel]}"
MESSAGE="${3:?Usage: $0 <poller-agent> <processor-agent> <message> [channel]}"
CHANNEL="${4:-slack}"

OPENCLAW="/opt/homebrew/bin/openclaw"
TZ="America/Denver"
PAUSE_FILE="$HOME/.openclaw/.cron-paused"
LOG_DIR="$HOME/.openclaw/logs"
LOG_FILE="${LOG_DIR}/cron-$(date +%Y-%m-%d).log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# ── Guard: check if crons are paused (spend limit hit) ──────────────
if [ -f "$PAUSE_FILE" ]; then
    echo "$(date -Iseconds) SKIPPED: Crons paused (spend limit). Remove $PAUSE_FILE to resume." >> "$LOG_FILE"
    exit 0
fi

# ── Interval scheduling ─────────────────────────────────────────────
# Smart intervals based on agent, time of day, and day of week.
# Prevents unnecessary polling during off-hours and weekends.

get_sleep_interval() {
    local agent=$1
    local hour=$(TZ=$TZ date +%H)
    local dow=$(TZ=$TZ date +%w)  # 0=Sunday, 5=Friday, 6=Saturday

    # Weekend: Friday 5pm to Monday 6am
    if { [[ $dow == "5" && $hour -ge 17 ]] || [[ $dow == "6" ]] || [[ $dow == "0" && $hour -lt 6 ]]; }; then
        echo 7200  # 120 minutes
    elif [[ $agent == "bee-email-poller" ]] && [[ $hour -ge 7 && $hour -lt 15 ]]; then
        echo 300   # 5 minutes (business hours)
    elif [[ $agent == "bee-email-poller" ]]; then
        echo 900   # 15 minutes (outside business hours)
    else
        echo 1200  # 20 minutes (default)
    fi
}

should_run() {
    local agent=$1
    local interval=$(get_sleep_interval "$agent")
    local now=$(date +%s)
    local state_file="/tmp/openclaw-agent-${agent}-lastrun"

    if [[ ! -f "$state_file" ]]; then
        echo "$now" > "$state_file"
        return 0  # First run
    fi

    local lastrun=$(cat "$state_file")
    local elapsed=$((now - lastrun))

    if [[ $elapsed -ge $interval ]]; then
        echo "$now" > "$state_file"
        return 0  # Enough time has passed
    fi

    return 1  # Not yet
}

# ── Main execution ──────────────────────────────────────────────────

if ! should_run "$POLLER_ID"; then
    # Silently skip; not time yet
    exit 0
fi

INTERVAL=$(get_sleep_interval "$POLLER_ID")
echo "$(date -Iseconds) RUNNING: $POLLER_ID -> $PROCESSOR_ID (interval: $((INTERVAL/60))m)" >> "$LOG_FILE"

# ── Tier 1: Poller checks for mail (free/local model via agent config) ──
POLL_OUTPUT=$($OPENCLAW agent \
    --agent "$POLLER_ID" \
    --session-id "poll-$(date +%s)" \
    --message "Quick check: Do you have any unread emails? Answer only: 'yes' or 'no'. If yes, how many?" \
    2>&1) || true

echo "$(date -Iseconds) POLL_RESULT: $POLL_OUTPUT" >> "$LOG_FILE"

# ── Tier 2: Processor handles mail (Haiku via agent config, only if mail exists) ──
if echo "$POLL_OUTPUT" | grep -qi "yes"; then
    echo "$(date -Iseconds) MAIL_DETECTED: Handing off to $PROCESSOR_ID" >> "$LOG_FILE"

    RESULT=$($OPENCLAW agent \
        --agent "$PROCESSOR_ID" \
        --session-id "parse-$(date +%s)" \
        --message "$MESSAGE" \
        --deliver \
        --channel "$CHANNEL" \
        2>&1) || true

    echo "$(date -Iseconds) PROCESSOR_RESULT: $RESULT" >> "$LOG_FILE"
else
    echo "$(date -Iseconds) NO_MAIL: Skipping $PROCESSOR_ID" >> "$LOG_FILE"
fi
