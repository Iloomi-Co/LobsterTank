# Wrapper Script Audit Checklist

Use this checklist to verify any wrapper script before deploying it. Every item must pass. OC should verify these automatically when generating a new tool. Humans can audit any tool against this list.

## Checklist

- [ ] **Polling is deterministic** — no LLM calls to check "is there work?" Use bash, himalaya, curl, ls, jq.
- [ ] **Data is pre-fetched** — the LLM receives data in the message, it doesn't fetch it.
- [ ] **Model tier is hardcoded** — the wrapper picks the tier via bash `case`, not the LLM.
- [ ] **Session IDs are unique** — uses `--session-id "{tool}-$(date +%s)"` to prevent context accumulation.
- [ ] **Pause files are checked** — both global (`~/.openclaw/.cron-paused`) and per-instance (`{instance}/.cron-paused`).
- [ ] **Logging is structured** — timestamps + labels, to known log paths (`{instance}/logs/{project}-{tool}-YYYY-MM-DD.log`).
- [ ] **No launchd registration** — tool runs via crontab entry only. No plist files, no `launchctl`, no `openclaw cron`.
- [ ] **Cost ceiling exists** — wrapper exits or pauses if daily spend exceeds threshold.
- [ ] **Fallback chain has no surprise escalation** — verify no Anthropic models in fallbacks if the tool should be free/local.
- [ ] **Boot resilience** — if the tool depends on a local Ollama model, there's a `@reboot` crontab entry to load it on startup (use `--keepalive -1s` for permanent loading).

## Quick Audit Command

Run this against any wrapper to check for common issues:

```bash
# Check for launchd references (should find none)
grep -i "launchctl\|LaunchAgent\|plist\|openclaw cron" ~/bin/my-wrapper.sh

# Check for session ID uniqueness
grep -c "session-id" ~/bin/my-wrapper.sh  # Should be >= 1

# Check for pause file checks
grep -c "cron-paused" ~/bin/my-wrapper.sh  # Should be >= 1

# Check for deterministic data collection step
grep -c "HAS_WORK\|UNREAD\|STATUS\|NEW_FILES" ~/bin/my-wrapper.sh  # Should be >= 1
```

## See Also

- `OPENCLAW-ARCHITECTURE.md` — Full architecture and rules
- `openclaw-agent-wrapper-v2.sh` — Template that implements all items above
