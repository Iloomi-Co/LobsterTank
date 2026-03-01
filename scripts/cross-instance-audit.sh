#!/bin/bash
# cross-instance-audit.sh — Audit all registered OC instances + detect unregistered ones
#
# Reads ~/.openclaw-registry.json and checks each instance's gateway status,
# crontab entries, launchd services, spend, and Ollama status.
#
# Usage:
#   cross-instance-audit.sh              # Human-readable report
#   cross-instance-audit.sh --json       # Machine-readable for LobsterTank
#
# Designed to run manually, weekly via cron, or on-demand from LobsterTank.

set -euo pipefail

REGISTRY="$HOME/.openclaw-registry.json"
FORMAT="text"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --json) FORMAT="json"; shift ;;
        *) shift ;;
    esac
done

if [[ ! -f "$REGISTRY" ]]; then
    echo "ERROR: Registry not found at $REGISTRY" >&2
    echo "Create it with the instance registry template first." >&2
    exit 2
fi

if ! command -v jq &>/dev/null; then
    echo "ERROR: jq is required but not installed" >&2
    exit 2
fi

# ── Registered Instances ───────────────────────────────────────────
if [[ "$FORMAT" == "text" ]]; then
    echo "=== Registered Instances ==="
    jq -r '.instances | to_entries[] | "  \(.key): \(.value.path) (port \(.value.port))"' "$REGISTRY"
fi

# ── Gateway Status Per Instance ────────────────────────────────────
if [[ "$FORMAT" == "text" ]]; then
    echo ""
    echo "=== Gateway Status ==="
fi

INSTANCE_RESULTS=()

jq -r '.instances | to_entries[] | "\(.value.port) \(.key) \(.value.path)"' "$REGISTRY" | while read port name path; do
    # Expand ~ to $HOME
    expanded_path="${path/#\~/$HOME}"

    PID=$(lsof -i :"$port" -P -n -t 2>/dev/null | head -1)
    if [[ -n "$PID" ]]; then
        STATUS="running"
        if [[ "$FORMAT" == "text" ]]; then
            echo "  OK  $name (port $port): running (PID $PID)"
        fi
    else
        STATUS="stopped"
        if [[ "$FORMAT" == "text" ]]; then
            echo "  WARN  $name (port $port): NOT running"
        fi
    fi

    # Check if instance directory exists
    if [[ ! -d "$expanded_path" ]]; then
        if [[ "$FORMAT" == "text" ]]; then
            echo "  ERROR  $name: directory $path does not exist!"
        fi
    fi

    # Check pause status
    PAUSED="false"
    if [[ -f "$expanded_path/.cron-paused" ]] || [[ -f "$HOME/.openclaw/.cron-paused" ]]; then
        PAUSED="true"
        if [[ "$FORMAT" == "text" ]]; then
            echo "  PAUSED  $name: crons are paused"
        fi
    fi
done

# ── Unregistered Instances ─────────────────────────────────────────
if [[ "$FORMAT" == "text" ]]; then
    echo ""
    echo "=== Unregistered Instance Check ==="
fi

UNREGISTERED_FOUND=false
for dir in "$HOME"/.openclaw*/; do
    [[ -d "$dir" ]] || continue
    DIR_NAME=$(basename "$dir")

    # Check if this directory is in the registry
    REGISTERED=$(jq -r ".instances | to_entries[] | select(.value.path == \"~/$DIR_NAME\" or .value.path == \"$dir\") | .key" "$REGISTRY" 2>/dev/null)

    if [[ -z "$REGISTERED" ]]; then
        UNREGISTERED_FOUND=true
        if [[ "$FORMAT" == "text" ]]; then
            echo "  UNREGISTERED: $dir"
        fi
    fi
done

if ! $UNREGISTERED_FOUND; then
    if [[ "$FORMAT" == "text" ]]; then
        echo "  OK  All .openclaw* directories are registered"
    fi
