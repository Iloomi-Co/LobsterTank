#!/bin/bash
# openclaw-portfolio-wrapper.sh — Portfolio status compilation via crontab
#
# Usage: openclaw-portfolio-wrapper.sh
#
# Cron entry:
#   0 6,15 * * 1-5  ~/bin/openclaw-portfolio-wrapper.sh >> ~/.openclaw/logs/portfolio-$(date +\%Y-\%m-\%d).log 2>&1
#
# This script spawns Chief with an explicit "compile and send portfolio status"
# message. It replaces the previous behavior where Chief self-scheduled portfolio
# emails by reading the clock from HEARTBEAT.md.
#
# Scheduling: crontab ONLY — never launchd, never openclaw cron

set -euo pipefail

OPENCLAW="/opt/homebrew/bin/openclaw"
AGENT_ID="beehive"
TZ="America/Denver"
PAUSE_FILE="$HOME/.openclaw/.cron-paused"
LOG_DIR="$HOME/.openclaw/logs"
LOG_FILE="${LOG_DIR}/portfolio-$(date +%Y-%m-%d).log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# ── Guard: check if crons are paused (spend limit hit) ──────────────
if [ -f "$PAUSE_FILE" ]; then
    echo "$(date -Iseconds) SKIPPED: Crons paused (spend limit). Remove $PAUSE_FILE to resume." >> "$LOG_FILE"
    exit 0
fi

# ── Guard: check for per-project pause ──────────────────────────────
if [ -f "$HOME/.openclaw/.pause-portfolio" ]; then
    echo "$(date -Iseconds) SKIPPED: Portfolio paused. Remove ~/.openclaw/.pause-portfolio to resume." >> "$LOG_FILE"
    exit 0
fi

HOUR=$(TZ=$TZ date +%H)
DAY=$(TZ=$TZ date +%A)
echo "$(date -Iseconds) RUNNING: Portfolio compilation (day=$DAY hour=$HOUR)" >> "$LOG_FILE"

# ── Spawn Chief with explicit portfolio compilation instruction ──────
RESULT=$($OPENCLAW agent \
    --agent "$AGENT_ID" \
    --session-id "portfolio-$(date +%s)" \
    --message "Compile the portfolio status for all agents (Bee Hive, Iloomi, TechFabric, Newsie). Check each workspace for recent activity, blockers, and progress. Send a consolidated portfolio summary email to troy@busot.com using mcp__Zapier_MCP__gmail_send_email. Subject: 'Portfolio Status — $(TZ=$TZ date '+%A, %B %-d, %Y')'" \
    2>&1) || true

echo "$(date -Iseconds) RESULT: $RESULT" >> "$LOG_FILE"
