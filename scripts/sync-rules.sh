#!/bin/bash
# sync-rules.sh — Source-of-truth sync engine for OpenClaw AGENTS.md files
#
# Reads canonical rule blocks from agents-rules.json, compares against
# each workspace's AGENTS.md, reports drift, and optionally applies fixes.
#
# Usage:
#   sync-rules.sh --check              # Report drift (default, safe)
#   sync-rules.sh --apply              # Fix drift (backs up first)
#   sync-rules.sh --check --json       # Machine-readable output for LobsterTank
#
# Exit codes:
#   0 = all rules present and current
#   1 = drift detected (--check) or sync failed (--apply)
#   2 = config file missing or invalid
#
# Designed to be called by LobsterTank's Config Drift panel or run standalone.

set -euo pipefail

# ── Resolve paths ──────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="$(cd "$SCRIPT_DIR/../config" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

RULES_FILE="$CONFIG_DIR/agents-rules.json"
MANIFEST_FILE="$CONFIG_DIR/sync-manifest.json"
LOG_FILE="$HOME/.openclaw/logs/sync-operations.log"

MODE="check"
FORMAT="text"

# ── Parse args ─────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --check)  MODE="check"; shift ;;
        --apply)  MODE="apply"; shift ;;
        --json)   FORMAT="json"; shift ;;
        --help|-h)
            echo "Usage: sync-rules.sh [--check|--apply] [--json]"
            echo "  --check   Report drift without making changes (default)"
            echo "  --apply   Fix drift (creates .bak backups first)"
            echo "  --json    Output machine-readable JSON for LobsterTank"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 2 ;;
    esac
done

# ── Validate config files exist ────────────────────────────────────
if [[ ! -f "$RULES_FILE" ]]; then
    echo "ERROR: agents-rules.json not found at $RULES_FILE" >&2
    exit 2
fi

if [[ ! -f "$MANIFEST_FILE" ]]; then
    echo "ERROR: sync-manifest.json not found at $MANIFEST_FILE" >&2
    exit 2
fi

# Ensure jq is available
if ! command -v jq &>/dev/null; then
    echo "ERROR: jq is required but not installed" >&2
    exit 2
fi

mkdir -p "$(dirname "$LOG_FILE")"

# ── Load rule count and target count ───────────────────────────────
RULE_COUNT=$(jq '.ruleBlocks | length' "$RULES_FILE")
TARGET_COUNT=$(jq '.targets | length' "$MANIFEST_FILE")

TOTAL_CHECKS=0
TOTAL_MISSING=0
TOTAL_OUTDATED=0
TOTAL_OK=0
RESULTS=()

log() {
    echo "$(date -Iseconds) $1" >> "$LOG_FILE" 2>/dev/null || true
}