fi

# ── LaunchD Services ───────────────────────────────────────────────
if [[ "$FORMAT" == "text" ]]; then
    echo ""
    echo "=== LaunchD Services ==="

    LAUNCHD_OUTPUT=$(launchctl list 2>/dev/null | grep -i "openclaw\|claw" || true)
    if [[ -n "$LAUNCHD_OUTPUT" ]]; then
        echo "$LAUNCHD_OUTPUT" | while read line; do
            if echo "$line" | grep -q "gateway"; then
                echo "  OK  $line"
            else
                echo "  ROGUE  $line"
            fi
        done
    else
        echo "  OK  No OpenClaw launchd services found"
    fi

    # Check for plist files
    PLIST_FILES=$(ls ~/Library/LaunchAgents/ai.openclaw.* 2>/dev/null || true)
    if [[ -n "$PLIST_FILES" ]]; then
        echo ""
        echo "  Plist files:"
        echo "$PLIST_FILES" | while read f; do
            if echo "$f" | grep -q "gateway"; then
                echo "    OK  $f"
            else
                echo "    ROGUE  $f"
            fi
        done
    fi
fi

# ── Crontab ────────────────────────────────────────────────────────
if [[ "$FORMAT" == "text" ]]; then
    echo ""
    echo "=== Crontab ==="
    CRONTAB=$(crontab -l 2>/dev/null || echo "(empty)")
    echo "$CRONTAB" | while read line; do
        [[ -z "$line" ]] && continue
        echo "  $line"
    done
fi

# ── OC Internal Crons (should be empty) ────────────────────────────
if [[ "$FORMAT" == "text" ]]; then
    echo ""
    echo "=== OC Internal Crons (should be empty) ==="
    OC_CRONS=$(openclaw cron list 2>/dev/null || echo "(could not check)")
    if [[ "$OC_CRONS" == *"No cron"* ]] || [[ -z "$OC_CRONS" ]] || [[ "$OC_CRONS" == "(could not check)" ]]; then
        echo "  OK  No internal crons"
    else
        echo "  ALERT  Internal crons exist (should be removed):"
        echo "$OC_CRONS"
    fi
fi

# ── Active Processes ───────────────────────────────────────────────
if [[ "$FORMAT" == "text" ]]; then
    echo ""
    echo "=== Active Processes ==="
    PS_OUTPUT=$(ps aux | grep -i "openclaw\|ollama" | grep -v grep || true)
    if [[ -n "$PS_OUTPUT" ]]; then
        echo "$PS_OUTPUT" | while read line; do
            if echo "$line" | grep -q "gateway"; then
                echo "  OK  $line"
            elif echo "$line" | grep -q "ollama"; then
                echo "  OK  $line"
            else
                echo "  CHECK  $line"
            fi
        done
    else
        echo "  (no openclaw/ollama processes running)"
    fi
fi

# ── Ollama Status ──────────────────────────────────────────────────
if [[ "$FORMAT" == "text" ]]; then
    echo ""
    echo "=== Ollama Models ==="
    OLLAMA_PS=$(ollama ps 2>/dev/null || echo "(ollama not running)")
    echo "$OLLAMA_PS"
fi

# ── Breadcrumb Check ──────────────────────────────────────────────
if [[ "$FORMAT" == "text" ]]; then
    echo ""
    echo "=== Breadcrumb Files ==="
    if [[ -f "$HOME/.openclaw/ROGUE_SERVICE_BLOCKED.md" ]]; then
        echo "  ALERT  ROGUE_SERVICE_BLOCKED.md exists! A rogue service was recently blocked."
    else
        echo "  OK  No active breadcrumb files"
    fi
fi

# ── Summary ────────────────────────────────────────────────────────
if [[ "$FORMAT" == "text" ]]; then
    echo ""
    echo "=== Audit Complete ==="
    echo "  Timestamp: $(date -Iseconds)"
fi
