# LobsterTank Step 5: Determinism Audit

## Context: What Already Exists in LobsterTank

LobsterTank is a control plane for OpenClaw running at `localhost:3333`. The project lives at `~/Documents/dev/LobsterTank`. Here's what has already been built:

### Dashboard Tab (main view)
- **Audit & Deploy tile**: "Run Full Audit" button that scans the OC installation against canonical config. Follows audit-first workflow: scan, review change plan (with Copy to Clipboard), confirm/cancel, apply with git snapshots.
- **Instance Health tile**: Shows gateway status (PID, port), lists all registered agents with their models.
- **Spend Monitor tile**: Shows total API spend.
- **Git Safety Net tile**: Shows uncommitted changes, last commit. Buttons: Take Snapshot, View History, View Diff, Revert Last.
- **Active Sessions tile**: Shows currently running agent sessions.
- **Agent Config tile**: Shows each agent's primary model, fallbacks, and workspace path.
- **Ollama Models tile**: Shows loaded local models with status.
- **Process Monitor tile**: Shows running OC-related processes with Kill buttons.

### Task Scheduler Tab
- **Crontab section**: Table of all crontab entries with columns: STATUS, SCHEDULE, FREQUENCY, SCRIPT, DESCRIPTION, LAST RUN, and action buttons (Logs, Disable). Shows the raw PATH line. Has "Edit Crontab" button for a text editor modal.
- **OC Internal Crons section**: Shows `openclaw cron list` output. Should always be empty (shows green "EMPTY (CORRECT)" badge when empty). Has Remove buttons if entries exist.
- **Launchd Services section**: Shows `launchctl list | grep openclaw` output. Only `ai.openclaw.gateway` is legitimate (shows "PROTECTED" badge). Other services get Remove buttons.

### Config Sync Engine (backend)
- `sync-rules.sh` reads from `agents-rules.json` (canonical rule blocks) and `sync-manifest.json` (maps rules to agent AGENTS.md files).
- Currently 5 rule blocks: scheduling-rules, log-locations, cost-monitoring, troubleshooting-flow, heartbeat-rules.
- Currently 2 targets: chief (`~/.openclaw/workspace/AGENTS.md`) and beehive (`~/.openclaw/workspace-beehive/AGENTS.md`).
- The `agents-rules.json` and `sync-manifest.json` live in `<lobstertank-repo>/deploy/config/`.

### Script Deployment (backend)
- Source scripts live in `<lobstertank-repo>/deploy/scripts/`.
- Deploy target is `~/bin/`.
- Audit checks if each script exists, is executable, and matches the source copy.

### Key Backend Config (`packages/server/src/config.ts`)
- `DEPLOY_SOURCE` resolves from `import.meta.dirname` to `<lobstertank-repo>/deploy/`.
- `OC_HOME` defaults to `~/.openclaw`.
- API routes are in `packages/server/src/routes/`.

### Navigation
Top-level tabs: `[Dashboard]` and `[Task Scheduler]`. Step 5 adds a third: `[Determinism Audit]`.

### API Endpoints Already Built
- `GET /api/audit` — Master audit (config sync + scripts + crontab + issues)
- `POST /api/audit/apply` — Apply changes with git snapshots
- `GET /api/scheduler` — Combined crontab + OC crons + launchd state
- `POST /api/scheduler/crontab/toggle` — Enable/disable crontab entries
- `POST /api/scheduler/crontab/edit` — Replace full crontab
- `POST /api/scheduler/oc-cron/remove` — Remove OC internal cron
- `POST /api/scheduler/launchd/remove` — Remove rogue launchd service
- `GET /api/scheduler/logs/:scriptName` — Tail log files

This spec adds the ability to detect and fix non-deterministic logic anywhere in an OpenClaw installation.

---

## The Problem We Keep Hitting

Every debugging session this week has been the same pattern: an LLM reads a document, interprets natural language as an instruction, and acts on its own initiative. The $36.50/day rogue agents. Chief sending Sunday portfolio emails. The $0.09/hour empty inbox checks. Every time, the root cause is the same:

**An LLM is making a decision that a script should be making.**

