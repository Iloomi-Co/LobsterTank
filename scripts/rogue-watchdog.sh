#!/bin/bash
# rogue-watchdog.sh — Detect, remove, and LOUDLY report unauthorized launchd services
#
# Runs via cron every 5 minutes. Scans for OC-created launchd services that
# aren't the gateway. Removes them, creates a breadcrumb file so OC understands
# what happened, and alerts the owner through multiple channels.
#
# Cron entry:
#   */5 * * * * ~/bin/rogue-watchdog.sh 2>/dev/null
#
# The breadcrumb file (ROGUE_SERVICE_BLOCKED.md) is critical: when OC investigates
# "why isn't my service running?", it finds the explanation instead of recreating
# the service. This breaks the create/delete/recreate loop.

set -euo pipefail

AUDIT_LOG="$HOME/.openclaw/logs/audit.log"
ROGUE_NOTICE="$HOME/.openclaw/ROGUE_SERVICE_BLOCKED.md"
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"

mkdir -p "$(dirname "$AUDIT_LOG")"

FOUND_ROGUE=false

ls ~/Library/LaunchAgents/ai.openclaw.* 2>/dev/null | grep -v gateway | while read f; do
    FOUND_ROGUE=true
    LABEL=$(basename "$f" .plist)
    TIMESTAMP=$(date -Iseconds)

    # 1. Remove the service and its plist file (both are required)
    launchctl remove "$LABEL" 2>/dev/null || true
    rm -f "$f"

    # 2. Log to audit file
    echo "$TIMESTAMP ROGUE_REMOVED: $LABEL ($f)" >> "$AUDIT_LOG"

    # 3. Leave a breadcrumb file that OC will find when it investigates
    cat > "$ROGUE_NOTICE" <<EOF
# ROGUE SERVICE BLOCKED

**Time**: $TIMESTAMP
**Service**: $LABEL
**File removed**: $f

## What Happened

A launchd service was created outside the approved scheduling system.
The rogue-watchdog automatically removed it.

## Why This Is Wrong

All scheduling MUST go through crontab. LaunchD services are PROHIBITED.
See OPENCLAW-ARCHITECTURE.md for the full rules.

## What To Do Instead

If you need to schedule a recurring task:
1. Generate a wrapper script in ~/bin/
2. Add a crontab entry via \`crontab -e\`
3. NEVER use launchctl, launchd plist files, or \`openclaw cron\`

## To Clear This Notice

Once you've confirmed OC understands the rules, delete this file:
\`rm ~/.openclaw/ROGUE_SERVICE_BLOCKED.md\`
EOF

    # 4. macOS notification (works even headless via SSH)
    osascript -e "display notification \"Rogue service BLOCKED: $LABEL. Check ~/.openclaw/ROGUE_SERVICE_BLOCKED.md\" with title \"OpenClaw Watchdog\" sound name \"Basso\"" 2>/dev/null || true

    # 5. Slack webhook if configured
    if [[ -n "$SLACK_WEBHOOK" ]]; then
        curl -s -X POST "$SLACK_WEBHOOK" \
            -H 'Content-type: application/json' \
            -d "{\"text\":\"*OpenClaw Watchdog*: Rogue launchd service \`$LABEL\` was blocked and removed. Check \`~/.openclaw/ROGUE_SERVICE_BLOCKED.md\` on Mac Mini.\"}" \
            > /dev/null 2>&1 || true
    fi

    # 6. Terminal bell (if anyone has a terminal open)
    echo -e "\a ROGUE SERVICE BLOCKED: $LABEL — see ~/.openclaw/ROGUE_SERVICE_BLOCKED.md" >> /dev/stderr 2>/dev/null || true

done

# If no rogues found, clean run
if ! $FOUND_ROGUE; then
    # Only log once per hour to avoid log spam (check if last clean was <60min ago)
    LAST_CLEAN="/tmp/openclaw-watchdog-lastclean"
    NOW=$(date +%s)
    if [[ -f "$LAST_CLEAN" ]]; then
        LAST=$(cat "$LAST_CLEAN")
        ELAPSED=$((NOW - LAST))
        if [[ $ELAPSED -lt 3600 ]]; then
            exit 0
        fi
    fi
    echo "$NOW" > "$LAST_CLEAN"
    echo "$(date -Iseconds) WATCHDOG_CLEAN: No rogue services found" >> "$AUDIT_LOG"
fi