# ── Check each target ──────────────────────────────────────────────
for ti in $(seq 0 $((TARGET_COUNT - 1))); do
    WORKSPACE=$(jq -r ".targets[$ti].workspace" "$MANIFEST_FILE")
    AGENT_NAME=$(jq -r ".targets[$ti].agentName" "$MANIFEST_FILE")
    REL_PATH=$(jq -r ".targets[$ti].relativePath" "$MANIFEST_FILE")
    TARGET_FILE="$REPO_ROOT/$REL_PATH"

    REQUIRED_RULES=$(jq -r ".targets[$ti].requiredRules[]" "$MANIFEST_FILE")

    if [[ ! -f "$TARGET_FILE" ]]; then
        if [[ "$FORMAT" == "text" ]]; then
            echo "WARNING: $REL_PATH does not exist"
        fi
        RESULTS+=("{\"workspace\":\"$WORKSPACE\",\"agent\":\"$AGENT_NAME\",\"file\":\"$REL_PATH\",\"status\":\"missing_file\"}")
        continue
    fi

    FILE_CONTENT=$(cat "$TARGET_FILE")
    WORKSPACE_MISSING=()
    WORKSPACE_OUTDATED=()
    WORKSPACE_OK=()

    for RULE_ID in $REQUIRED_RULES; do
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

        # Get the rule title (used as section header marker)
        RULE_TITLE=$(jq -r ".ruleBlocks[] | select(.id == \"$RULE_ID\") | .title" "$RULES_FILE")
        RULE_CONTENT=$(jq -r ".ruleBlocks[] | select(.id == \"$RULE_ID\") | .content" "$RULES_FILE")

        # Check if the section header exists in the file
        if echo "$FILE_CONTENT" | grep -qF "## $RULE_TITLE"; then
            # Section exists. Now validate keywords.
            ALL_KEYWORDS_FOUND=true
            MISSING_KEYWORDS=()
            while IFS= read -r KW; do
                [[ -z "$KW" ]] && continue
                if ! echo "$FILE_CONTENT" | grep -qiF "$KW"; then
                    ALL_KEYWORDS_FOUND=false
                    MISSING_KEYWORDS+=("$KW")
                fi
            done < <(jq -r ".ruleBlocks[] | select(.id == \"$RULE_ID\") | .validation.mustContain[]" "$RULES_FILE" 2>/dev/null || true)

            if $ALL_KEYWORDS_FOUND; then
                WORKSPACE_OK+=("$RULE_ID")
                TOTAL_OK=$((TOTAL_OK + 1))
            else
                WORKSPACE_OUTDATED+=("$RULE_ID")
                TOTAL_OUTDATED=$((TOTAL_OUTDATED + 1))
            fi
        else
            WORKSPACE_MISSING+=("$RULE_ID")
            TOTAL_MISSING=$((TOTAL_MISSING + 1))
        fi
    done

    # ── Report for this workspace ──────────────────────────────────
    if [[ "$FORMAT" == "text" ]]; then
        echo ""
        echo "=== $AGENT_NAME ($WORKSPACE) ==="
        echo "    File: $REL_PATH"

        for r in "${WORKSPACE_OK[@]+"${WORKSPACE_OK[@]}"}"; do
            TITLE=$(jq -r ".ruleBlocks[] | select(.id == \"$r\") | .title" "$RULES_FILE")
            echo "    OK  $TITLE"
        done
        for r in "${WORKSPACE_OUTDATED[@]+"${WORKSPACE_OUTDATED[@]}"}"; do
            TITLE=$(jq -r ".ruleBlocks[] | select(.id == \"$r\") | .title" "$RULES_FILE")
            echo "    OUTDATED  $TITLE (section exists but missing keywords)"
        done
        for r in "${WORKSPACE_MISSING[@]+"${WORKSPACE_MISSING[@]}"}"; do
            TITLE=$(jq -r ".ruleBlocks[] | select(.id == \"$r\") | .title" "$RULES_FILE")
            echo "    MISSING  $TITLE"
        done
    fi

    # Build JSON result for this workspace
    OK_JSON=$(printf '%s\n' "${WORKSPACE_OK[@]+"${WORKSPACE_OK[@]}"}" | jq -R . | jq -s .)
    OUTDATED_JSON=$(printf '%s\n' "${WORKSPACE_OUTDATED[@]+"${WORKSPACE_OUTDATED[@]}"}" | jq -R . | jq -s .)
    MISSING_JSON=$(printf '%s\n' "${WORKSPACE_MISSING[@]+"${WORKSPACE_MISSING[@]}"}" | jq -R . | jq -s .)

    RESULTS+=("{\"workspace\":\"$WORKSPACE\",\"agent\":\"$AGENT_NAME\",\"file\":\"$REL_PATH\",\"ok\":$OK_JSON,\"outdated\":$OUTDATED_JSON,\"missing\":$MISSING_JSON}")

    # ── Apply fixes if requested ───────────────────────────────────
    if [[ "$MODE" == "apply" ]] && [[ ${#WORKSPACE_MISSING[@]} -gt 0 || ${#WORKSPACE_OUTDATED[@]} -gt 0 ]]; then
        # Backup
        cp "$TARGET_FILE" "${TARGET_FILE}.bak"
        log "BACKUP: $TARGET_FILE -> ${TARGET_FILE}.bak"

        UPDATED_CONTENT="$FILE_CONTENT"

        for RULE_ID in "${WORKSPACE_MISSING[@]+"${WORKSPACE_MISSING[@]}"}"; do
            RULE_CONTENT=$(jq -r ".ruleBlocks[] | select(.id == \"$RULE_ID\") | .content" "$RULES_FILE")
            RULE_TITLE=$(jq -r ".ruleBlocks[] | select(.id == \"$RULE_ID\") | .title" "$RULES_FILE")

            # Append before "## See Also" if it exists, otherwise append at end
            if echo "$UPDATED_CONTENT" | grep -qF "## See Also"; then
                UPDATED_CONTENT=$(echo "$UPDATED_CONTENT" | sed "/## See Also/i\\
\\
$RULE_CONTENT\\
")
            else
                UPDATED_CONTENT="$UPDATED_CONTENT

$RULE_CONTENT
"
            fi

            log "ADDED: $RULE_TITLE to $REL_PATH"
            if [[ "$FORMAT" == "text" ]]; then
                echo "    APPLIED  $RULE_TITLE"
            fi
        done

        # For outdated rules, replace the section
        for RULE_ID in "${WORKSPACE_OUTDATED[@]+"${WORKSPACE_OUTDATED[@]}"}"; do
            RULE_TITLE=$(jq -r ".ruleBlocks[] | select(.id == \"$RULE_ID\") | .title" "$RULES_FILE")
            log "OUTDATED_SKIPPED: $RULE_TITLE in $REL_PATH (manual review recommended)"
            if [[ "$FORMAT" == "text" ]]; then
                echo "    SKIPPED  $RULE_TITLE (outdated, needs manual review)"
            fi
        done

        echo "$UPDATED_CONTENT" > "$TARGET_FILE"
        log "SYNCED: $TARGET_FILE"
    fi
done

# ── Summary ────────────────────────────────────────────────────────
if [[ "$FORMAT" == "text" ]]; then
    echo ""
    echo "─────────────────────────────────────"
    echo "Total checks: $TOTAL_CHECKS"
    echo "  OK:       $TOTAL_OK"
    echo "  Missing:  $TOTAL_MISSING"
    echo "  Outdated: $TOTAL_OUTDATED"
    echo ""
    if [[ $TOTAL_MISSING -eq 0 ]] && [[ $TOTAL_OUTDATED -eq 0 ]]; then
        echo "All rules are in sync."
    else
        echo "Drift detected. Run with --apply to fix missing rules."
    fi
fi

if [[ "$FORMAT" == "json" ]]; then
    RESULTS_JSON=$(printf '%s\n' "${RESULTS[@]}" | jq -s .)
    jq -n \
        --argjson results "$RESULTS_JSON" \
        --arg mode "$MODE" \
        --argjson totalChecks "$TOTAL_CHECKS" \
        --argjson ok "$TOTAL_OK" \
        --argjson missing "$TOTAL_MISSING" \
        --argjson outdated "$TOTAL_OUTDATED" \
        '{
            mode: $mode,
            summary: { totalChecks: $totalChecks, ok: $ok, missing: $missing, outdated: $outdated },
            aligned: ($missing == 0 and $outdated == 0),
            results: $results
        }'
fi

# Exit code
if [[ $TOTAL_MISSING -gt 0 ]] || [[ $TOTAL_OUTDATED -gt 0 ]]; then
    exit 1
fi
exit 0