The existing audit engine (config sync, script deployment, crontab checks) fixed specific instances. Step 5 makes LobsterTank capable of finding ALL instances, across any OpenClaw installation, automatically.

---

## Core Architecture

Two layers, in order:

### Layer 1: Deterministic Scan (zero tokens)

Pattern-matching scripts that flag definite problems and collect candidates for deeper review. This runs every time the user clicks "Run Determinism Audit" and costs nothing.

### Layer 2: LLM Review (optional, user-triggered, minimal tokens)

An LLM examines only the flagged candidates from Layer 1, not the whole file tree. The user clicks "Deep Scan" to invoke this. It costs a few cents, not a few dollars.

---

## Layer 1: Deterministic Scan

### What It Scans

Every `.md` file in every agent workspace directory. On the current Mac Mini, that means:

```
~/.openclaw/workspace/*.md          (Chief)
~/.openclaw/workspace-beehive/*.md  (Bee Hive)
```

Plus any future workspaces that get added (iloomi, newsie, techfabric, etc.). The scan discovers workspaces dynamically; it doesn't hardcode a list.

Also scans:
- `agents-rules.json` (are all rule blocks present and valid?)
- Each workspace's `AGENTS.md` (do they contain all required rule blocks?)
- Crontab (cross-reference against schedule language found in docs)
- OC internal crons and launchd services (same checks the Task Scheduler tab already does)

### Detection Categories

#### Category 1: Schedule Language Without Matching Crontab

**What to find:** Any `.md` file containing time references that don't have a corresponding crontab entry.

Pattern match for:
- Clock times: `\d{1,2}:\d{2}\s*(AM|PM|MT|ET|CT|PT|UTC)?`
- Frequency language: `every \d+ (minute|hour|day|week)s?`, `daily`, `weekly`, `hourly`
- Cron-like: `\*/\d+`, day ranges like `Mon-Fri`, `1-5`
- Schedule imperatives: `at \d+.*[AP]M`, `twice (a |per )day`

For each match, cross-reference against actual `crontab -l` output. If there's a time reference in a doc and a matching crontab entry exists, it's informational. If there's a time reference with NO matching crontab entry, it's a risk: the LLM might self-schedule it.

**Severity:**
- `high` — Time reference + action verb ("send at 6 AM", "compile daily") with no crontab entry
- `medium` — Time reference in a non-reference context (not clearly labeled as "this is handled by crontab")
- `info` — Time reference that's clearly a reference/description with matching crontab

#### Category 2: Action Imperatives Without Trigger Mechanisms

**What to find:** Sentences that tell the agent TO DO something on a schedule, rather than describing what exists.

Pattern match for imperative constructions:
- Lines starting with action verbs: `^(Send|Compile|Check|Poll|Monitor|Scan|Run|Execute|Process|Draft|Deliver|Summarize|Report)\b`
- Combined with schedule words in the same paragraph: `(daily|weekly|every|morning|evening|hourly|\d+:\d+)`
- Absence of mechanism references in the same paragraph: no mention of `crontab`, `wrapper`, `script`, `triggered by`

**Severity:**
- `high` — Action imperative + schedule word + no mechanism reference
- `medium` — Action imperative + schedule word + mechanism reference exists but is vague
- `low` — Action imperative with no schedule context (probably fine, just a task description)

#### Category 3: Missing Safeguard Language

**What to find:** Agent `AGENTS.md` files that don't contain all required rule blocks.

This already exists in the config sync audit (`GET /api/audit` via `sync-rules.sh --check`). Layer 1 reuses that check but frames it through the determinism lens:
- Missing `heartbeat-rules` = agent can self-schedule (critical)
- Missing `scheduling-rules` = agent can create rogue launchd/cron (critical)
- Missing `troubleshooting-flow` = agent might "fix" things by creating new scheduling (high)

#### Category 4: LLM-Spawning Cron Entries

**What to find:** Crontab entries that spawn a full LLM agent session for work that could be done with a bash command.

Heuristic: if a crontab entry calls `openclaw agent` or `openclaw-agent-wrapper.sh` on a `*/5` or more frequent schedule, and the description suggests a check/poll pattern (not a compose/draft/analyze pattern), flag it.

Cross-reference with the Gate Rule from the architecture doc:

```
Before any LLM call, the deterministic layer must answer:
1. Is there work to do? (check via bash/CLI, never ask an LLM)
2. What kind of work? (classify via pattern matching)
3. Which model tier? (select based on classification)
```

If a cron entry skips step 1 (checking for work) and goes straight to spawning an LLM, that's a cost leak.

**Severity:**
- `high` — High-frequency (*/5 or faster) LLM spawn with poll/check description
- `medium` — Moderate-frequency LLM spawn that could benefit from a pre-check
- `info` — LLM spawn that's appropriately gated (wrapper does a pre-check before spawning)

#### Category 5: Rogue Scheduling Mechanisms

Same checks the Task Scheduler tab already performs (`GET /api/scheduler`):
- OC internal crons should be empty
- Only `ai.openclaw.gateway` allowed in launchd
- Any other scheduling mechanism is a violation

#### Category 6: Conditional Logic in Documents

**What to find:** Natural language `if/then` logic in `.md` files that should be in a script.

Pattern match for:
- `if .*(then|,).*` combined with action verbs
- `when .*(new mail|no mail|inbox|unread|empty).*`
- `only if`, `unless`, `except when`, `skip if`

If a document contains conditional decision logic, the LLM will execute that logic every time it reads the document, burning tokens on what should be a bash `if` statement.

**Severity:**
- `high` — Conditional + action + would save tokens as a script (e.g., "if no new mail, skip processing")
- `medium` — Conditional that's behavioral guidance (e.g., "if a user asks about billing, escalate")
- `info` — Conditional that legitimately requires LLM judgment (e.g., "if the tone seems upset, be empathetic")

### Layer 1 Output

A structured findings list:

```json
{
  "scanTimestamp": "2026-03-01T16:30:00-07:00",
  "target": "~/.openclaw",
  "workspacesScanned": ["chief", "beehive"],
  "filesScanned": 14,
  "findings": [
    {
      "id": "DET-001",
      "category": "schedule-without-crontab",
      "severity": "high",
      "file": "~/.openclaw/workspace/MEMORY.md",
      "line": 42,
      "excerpt": "Portfolio status emails: 6:00 AM MT and 3:00 PM MT Mon-Fri",
      "context": "No matching crontab entry references this exact schedule",
      "hasCrontabMatch": false,
      "hasMechanismReference": true,
      "mechanismNote": "References 'triggered by crontab' in same paragraph",
      "suggestedAction": "Verify crontab entry exists for this schedule"
    },
    {
      "id": "DET-002",
      "category": "llm-spawning-cron",
      "severity": "high",
      "crontabEntry": "*/5 * * * * ~/bin/openclaw-agent-wrapper.sh ...",
      "description": "Spawns full LLM session every 5 minutes for email polling",
      "estimatedIdleCost": "$0.09/hour ($2.16/day)",
      "suggestedAction": "Add lightweight inbox check before LLM spawn"
    }
  ],
  "summary": {
    "high": 2,
    "medium": 1,
    "low": 0,
    "info": 5
  }
}
```

---

## Layer 2: LLM Review (Optional)

### When to Use

The user clicks "Deep Scan" after reviewing Layer 1 findings. Layer 2 sends ONLY the flagged excerpts (not full files) to an LLM for semantic analysis.

### What the LLM Evaluates

For each Layer 1 finding, the LLM answers:

