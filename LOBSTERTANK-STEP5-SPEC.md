# LobsterTank Step 5: Task Scheduler Management

## Problem

The Task Scheduler tab (Step 4) is read-only. It shows crontab entries, OC internal crons, and launchd services, but can't change anything beyond toggling a cron line or editing raw crontab text. Users need LobsterTank to manage scheduled tasks at a higher level: add, modify, disable, and optimize them.

The current `openclaw-agent-wrapper.sh` runs every 5 minutes and spawns a full LLM agent session even when there's no mail. That burns ~$0.09/hour ($2.25/day) on empty inbox checks. This is the motivating use case, but the solution should be general.

## Core Principle

LobsterTank is a control plane, not an implementation layer. It never writes bash scripts, cron expressions, or wrapper code directly. When LobsterTank wants to change a scheduled task, the pattern is:

1. **Compose** a clear instruction describing the desired outcome
2. **Present** the instruction to the user for approval (audit-first)
3. **Dispatch** the approved instruction to OC via the gateway
4. **Verify** the result by re-reading crontab/launchd state and updating the dashboard

OC figures out the implementation. LobsterTank just tells it what outcome is needed.

### Why This Pattern

The existing `openclaw-agent-wrapper.sh` already demonstrates the right architecture: it uses `openclaw agent --agent <id> --session-id <id> --message "<instruction>"` to communicate with agents. The gateway on port 18789 handles routing, model selection, and session management. LobsterTank should use the same interface, not bypass it by writing shell scripts.

---

## Architecture: The Dispatch Flow

```
User clicks action in LobsterTank UI
    |
    v
LobsterTank composes an instruction payload:
  { action: "optimize", target: "bee-email-poller", description: "..." }
    |
    v
Confirmation dialog shows the instruction to the user
    |
    v
User approves -> POST /api/scheduler/dispatch
    |
    v
LobsterTank server:
  1. Takes a git snapshot (safety net)
  2. Calls: openclaw agent --agent main --session-id "lt-<timestamp>"
       --message "<structured instruction>"
  3. Logs the action
    |
    v
OC receives the instruction via gateway and executes it:
  - Creates/modifies scripts, crontab entries, configs
  - Reports back through the session
    |
    v
LobsterTank server calls GET /api/scheduler/verify
  - Re-reads crontab -l, openclaw cron list, launchctl list
  - Compares before/after state
  - Returns verification result to the UI
    |
    v
UI refreshes the Task Scheduler table with new state
```

### What LobsterTank Sends to OC

Instructions are structured natural language, not code. Examples:

**Optimize polling:**
> "Update the email polling task (bee-email-poller, currently running every 5 minutes via openclaw-agent-wrapper.sh) to check for new messages before spawning an agent session. Only start a full agent session if there are unread messages. The goal is zero token spend when the inbox is empty."

**Add a new task:**
> "Create a scheduled task that runs daily at 9:00 AM MT. It should check the OpenClaw spend dashboard and send a Slack summary if daily spend exceeds $5.00. Use the daily-spend-check pattern."

**Edit schedule:**
> "Change the portfolio analysis task (openclaw-portfolio-wrapper.sh) from running at 6:00 AM and 3:00 PM on weekdays to running only at 7:00 AM on weekdays."

OC decides whether that means modifying a cron expression, creating a new wrapper script, updating an agent config, or something else entirely.

---

## Task Scheduler Actions

### Disable/Enable (already in Step 4, retained)

Toggle a crontab entry on/off by commenting/uncommenting the line. This is the one action LobsterTank does directly, because it's a trivial text transformation that doesn't need OC involvement.

### Optimize Polling

The primary Step 5 use case.

- User clicks "Optimize" on the `openclaw-agent-wrapper.sh` entry
- Confirmation dialog explains:
  - **Current behavior**: Spawns a full LLM agent session every 5 minutes, even when idle (~$2.25/day token cost)
  - **Proposed change**: Add a lightweight inbox check so tokens are only spent when there's actually mail to process (~$0.00/day when idle)
  - **How it works**: LobsterTank will send an instruction to OC. OC will implement the optimization however it sees fit (Gmail API pre-check, IMAP peek, etc.)
