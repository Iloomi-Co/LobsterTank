# LobsterTank Step 5: Idle-Aware Email Polling

## Problem

`openclaw-agent-wrapper.sh` runs every 5 minutes (`*/5 * * * *`) and spawns a full LLM agent conversation even when there's no new email. This burns ~$0.09/hour ($2.25/day) in tokens on empty inbox checks.

## Solution

Add an "Optimize Polling" feature to the Task Scheduler tab that replaces the current agent-wrapper polling with a lightweight two-stage approach.

---

## Stage 1: Lightweight Inbox Check (no LLM, no tokens)

Create a new script `email-check-wrapper.sh` that:

1. Uses curl + Gmail API OAuth token to check inbox message count
2. If count == 0: log "no mail" and exit (zero tokens burned)
3. If count > 0: spawn the existing `openclaw-agent-wrapper.sh` to process mail

### Gmail API Check Logic (for email-check-wrapper.sh)

```bash
# Read OAuth token from OC config
TOKEN=$(cat ~/.openclaw/config/gmail-token.json | jq -r '.access_token')
# Check unread count via Gmail API
COUNT=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=1" \
  | jq '.resultSizeEstimate')
if [ "$COUNT" -gt 0 ]; then
  # Mail exists — spawn the real agent
  exec ~/bin/openclaw-agent-wrapper.sh "$@"
fi
echo "$(date) No new mail" >> ~/.openclaw/logs/email-check.log
```

### Token Refresh Handling

The wrapper should handle expired OAuth tokens by checking the API response for 401 and refreshing via the `refresh_token` before retrying once.

### Where the Gmail Token Lives

Check these locations on the Mac Mini and use whichever exists:

- `~/.openclaw/config/gmail-token.json`
- `~/.openclaw/agents/bee-email-poller/auth/`
- The bee-email-poller agent config for token path references

---

## Stage 2: LobsterTank Integration

Add to the Task Scheduler tab:

1. An **"Optimize"** button next to the `openclaw-agent-wrapper.sh` entry
2. Clicking it shows a confirmation dialog explaining:
   - **Current**: spawns LLM every 5 min (~$2.25/day idle cost)
   - **Proposed**: lightweight check first, LLM only when mail exists (~$0.00/day idle cost)
3. On confirm, LobsterTank:
   - Deploys `email-check-wrapper.sh` to `~/bin/`
   - Updates crontab to replace `openclaw-agent-wrapper.sh` with `email-check-wrapper.sh`
   - Takes a git snapshot before the change
4. The Task Scheduler table shows the updated entry after swap

---

## Task Scheduler UI Changes

- Add **"Optimize"** button on polling entries that have an idle-aware alternative available
- After optimization, show a green **"Optimized"** badge on the entry

---

## Backend

### New Endpoints

**`GET /scheduler/optimize/status`** — Check if the email-check-wrapper is already deployed and active in crontab.

**`POST /scheduler/optimize/apply`** — Execute the optimization:
1. Take a git snapshot (`git snapshot` via existing git route logic)
2. Deploy `email-check-wrapper.sh` to `~/bin/` and `chmod +x`
3. Read current crontab, find the `openclaw-agent-wrapper.sh bee-email-poller` line
4. Replace `openclaw-agent-wrapper.sh` with `email-check-wrapper.sh` (preserve schedule and args)
5. Install updated crontab
6. Log action via `logAction()`
7. Return updated crontab state

**`POST /scheduler/optimize/revert`** — Revert to original agent-wrapper polling:
1. Update crontab line back to `openclaw-agent-wrapper.sh`
2. Install crontab
3. Log action

### Config Additions (`config.ts`)

```typescript
export const OPTIMIZABLE_SCRIPTS: Record<string, {
  replacement: string;
  description: string;
  savingsPerDay: string;
}> = {
  "openclaw-agent-wrapper.sh": {
    replacement: "email-check-wrapper.sh",
    description: "Lightweight inbox check before spawning LLM agent",
    savingsPerDay: "~$2.25",
  },
};
```

### Script Source

Add `email-check-wrapper.sh` to `deploy/scripts/` alongside the existing scripts. The deploy step copies it to `~/bin/`.

---

## Frontend

### CrontabSection Changes

- Detect entries whose script is in `OPTIMIZABLE_SCRIPTS` (passed from backend in scheduler state)
- Show an **"Optimize"** button in the Actions column for those entries
- If already optimized (script is the replacement), show a green `Badge` with "Optimized"
- Clicking "Optimize" opens a `ConfirmDialog` with cost breakdown

### New State in Scheduler Response

Extend `GET /scheduler` response `crontab` section:

```typescript
interface SchedulerCrontabEntry {
  // ... existing fields ...
  optimizable: boolean;         // true if script has an idle-aware replacement
  optimized: boolean;           // true if replacement is already active
  optimizeSavings?: string;     // e.g. "~$2.25/day"
}
```

---

## Files

**Create (2)**:

| File | Purpose |
|------|---------|
| `deploy/scripts/email-check-wrapper.sh` | Lightweight Gmail inbox check script |
| (none — UI changes are in existing files) | |

**Modify (4)**:

| File | Change |
|------|--------|
| `packages/server/src/config.ts` | Add `OPTIMIZABLE_SCRIPTS` map |
| `packages/server/src/routes/scheduler.ts` | Add optimize endpoints, extend crontab entry with `optimizable`/`optimized` |
| `packages/client/src/api/client.ts` | Add `schedulerOptimizeStatus()`, `schedulerOptimizeApply()`, `schedulerOptimizeRevert()` |
| `packages/client/src/components/scheduler/CrontabSection.tsx` | Add Optimize button, Optimized badge, confirm dialog |

---

## Verification

1. `npx tsc --noEmit` — both packages compile
2. `curl localhost:3333/api/scheduler | jq '.data.crontab.entries[] | select(.optimizable)'` — shows the agent-wrapper entry with `optimizable: true`
3. Open Task Scheduler → crontab table shows "Optimize" button on the email-poller row
4. Click Optimize → confirm dialog explains cost savings
5. After confirm → entry updates to `email-check-wrapper.sh` with green "Optimized" badge
6. `crontab -l` confirms the swap happened
7. `cat ~/bin/email-check-wrapper.sh` confirms script was deployed
8. Git log shows a snapshot was taken before the change
