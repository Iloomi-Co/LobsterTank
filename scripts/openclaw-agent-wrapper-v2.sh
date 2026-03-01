#!/bin/bash
# {project}-{tool}-wrapper.sh — {One-line description}
#
# TEMPLATE: Copy this file and customize for each new automation.
# See WRAPPER-CHECKLIST.md for the audit checklist.
#
# Architecture: deterministic (cron) → deterministic (bash) → scoped LLM (only if needed)
# Scheduling: crontab ONLY — never launchd, never openclaw cron
# Data collection: deterministic (bash/CLI) — never LLM
# LLM usage: tier {0-4} — {which model and why}
#
# Cron entry:
#   {schedule} ~/bin/{project}-{tool}-wrapper.sh >> {instance}/logs/{project}-{tool}.log 2>&1

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────
PROJECT="{project}"
TOOL="{tool}"
OPENCLAW="/opt/homebrew/bin/openclaw"
AGENT_ID="${PROJECT}-${TOOL}"
TZ="America/Denver"

# Multi-instance support: set INSTANCE_DIR to the OC instance for this project.
# Examples:
#   ~/.openclaw         (personal)
#   ~/.openclaw-bzzr    (BZZR)
#   ~/.openclaw-iloomi  (Iloomi)
INSTANCE_DIR="$HOME/.openclaw"

LOG_FILE="${INSTANCE_DIR}/logs/${PROJECT}-${TOOL}-$(date +%Y-%m-%d).log"
PAUSE_GLOBAL="$HOME/.openclaw/.cron-paused"
PAUSE_INSTANCE="${INSTANCE_DIR}/.cron-paused"

mkdir -p "$(dirname "$LOG_FILE")"

log() { echo "$(date -Iseconds) $1" >> "$LOG_FILE"; }

# ── Guard: Pause check (global + per-instance) ──────────────────
if [[ -f "$PAUSE_GLOBAL" ]]; then
    log "PAUSED_GLOBAL"
    exit 0
fi

if [[ -f "$PAUSE_INSTANCE" ]]; then
    log "PAUSED_INSTANCE: ${INSTANCE_DIR}"
    exit 0
fi

# ── Guard: Interval check ───────────────────────────────────────
# Prevents duplicate runs if cron fires faster than the desired interval.
STATE_FILE="/tmp/openclaw-${PROJECT}-${TOOL}-lastrun"
INTERVAL=300  # seconds — adjust per tool (300 = 5 minutes)

if [[ -f "$STATE_FILE" ]]; then
    LAST=$(cat "$STATE_FILE")
    ELAPSED=$(( $(date +%s) - LAST ))
    if [[ $ELAPSED -lt $INTERVAL ]]; then
        exit 0  # Not time yet
    fi
fi
echo "$(date +%s)" > "$STATE_FILE"

# ── Guard: Time-of-day / day-of-week (optional) ─────────────────
# Uncomment and customize to restrict when this runs.
# HOUR=$(TZ=$TZ date +%H)
# DOW=$(TZ=$TZ date +%w)  # 0=Sunday
#
# # Skip weekends
# if [[ $DOW -eq 0 ]] || [[ $DOW -eq 6 ]]; then
#     log "SKIPPED_WEEKEND"
#     exit 0
# fi
#
# # Only run during business hours (7am-6pm)
# if [[ $HOUR -lt 7 ]] || [[ $HOUR -ge 18 ]]; then
#     log "SKIPPED_OFFHOURS"
#     exit 0
# fi

# ── Step 1: Deterministic data collection ────────────────────────
# CUSTOMIZE THIS: Replace with the actual check for your tool.
# This should answer "is there work to do?" WITHOUT calling an LLM.
#
# Examples:
#   Email:       UNREAD=$(himalaya list --query "NOT SEEN" 2>/dev/null | tail -n +2 | wc -l)
#   File watch:  NEW_FILES=$(find ~/incoming -newer "$STATE_FILE" -type f | wc -l)
#   API health:  STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api.example.com/health)
#   RSS:         NEW_ITEMS=$(curl -s "https://feed.example.com/rss" | grep -c "<item>")

HAS_WORK=false  # Set to true if deterministic check finds work
WORK_DATA=""     # Store the data to pass to the LLM

# TODO: Replace this block with your actual data collection
# Example for email:
#   UNREAD=$(himalaya list --account beehive --folder INBOX --query "NOT SEEN" 2>/dev/null | tail -n +2 | wc -l)
#   if [[ "$UNREAD" -gt 0 ]]; then
#       HAS_WORK=true
#       WORK_DATA=$(himalaya list --account beehive --folder INBOX --query "NOT SEEN" --output json)
#   fi

# ── Step 2: Gate — exit early if no work ─────────────────────────
if [[ "$HAS_WORK" != "true" ]]; then
    log "NO_WORK"
    exit 0
fi

# ── Step 3: Select model tier (deterministic) ───────────────────
# Hardcode the tier. Do NOT ask an LLM to decide this.
select_tier() {
    local task_type="$1"
    case "$task_type" in
        poll|healthcheck|count|exists)  echo "0" ;;  # bash only (no LLM)
        classify|yes-no|sentiment)      echo "1" ;;  # local LLM (qwen3:14b)
        reply|summarize|notify)         echo "2" ;;  # Haiku
        compose|analyze|plan)           echo "3" ;;  # Sonnet
        research|architect|debug)       echo "4" ;;  # Opus
        *)                              echo "2" ;;  # default to cheap
    esac
}

TIER=$(select_tier "reply")  # CUSTOMIZE: change the task type

# ── Step 4: Scoped LLM call ─────────────────────────────────────
# Pre-fetch all data the LLM needs. Pass it in the message.
# The LLM receives a SPECIFIC task with ALL context included.
log "RUNNING: tier=$TIER agent=$AGENT_ID"

RESULT=$($OPENCLAW agent \
    --agent "$AGENT_ID" \
    --session-id "${TOOL}-$(date +%s)" \
    --message "YOUR SCOPED TASK HERE. Pre-fetched data: $WORK_DATA" \
    2>&1) || true

log "RESULT: $RESULT"

# ── Step 5: Delivery (deterministic) ────────────────────────────
# If output needs to go somewhere, deliver via CLI (not LLM):
#   Email:   himalaya send < drafted-email.eml
#   Slack:   curl -s -X POST "$SLACK_WEBHOOK_URL" -d "{\"text\":\"$RESULT\"}"
#   File:    echo "$RESULT" > ~/exports/output.md

# TODO: Add delivery logic if needed