- On confirm, LobsterTank dispatches the instruction to OC
- After OC completes, LobsterTank verifies by re-reading the crontab

### Add Task

- User clicks "New Task" in the Crontab section header
- A form collects:
  - **What** (plain language description of the task)
  - **When** (schedule picker: predefined intervals or custom cron expression)
  - **Agent** (which OC agent should handle it, defaults to "main")
- LobsterTank packages it as an instruction and shows the confirmation dialog
- On confirm, dispatches to OC

### Edit Task

- User clicks "Edit" on a crontab row
- A form pre-filled with current values allows changing:
  - Schedule (with the human-readable frequency preview)
  - Description/behavior (plain language)
- Same dispatch pattern: compose instruction, confirm, dispatch, verify

---

## Backend

### New Endpoints in `packages/server/src/routes/scheduler.ts`

**`POST /dispatch`** — Send an instruction to OC:
```typescript
// Request body:
{
  action: "optimize" | "add" | "edit" | "remove";
  target?: string;        // script name or cron line identifier
  description: string;    // human-readable instruction for OC
  schedule?: string;      // for add/edit actions
  agent?: string;         // which OC agent handles this (default: "main")
}

// Response:
{
  ok: boolean;
  data: {
    dispatched: boolean;
    sessionId: string;     // the OC session ID used
    ocResponse: string;    // what OC reported back
    snapshotHash?: string; // git snapshot taken before dispatch
  }
}
```

Implementation:
1. Take a git snapshot via the existing `snapshot()` helper from `lib/git.ts`
2. Build the instruction message from the action + description
3. Call `safeExec("openclaw", ["agent", "--agent", agent, "--session-id", sessionId, "--message", instruction])`
4. Log the action via `logAction()`
5. Return the OC response

**`GET /verify`** — Re-read all scheduler state and return it:
- Calls the same `parseCrontab()`, `parseOcCrons()`, `parseLaunchd()` helpers from the existing `GET /` handler
- Returns the fresh state so the UI can diff against what it had before

**`GET /dispatch/history`** — Recent dispatch log:
- Returns last 20 dispatch actions from the action log (filtered for `SCHEDULER_DISPATCH` entries)
- Lets users see what instructions were sent and what happened

### Config Additions in `packages/server/src/config.ts`

```typescript
// Entries that have known optimization opportunities.
// Used by the UI to show "Optimize" buttons on the right rows.
export const OPTIMIZABLE_ENTRIES: Record<string, {
  match: string;          // substring to match in crontab command
  currentCost: string;    // human-readable cost of current approach
  description: string;    // what the optimization does
  instruction: string;    // the instruction template sent to OC
}> = {
  "email-polling": {
    match: "openclaw-agent-wrapper.sh bee-email-poller",
    currentCost: "~$2.25/day when idle",
    description: "Add lightweight inbox check before spawning agent",
    instruction: "Update the email polling task (bee-email-poller, currently running every 5 minutes via openclaw-agent-wrapper.sh) to check for new messages before spawning an agent session. Only start a full agent session if there are unread messages. The goal is zero token spend when the inbox is empty.",
  },
};
```

### Extended Scheduler State

The `GET /scheduler` response adds fields to crontab entries:

```typescript
interface SchedulerCrontabEntry {
  // ... existing Step 4 fields ...
  optimizable: string | null;   // key into OPTIMIZABLE_ENTRIES, or null
}
```

The `optimizable` field is set during `parseCrontab()` by checking each entry's command against `OPTIMIZABLE_ENTRIES[*].match`.

---

## Frontend

### API Client Additions in `packages/client/src/api/client.ts`

```typescript
schedulerDispatch: (payload: {
  action: string; target?: string; description: string;
  schedule?: string; agent?: string;
}) => request<any>("/scheduler/dispatch", {
  method: "POST", body: JSON.stringify(payload)
}),

schedulerVerify: () => request<any>("/scheduler/verify"),

schedulerDispatchHistory: () => request<any>("/scheduler/dispatch/history"),
```

