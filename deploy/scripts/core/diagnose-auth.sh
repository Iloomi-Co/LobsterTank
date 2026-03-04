#!/bin/bash
# diagnose-auth.sh — Troubleshoot OpenClaw model auth issues
# Run from anywhere: bash ~/path/to/diagnose-auth.sh

set -euo pipefail

OPENCLAW_DIR="$HOME/.openclaw"
CONFIG="$OPENCLAW_DIR/openclaw.json"

echo "========================================"
echo "OpenClaw Auth Diagnostic"
echo "$(date)"
echo "========================================"

# 1. Check global config exists
echo ""
echo "--- 1. Global Config ---"
if [ -f "$CONFIG" ]; then
    echo "Found: $CONFIG"
    echo "Size: $(wc -c < "$CONFIG") bytes"
else
    echo "ERROR: $CONFIG not found"
    exit 1
fi

# 2. List all agents
echo ""
echo "--- 2. Agent Directories ---"
for agent_dir in "$OPENCLAW_DIR"/agents/*/agent; do
    agent_name=$(basename "$(dirname "$agent_dir")")
    echo ""
    echo "  Agent: $agent_name"
    echo "  Dir:   $agent_dir"

    # Check auth-profiles.json
    AUTH_FILE="$agent_dir/auth-profiles.json"
    if [ -f "$AUTH_FILE" ]; then
        echo "  Auth file: EXISTS ($(wc -c < "$AUTH_FILE") bytes)"

        # Check which providers have keys
        for provider in anthropic openai xai google ollama; do
            if grep -q "\"$provider:" "$AUTH_FILE" 2>/dev/null; then
                # Verify the key isn't empty
                KEY_VAL=$(python3 -c "
import json
with open('$AUTH_FILE') as f:
    d = json.load(f)
for k, v in d.get('profiles', {}).items():
    if k.startswith('$provider:'):
        key = v.get('key', '')
        print(f'  present (length={len(key)}, starts={key[:8]}...)' if len(key) > 8 else f'  present but SHORT (length={len(key)})')
" 2>/dev/null) || KEY_VAL="  ERROR reading key"
                echo "    $provider: $KEY_VAL"
            else
                echo "    $provider: NOT IN AUTH FILE"
            fi
        done

        # Check lastGood entries
        LAST_GOOD=$(python3 -c "
import json
with open('$AUTH_FILE') as f:
    d = json.load(f)
lg = d.get('lastGood', {})
print(', '.join(f'{k}={v}' for k, v in lg.items()) if lg else 'EMPTY')
" 2>/dev/null) || LAST_GOOD="ERROR"
        echo "    lastGood: $LAST_GOOD"

        # Check disabled providers
        DISABLED=$(python3 -c "
import json, time
with open('$AUTH_FILE') as f:
    d = json.load(f)
now = time.time() * 1000
for k, v in d.get('usageStats', {}).items():
    until = v.get('disabledUntil', 0)
    reason = v.get('disabledReason', '')
    if until > now:
        remaining = int((until - now) / 60000)
        print(f'  {k}: DISABLED ({reason}, {remaining} min remaining)')
    elif reason:
        print(f'  {k}: was disabled ({reason}) but expired')
" 2>/dev/null) || DISABLED=""
        if [ -n "$DISABLED" ]; then
            echo "    DISABLED PROVIDERS:"
            echo "$DISABLED"
        fi
    else
        echo "  Auth file: MISSING"
    fi

    # Check models.json
    MODELS_FILE="$agent_dir/models.json"
    if [ -f "$MODELS_FILE" ]; then
        echo "  Models file: EXISTS"
        PROVIDERS=$(python3 -c "
import json
with open('$MODELS_FILE') as f:
    d = json.load(f)
for p in d.get('providers', {}):
    echo_models = [m.get('id','?') for m in d['providers'][p].get('models', [])]
    print(f'    {p}: {echo_models}')
" 2>/dev/null) || PROVIDERS="    ERROR reading"
        echo "$PROVIDERS"
    else
        echo "  Models file: none"
    fi

    # Check auth.json (separate from auth-profiles)
    AUTH2="$agent_dir/auth.json"
    if [ -f "$AUTH2" ]; then
        echo "  auth.json: EXISTS (may override auth-profiles)"
        echo "    $(python3 -c "
import json
with open('$AUTH2') as f:
    d = json.load(f)
print(json.dumps(list(d.keys())))
" 2>/dev/null)"
    fi
done

# 3. Check per-agent model config in openclaw.json
echo ""
echo "--- 3. Agent Model Config (from openclaw.json) ---"
python3 -c "
import json
with open('$CONFIG') as f:
    d = json.load(f)
agents = d.get('agents', {}).get('list', [])
for a in agents:
    name = a.get('id', a.get('name', '???'))
    model = a.get('model', {})
    primary = model.get('primary', 'NOT SET')
    fallbacks = model.get('fallbacks', [])
    agent_dir = a.get('agentDir', 'NOT SET')
    print(f'  {name}:')
    print(f'    primary: {primary}')
    print(f'    fallbacks: {fallbacks}')
    print(f'    agentDir: {agent_dir}')
" 2>/dev/null || echo "ERROR parsing agent config"

# 4. Check global default model
echo ""
echo "--- 4. Global Model Defaults (from openclaw.json) ---"
python3 -c "
import json
with open('$CONFIG') as f:
    d = json.load(f)
models = d.get('models', {})
print(f'  Default: {models.get(\"default\", \"NOT SET\")}')
print(f'  Fallbacks: {models.get(\"fallbacks\", [])}')
print(f'  Image: {models.get(\"image\", \"NOT SET\")}')
" 2>/dev/null || echo "ERROR parsing model defaults"

# 5. Check environment variables
echo ""
echo "--- 5. Environment Variables ---"
for var in OPENAI_API_KEY XAI_API_KEY ANTHROPIC_API_KEY OPENROUTER_API_KEY GOOGLE_API_KEY; do
    if [ -n "${!var:-}" ]; then
        val="${!var}"
        echo "  $var: SET (length=${#val}, starts=${val:0:8}...)"
    else
        echo "  $var: NOT SET"
    fi
done

# 6. Check gateway service environment
echo ""
echo "--- 6. Gateway Service ---"
PLIST="$HOME/Library/LaunchAgents/ai.openclaw.gateway.plist"
if [ -f "$PLIST" ]; then
    echo "  LaunchAgent plist: EXISTS"
    # Check if env vars are passed to launchd
    if grep -q "EnvironmentVariables" "$PLIST" 2>/dev/null; then
        echo "  Environment vars in plist: YES"
        grep -A 20 "EnvironmentVariables" "$PLIST" | grep "<key>" | sed 's/.*<key>/    /' | sed 's/<\/key>//'
    else
        echo "  Environment vars in plist: NONE (gateway won't see shell env vars)"
    fi
else
    echo "  LaunchAgent plist: NOT FOUND at $PLIST"
    # Try to find it
    FOUND=$(find "$HOME/Library/LaunchAgents" -name "*openclaw*" 2>/dev/null)
    if [ -n "$FOUND" ]; then
        echo "  Found alternative: $FOUND"
    fi
fi

# 7. Gateway process check
echo ""
echo "--- 7. Running Processes ---"
ps aux | grep -i openclaw | grep -v grep || echo "  No openclaw processes running"

# 8. Quick connectivity test
echo ""
echo "--- 8. Model Connectivity Test ---"
echo "  Testing gateway health..."
HEALTH=$(openclaw gateway health 2>&1) || HEALTH="FAILED"
echo "  $HEALTH"

echo ""
echo "--- 9. File Permission Check ---"
for agent_dir in "$OPENCLAW_DIR"/agents/*/agent; do
    AUTH_FILE="$agent_dir/auth-profiles.json"
    if [ -f "$AUTH_FILE" ]; then
        PERMS=$(ls -la "$AUTH_FILE" | awk '{print $1, $3, $4}')
        echo "  $AUTH_FILE: $PERMS"
    fi
done

echo ""
echo "========================================"
echo "Diagnostic complete"
echo "========================================"