1. **Is this actually non-deterministic?** (Layer 1 uses regex; it can't understand intent)
2. **What's the risk?** (Will an agent act on this, or is it clearly reference material?)
3. **What's the fix?** Not code, but a plain-language instruction that describes what the document should say instead

### Prompt Structure

The LLM receives a focused prompt per finding:

```
You are auditing an OpenClaw agent workspace for non-deterministic patterns.

The architecture principle: LLMs should never decide IF or WHEN to act.
That's handled by crontab and wrapper scripts. LLMs only act when spawned
with a specific instruction.

Here is an excerpt from [filename] in the [agent-name] workspace:

---
[excerpt with surrounding context, ~200 words max]
---

This was flagged as: [category] / [severity]
Reason: [Layer 1's reason for flagging]

Questions:
1. Could an LLM reading this document interpret it as an instruction to
   self-initiate an action? (yes/no/maybe)
2. If yes: what action might it take?
3. Suggested rewrite to make this clearly a reference description, not
   an instruction. Keep the same information but change framing.
```

### Cost Control

- Each finding sends ~300 tokens of context
- Use Haiku for the review (cheapest model that can understand intent)
- Typical scan: 5-15 findings x ~500 tokens each = ~5,000-7,500 tokens total
- Estimated cost: < $0.01 per deep scan

### Layer 2 Output

Enriches each Layer 1 finding with:

```json
{
  "id": "DET-001",
  "llmReview": {
    "isNonDeterministic": "no",
    "reasoning": "The paragraph explicitly says 'triggered by crontab, NOT self-scheduled'. This is safe reference language.",
    "suggestedRewrite": null,
    "confidence": "high"
  }
}
```

Or for an actual problem:

```json
{
  "id": "DET-003",
  "llmReview": {
    "isNonDeterministic": "yes",
    "reasoning": "This paragraph says 'Check for new support tickets every morning.' There is no reference to a crontab entry or wrapper script. An LLM would interpret this as 'I should check every morning.'",
    "suggestedRewrite": "Support ticket checking is handled by ~/bin/support-check-wrapper.sh, triggered by a crontab entry. Do NOT check for tickets on your own initiative.",
    "confidence": "high"
  }
}
```

---

## Frontend: Determinism Audit Tab

### Location

New tab in the top-level navigation, alongside Dashboard and Task Scheduler:

```
[Dashboard]  [Task Scheduler]  [Determinism Audit]
```

### Initial State

```
Determinism Audit
---

Scan your OpenClaw installation for non-deterministic patterns:
places where an LLM might interpret documents as instructions to
self-initiate actions.

                    [Run Scan]

Layer 1: Pattern matching (instant, zero tokens)
Layer 2: LLM review (optional, ~$0.01)

Target: ~/.openclaw
```

### After Layer 1 Scan

Display findings grouped by severity, then by category:

```
Determinism Audit                    2 high | 1 medium | 5 info
---

[Re-scan]   [Deep Scan (LLM Review)]   [Export for Review]

-- HIGH --

DET-002 | LLM-Spawning Cron                          crontab
  */5 * * * * openclaw-agent-wrapper.sh
  Spawns full LLM session every 5 min for email polling
  Estimated idle cost: $0.09/hr ($2.16/day)
  Suggested: Add lightweight inbox check before LLM spawn
                                              [Dispatch Fix]

DET-007 | Action Imperative Without Trigger     MEMORY.md:87
  "Compile deep analytics report every Friday afternoon"
  No crontab entry matches. No wrapper script referenced.
  Suggested: Rewrite as reference or create wrapper + cron
                                              [Dispatch Fix]

-- MEDIUM --

DET-004 | Conditional Logic in Document    HEARTBEAT.md:31
  "If there are more than 10 unread, prioritize client emails"
  This decision logic should be in the wrapper script, not
  in a document the LLM interprets at token cost every cycle.
                                              [Dispatch Fix]

-- INFO (collapsed by default) --
  5 findings: time references with matching crontab entries
  [Expand]
```

### [Dispatch Fix] Button

When the user clicks "Dispatch Fix" on a finding:

1. LobsterTank composes a plain-language instruction based on the finding
2. Shows it to the user in a confirmation dialog:

```
Dispatch Fix: DET-002

Instruction to send to OC:

  "The email polling crontab entry (*/5 * * * *)
  currently spawns a full LLM agent session every
  5 minutes, even when there's no new mail. Update
  the polling mechanism so it checks for new messages
  using a lightweight method (CLI/API) first, and
  only spawns an agent session if there are unread
  messages to process. The idle state should cost
  zero tokens."

  [Send to OC]   [Edit Instruction]   [Cancel]
```

3. "Edit Instruction" lets the user modify the text before sending
4. "Send to OC" dispatches through the gateway
5. After OC processes, the user re-scans to verify the fix landed

### [Export for Review] Button

Bundles the full scan results into a structured text block (same pattern as the audit change plan in the Audit & Deploy panel) with a Copy to Clipboard button. The user can paste this into Cowork or Claude for a second opinion.

Format:

```
LobsterTank Determinism Audit
Scanned: 2026-03-01T16:30:00-07:00
Target: ~/.openclaw
Workspaces: chief, beehive
Files scanned: 14

-- FINDINGS (2 high, 1 medium, 5 info) --

[HIGH] DET-002: LLM-Spawning Cron
  Source: crontab
  Entry: */5 * * * * openclaw-agent-wrapper.sh ...
  Problem: Spawns full LLM session every 5 minutes
           for email polling even when inbox is empty.
  Cost: ~$0.09/hr idle ($2.16/day, $64.80/month)
  Fix: Add lightweight inbox pre-check.

[HIGH] DET-007: Action Imperative Without Trigger
  Source: ~/.openclaw/workspace/MEMORY.md line 87
  Text: "Compile deep analytics report every Friday afternoon"
  Problem: No crontab entry matches. No wrapper referenced.
           Agent may self-schedule this task.
  Fix: Rewrite as reference or create wrapper + cron entry.

...

Paste this into Claude or Cowork for review.
```

### After Layer 2 (Deep Scan)

Each finding gets an additional LLM Review section:

```
DET-001 | Schedule Language                    MEMORY.md:42
  "Portfolio status: 6:00 AM and 3:00 PM Mon-Fri"

  LLM Review: SAFE
  "Paragraph explicitly says 'triggered by crontab, NOT
  self-scheduled'. This is correctly written reference language."
```

```
DET-007 | Action Imperative Without Trigger    MEMORY.md:87
  "Compile deep analytics report every Friday afternoon"

  LLM Review: NON-DETERMINISTIC
  "This reads as a direct instruction. An LLM would interpret
  this as 'I should compile analytics every Friday.' Rewrite to:
  'Deep analytics reports are compiled by [wrapper-script],
  triggered by a Friday crontab entry. Do NOT compile on
  your own initiative.'"
                                              [Dispatch Fix]
```

---

## Backend API

### `GET /api/determinism/scan`

Runs Layer 1 only. Returns the findings JSON structure described above.

Implementation:
1. Discover all workspaces under `~/.openclaw/workspace*`
2. Read all `.md` files in each workspace
3. Run regex patterns for each detection category
4. Cross-reference against `crontab -l` output
5. Check `AGENTS.md` files for required rule blocks
6. Check crontab entries against the Gate Rule heuristic
7. Assemble findings with severity ratings

### `POST /api/determinism/deep-scan`

Runs Layer 2 on specified findings (or all findings if no IDs specified).

```json
{ "findingIds": ["DET-001", "DET-002", "DET-007"] }
```

Sends each finding's excerpt to Haiku for semantic review. Returns enriched findings.

### `POST /api/determinism/dispatch`

Sends a fix instruction to OC through the gateway.

```json
{
  "findingId": "DET-002",
  "instruction": "Update the email polling mechanism so it checks for new messages using a lightweight method first, and only spawns an agent session if there are unread messages to process."
}
```

The dispatch endpoint talks to OC the same way any other instruction would, through the gateway. LobsterTank composes the instruction; OC implements it.

### `GET /api/determinism/export`

Returns the formatted text block for Export for Review.

---

## Implementation Order

### Phase 1: Layer 1 Scan Backend
- Workspace discovery (glob `~/.openclaw/workspace*`)
- File reader (read all `.md` files per workspace)
- Regex pattern library for each detection category
- Crontab cross-reference logic
- Rule block validation (reuse existing `sync-rules.sh --check` logic)
- Crontab entry analysis (Gate Rule heuristic)
- Findings assembly with severity ratings
- `GET /api/determinism/scan` endpoint

### Phase 2: Frontend
- Add "Determinism Audit" tab to navigation
- Build scan trigger and findings display
- Severity grouping with collapsible info section
- Dispatch Fix dialog with instruction preview and edit
- Export for Review with Copy to Clipboard
- Re-scan after dispatch

### Phase 3: Layer 2 Deep Scan Backend
- Haiku prompt template for each detection category
- Excerpt extraction (surrounding context, ~200 words per finding)
- `POST /api/determinism/deep-scan` endpoint
- Cost estimation display before running

### Phase 4: Dispatch Integration
- `POST /api/determinism/dispatch` endpoint
- Gateway communication for sending instructions to OC
- Post-dispatch re-scan to verify fix

### Phase 5: Smoke Test
- Run scan against current Mac Mini state
- Verify DET-002 (email polling) is flagged as high severity
- Verify HEARTBEAT.md references are flagged as info (safe, has mechanism references)
- Test Export for Review copy-paste into Claude
- If Layer 2 is ready, verify it correctly classifies safe vs unsafe findings

---

## Files

**Create (8)**:

| File | Purpose |
|------|---------|
| `packages/server/src/routes/determinism.ts` | All backend endpoints (scan, deep-scan, dispatch, export) |
| `packages/server/src/lib/determinism-scanner.ts` | Layer 1 regex engine and findings assembly |
| `packages/client/src/components/determinism/DeterminismAudit.tsx` | Main container component |
| `packages/client/src/components/determinism/DeterminismAudit.module.css` | Container styles |
| `packages/client/src/components/determinism/FindingsSection.tsx` | Findings list grouped by severity |
| `packages/client/src/components/determinism/FindingsSection.module.css` | Findings styles |
| `packages/client/src/components/determinism/DispatchFixDialog.tsx` | Instruction preview/edit/send dialog |
| `packages/client/src/components/determinism/DispatchFixDialog.module.css` | Dialog styles |

**Modify (5)**:

| File | Change |
|------|--------|
| `packages/server/src/routes/index.ts` | Mount `/determinism` routes |
| `packages/server/src/config.ts` | Add detection pattern constants, severity mappings |
| `packages/client/src/api/client.ts` | Add `determinismScan()`, `determinismDeepScan()`, `determinismDispatch()`, `determinismExport()` |
| `packages/client/src/components/layout/TopBar.tsx` | Add "Determinism Audit" to `ViewType` and nav tabs |
| `packages/client/src/App.tsx` | Add `"determinism"` view state and render `<DeterminismAudit>` |

---

## Design Principles

1. **Layer 1 is always free.** No tokens burned on the scan itself. Users should run it frequently without cost anxiety.

2. **Layer 2 is optional and cheap.** The user decides when to invoke LLM review. It costs pennies, not dollars.

3. **LobsterTank composes instructions, OC implements.** The Dispatch Fix button doesn't write scripts or edit files. It tells OC what outcome is needed, and OC figures out the implementation: wrapper scripts, crontab entries, document rewrites, whatever is appropriate.

4. **The scan adapts to any OC installation.** No hardcoded workspace names, no hardcoded file lists. It discovers what's there and evaluates it.

5. **Findings are exportable.** The Export for Review block is designed to be pasted into Claude/Cowork for human-in-the-loop review, maintaining the same audit-first pattern used by the Audit & Deploy panel.

---

## Reuse

- `ConfirmDialog` — dispatch fix confirmations
- `Badge` — severity indicators (red for high, yellow for medium, blue for info)
- `DataTable` — findings list (or custom layout if findings are too varied for table columns)
- `EmptyState` — clean scan with no findings
- `logAction()` — audit trail for dispatches
- `safeExec()` — calling `crontab -l`, `openclaw cron list`, and dispatch via `openclaw agent`
- `readTextFile()` / `listDir()` — reading workspace `.md` files
- Git snapshot helpers from `lib/git.ts` — safety net before dispatches
- Existing `sync-rules.sh --check` output — Category 3 (missing safeguard language)

---

## Verification

1. `npx tsc --noEmit` — both packages compile
2. `npm run dev` — servers start
3. `curl localhost:3333/api/determinism/scan | python3 -m json.tool` — returns structured findings
4. Open localhost:5173 — three tabs: Dashboard, Task Scheduler, Determinism Audit
5. Click "Run Scan" — findings appear grouped by severity
6. DET-002 (email polling) flagged as high severity
7. HEARTBEAT.md time references flagged as info (have mechanism references)
8. "Export for Review" produces clipboard-ready text
9. "Dispatch Fix" shows instruction preview with edit capability
10. After Deep Scan, findings show LLM review annotations