### CrontabSection Changes

- Rows with `optimizable !== null` get an **"Optimize"** button in the Actions column
- Clicking "Optimize" opens a `ConfirmDialog` with:
  - Title: "Optimize Email Polling"
  - Body explaining current cost, proposed change, and that OC will handle implementation
  - The exact instruction that will be sent (shown in a monospace block)
- On confirm, calls `schedulerDispatch({ action: "optimize", target, description })` then `refresh()`

### New Task Button

- "New Task" button in the Crontab section header (next to "Edit Crontab")
- Opens a modal with:
  - Description textarea (plain language)
  - Schedule selector (dropdown of common intervals + custom cron input)
  - Agent dropdown (populated from `api.agents()`)
- Save composes the instruction, shows confirmation, dispatches

### Edit Button on Rows

- Each crontab row gets an "Edit" button in Actions
- Opens a modal pre-filled with current schedule + description
- Save follows the same compose-confirm-dispatch pattern

### Dispatch Feedback

After any dispatch:
1. Show a brief "Dispatching to OC..." loading state
2. Call `schedulerVerify()` to get fresh state
3. If the crontab changed, show a green toast/badge "Change applied"
4. If unchanged after 10s, show a yellow "OC may still be processing, refresh to check"

---

## Files

**Modify (5)**:

| File | Change |
|------|--------|
| `packages/server/src/config.ts` | Add `OPTIMIZABLE_ENTRIES` |
| `packages/server/src/routes/scheduler.ts` | Add `POST /dispatch`, `GET /verify`, `GET /dispatch/history`; extend crontab entry with `optimizable` field |
| `packages/client/src/api/client.ts` | Add `schedulerDispatch()`, `schedulerVerify()`, `schedulerDispatchHistory()` |
| `packages/client/src/components/scheduler/CrontabSection.tsx` | Add Optimize/Edit buttons, dispatch confirm dialog |
| `packages/client/src/components/scheduler/TaskScheduler.tsx` | Add dispatch state management, New Task modal, verify-after-dispatch flow |

**Create (2)**:

| File | Purpose |
|------|---------|
| `packages/client/src/components/scheduler/NewTaskModal.tsx` | New Task form modal |
| `packages/client/src/components/scheduler/NewTaskModal.module.css` | Styles |

---

## Key Constraints

1. **LobsterTank never writes implementation code.** No bash scripts, no cron expressions (except the trivial comment/uncomment toggle). All behavioral changes go through OC dispatch.

2. **Audit-first.** Every dispatch shows the user exactly what instruction will be sent before it's sent. No silent mutations.

3. **Git snapshot before every dispatch.** The safety net lets users revert if OC does something unexpected. Uses the existing `lib/git.ts` snapshot mechanism against `~/.openclaw`.

4. **The dispatch endpoint talks to OC the same way any other instruction would** — through the gateway via `openclaw agent`. LobsterTank is a UI for composing and approving instructions that OC executes.

5. **Verify after dispatch.** Always re-read the actual system state after OC reports completion. Trust but verify.

---

## Reuse from Step 4

- `ConfirmDialog` for all dispatch confirmations
- `usePolling` for auto-refresh after dispatches
- `DataTable` for all tables
- `Badge` for status indicators
- `logAction()` for audit trail
- `safeExec()` for calling `openclaw` CLI
- Git snapshot helpers from `lib/git.ts`

---

## Verification

1. `npx tsc --noEmit` — both packages compile
2. `curl localhost:3333/api/scheduler | jq '.data.crontab.entries[] | select(.optimizable)'` — shows the agent-wrapper entry with `optimizable: "email-polling"`
3. Open Task Scheduler tab — "Optimize" button visible on the email polling row
4. Click Optimize — confirmation dialog shows the instruction and cost savings
5. After confirming — LobsterTank dispatches to OC, takes a git snapshot, and refreshes the table
6. "New Task" button opens the add-task modal
7. "Edit" buttons on rows open the edit modal
8. All dispatches logged in `dashboard-actions.log`
9. `curl localhost:3333/api/scheduler/dispatch/history` shows recent dispatches
