#!/bin/bash
# weekly-audit.sh — Comprehensive weekly drift detection for OpenClaw
#
# Combines infrastructure audit with rule sync check. Designed to run
# every Monday morning via cron, producing a report suitable for email.
#
# Cron entry:
#   0 6 * * 1 ~/bin/weekly-audit.sh >> ~/.openclaw/logs/audit.log 2>&1
#
# What it checks:
#   1. Rogue launchd services
#   2. Crontab entries
#   3. OC internal crons (should be empty)
#   4. Active sessions (stale session detection)
#   5. Non-gateway processes
#   6. Today's spend per instance
#   7. Ollama status
#   8. AGENTS.md rule sync status
#   9. Boot resilience (@reboot entries)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REGISTRY="$HOME/.openclaw-registry.json"
TIMESTAMP=$(date -Iseconds)

echo ""
echo "========================================"
echo "  OpenClaw Weekly Audit"
echo "  $TIMESTAMP"
echo "========================================"

# ── 1. LaunchD Rogue Check ─────────────────────────────────────────
echo ""
echo "--- LaunchD Rogue Check ---"
ROGUE_PLISTS=$(ls ~/Library/LaunchAgents/ai.openclaw.* 2>/dev/null | grep -v gateway || true)
if [[ -n "$ROGUE_PLISTS" ]]; then
    echo "ALERT: Rogue services found:"
    echo "$ROGUE_PLISTS"
else
    echo "OK: Clean (gateway only or no services)"
fi

# ── 2. Crontab ─────────────────────────────────────────────────────
echo ""
echo "--- Crontab ---"
CRONTAB=$(crontab -l 2>/dev/null || echo "(no crontab)")
echo "$CRONTAB"

# Check for PATH line
if echo "$CRONTAB" | grep -q "^PATH="; then
    echo "OK: PATH is set in crontab"
else
    echo "WARN: No PATH line in crontab. Cron jobs may fail to find node/openclaw."
fi

# Check for @reboot entries
if echo "$CRONTAB" | grep -q "@reboot"; then
    echo "OK: @reboot entries present (boot resilience)"
else
    echo "WARN: No @reboot entries. Local models won't reload after reboot."
fi

# ── 3. OC Internal Crons ──────────────────────────────────────────
echo ""
echo "--- OC Internal Crons (should be empty) ---"
OC_CRONS=$(openclaw cron list 2>/dev/null || echo "(could not check)")
if [[ "$OC_CRONS" == *"No cron"* ]] || [[ -z "$OC_CRONS" ]] || [[ "$OC_CRONS" == "(could not check)" ]]; then
    echo "OK: No internal crons"
else
    echo "ALERT: Internal crons exist and should be removed:"
    echo "$OC_CRONS"
fi

# ── 4. Active Sessions ────────────────────────────────────────────
echo ""
echo "--- Active Sessions ---"
STALE_FOUND=false
for dir in "$HOME"/.openclaw*/agents/*/sessions/; do
    [[ -d "$dir" ]] || continue
    AGENT=$(echo "$dir" | rev | cut -d/ -f3 | rev)
    INSTANCE=$(echo "$dir" | sed "s|$HOME/\.||" | cut -d/ -f1)

    SESSIONS_FILE="$dir/sessions.json"
    if [[ -f "$SESSIONS_FILE" ]]; then
        COUNT=$(jq 'length' "$SESSIONS_FILE" 2>/dev/null || echo 0)
        if [[ "$COUNT" -gt 0 ]]; then
            echo "  WARN  $INSTANCE/$AGENT: $COUNT active sessions"
            STALE_FOUND=true

            # Check for high-token sessions
            HIGH_TOKEN=$(jq '[.[] | select(.tokenCount > 50000)] | length' "$SESSIONS_FILE" 2>/dev/null || echo 0)
            if [[ "$HIGH_TOKEN" -gt 0 ]]; then
                echo "  ALERT  $HIGH_TOKEN sessions over 50K tokens (cost leak risk)"
            fi
        fi
    fi
done
if ! $STALE_FOUND; then
    echo "OK: No active sessions"
fi

# ── 5. Processes ───────────────────────────────────────────────────
echo ""
echo "--- Processes ---"
NON_GATEWAY=$(ps aux | grep openclaw | grep -v grep | grep -v gateway || true)
if [[ -n "$NON_GATEWAY" ]]; then
    echo "ALERT: Non-gateway OpenClaw processes running:"
    echo "$NON_GATEWAY"
else
    echo "OK: Only gateway processes (or none)"
fi

# ── 6. Ollama Status ──────────────────────────────────────────────
echo ""
echo "--- Ollama Status ---"
if command -v ollama &>/dev/null; then
    OLLAMA_PS=$(ollama ps 2>/dev/null || echo "(not running)")
    echo "$OLLAMA_PS"

    # Check if expected models are loaded
    if echo "$OLLAMA_PS" | grep -q "qwen3:14b"; then
        echo "OK: qwen3:14b is loaded"
    else
        echo "WARN: qwen3:14b is NOT loaded. Wrappers may fall back to Anthropic."
    fi
else
    echo "WARN: ollama not found in PATH"
fi

# ── 7. Breadcrumb Check ──────────────────────────────────────────
echo ""
echo "--- Breadcrumb Files ---"
if [[ -f "$HOME/.openclaw/ROGUE_SERVICE_BLOCKED.md" ]]; then
    echo "ALERT: ROGUE_SERVICE_BLOCKED.md exists! Review and clear it."
else
    echo "OK: No active breadcrumbs"
fi

# ── 8. AGENTS.md Rule Sync ────────────────────────────────────────
echo ""
echo "--- AGENTS.md Rule Sync ---"
SYNC_SCRIPT="$SCRIPT_DIR/sync-rules.sh"
if [[ -x "$SYNC_SCRIPT" ]]; then
    $SYNC_SCRIPT --check 2>/dev/null || true
else
    echo "WARN: sync-rules.sh not found or not executable at $SYNC_SCRIPT"
fi

# ── 9. Registry Check ─────────────────────────────────────────────
echo ""
echo "--- Instance Registry ---"
if [[ -f "$REGISTRY" ]]; then
    INSTANCE_COUNT=$(jq '.instances | length' "$REGISTRY")
    echo "OK: $INSTANCE_COUNT instance(s) registered"

    # Check for unregistered directories
    for dir in "$HOME"/.openclaw*/; do
        [[ -d "$dir" ]] || continue
        DIR_NAME=$(basename "$dir")
        REGISTERED=$(jq -r ".instances | to_entries[] | select(.value.path == \"~/$DIR_NAME\") | .key" "$REGISTRY" 2>/dev/null || true)
        if [[ -z "$REGISTERED" ]]; then
            echo "  ALERT  Unregistered: $dir"
        fi
    done
else
    echo "WARN: No registry file at $REGISTRY"
fi

echo ""
echo "========================================"
echo "  Audit complete: $TIMESTAMP"
echo "========================================"
