# Poseidon

**The deterministic control plane for OpenClaw AI agent installations.**

Poseidon discovers, validates, syncs, patches, and monitors OpenClaw instances running on the same hardware. It enforces a set of conventions that prevent LLM agents from self-scheduling, accumulating rogue services, or drifting from canonical configuration. Every change Poseidon makes is git-tracked with pre/post snapshots for full rollback.

---

## Architecture

```
packages/
  client/     React 19 + Vite dashboard (CSS Modules, dark/light theme)
  server/     Express API (TypeScript, ESM)
deploy/
  scripts/core/   Infrastructure scripts deployed to ~/bin/
  config/         Canonical rule definitions + manifests
```

Poseidon manages one or more OpenClaw installations ("profiles"):

| Profile | Directory | Description |
|---------|-----------|-------------|
| default | `~/.openclaw` | Primary installation |
| named | `~/.openclaw-{name}` | Additional installations (e.g. `~/.openclaw-iloomi`) |

Each profile is fully isolated: its own `openclaw.json`, workspace, agents, logs, and gateway port. Poseidon routes are profile-scoped (`/api/openclaw/...`, `/api/openclaw-iloomi/...`), so multiple browser tabs can view different profiles simultaneously without server-side state.

---

## What Poseidon Does to a New Claw

When Poseidon onboards or audits an OpenClaw installation, it performs the following steps. Each step is idempotent and safe to re-run.

### Step 1: Git Initialization

**What**: Ensures `OC_HOME` is a git repository.
**Why**: Every subsequent change gets a commit, creating a full audit trail with rollback capability.
**Files**:
- `OC_HOME/.git/` — initialized if missing
- `OC_HOME/.gitignore` — created with exclusions: `.env`, `*.key`, `auth-profiles.json`, `sessions/`, `node_modules/`

### Step 2: Pre-Apply Snapshot

**What**: Commits all current state before making any changes.
**Why**: If something goes wrong, you can `git revert` to this exact state.
**Commit message**: `Poseidon: pre-apply snapshot {timestamp}`

### Step 3: Config Sync (AGENTS.md Rules)

**What**: Ensures every agent's `AGENTS.md` contains the canonical rule blocks.
**Why**: These rules teach agents how scheduling works, where logs are, how to troubleshoot, and — critically — that they must NOT self-schedule. Without these rules, agents will try to create launchd services, `openclaw cron add` entries, or read the clock to decide when to act.

**Source of truth**: `deploy/config/agents-rules.json`
**Manifest**: `deploy/config/sync-manifest.json`
**Engine**: `deploy/scripts/core/sync-rules.sh`

#### The 6 Canonical Rules

| Rule ID | Title | Why It Exists |
|---------|-------|---------------|
| `scheduling-rules` | Scheduling Rules (MANDATORY) | Teaches crontab-only scheduling. Explicitly prohibits `launchd`, `openclaw cron add`, and reading the clock. |
| `log-locations` | Log Locations | Documents `~/.openclaw/logs/` as the single log directory. Prevents scattered logging. |
| `cost-monitoring` | Cost Monitoring | Teaches agents to check spend via `openclaw gateway usage-cost`. Prevents blind API consumption. |
| `troubleshooting-flow` | Troubleshooting Flow | Deterministic debug sequence: crontab → wrapper script → logs → pause files → ollama → gateway. Prevents agents from guessing. |
| `heartbeat-rules` | Heartbeat & Scheduling Boundaries | Declares that `HEARTBEAT.md` is a reference document, NOT instructions. Agents must NOT read the clock or self-schedule based on it. |
| `automation-creation` | Automation Creation (LLM as Compiler) | Teaches agents to generate wrapper scripts + crontab entries when asked to automate. The LLM is the compiler; cron is the runtime. |

Each rule has **three templates** selected by agent type:
- **Interactive** (full version) — for main agents that handle complex tasks
- **Processor** (short version) — for task-spawned agents (email processors, pollers)
- **Formatter** (short version) — for output-only agents (report formatters)

**Process**:
1. For each workspace listed in `sync-manifest.json`:
2. Read the workspace's `AGENTS.md`
3. For each required rule, check if the `## {Rule Title}` section exists
4. If section exists, validate keywords (e.g. "crontab" must appear in scheduling rules)
5. If section is missing → insert before `## See Also` (or append)
6. If section is outdated (missing keywords) → replace with canonical version
7. Back up original as `AGENTS.md.bak` before any changes

**Files touched**:
- `OC_HOME/workspace/AGENTS.md` — primary agent
- `OC_HOME/workspace-{name}/AGENTS.md` — sub-agents

### Step 4: Script Deployment

**What**: Copies infrastructure scripts from `deploy/scripts/core/` to `~/bin/` with `chmod 755`.
**Why**: These scripts are the immune system. They run on cron schedules to detect drift, enforce budgets, and remove rogue services.

#### Infrastructure Scripts

| Script | Schedule | Purpose |
|--------|----------|---------|
| `rogue-watchdog.sh` | `*/5 * * * *` | Scans `launchctl list` for unauthorized services (anything with "claw"/"openclaw" except the gateway). Removes plist, unloads service, creates `ROGUE_SERVICE_BLOCKED.md` breadcrumb. |
| `daily-spend-check.sh` | End of business | Fetches Anthropic API spend for today. If over daily budget: creates `~/.openclaw/.cron-paused`, which prevents ALL cron scripts from running until manually removed. |
| `weekly-audit.sh` | `0 6 * * 1` (Mon 6 AM) | Comprehensive drift report: launchd rogue check, crontab validation, OC internal crons, sessions, spend, ollama, AGENTS.md sync, @reboot entries. |
| `sync-rules.sh` | On-demand | Config sync engine (see Step 3). |
| `cross-instance-audit.sh` | On-demand | Validates consistency across multiple profiles. |
| `daily-spend-check.sh` | Daily | Budget enforcement with auto-pause. |
| `diagnose-auth.sh` | On-demand | Troubleshoots API authentication issues. |

**Config files** are also deployed from `deploy/config/` to `OC_HOME/deploy/config/`:
- `agents-rules.json` — canonical rule blocks
- `sync-manifest.json` — workspace-to-rules mapping
- `model-routing.json` — task-to-model mapping (which model for which task)

### Step 5: Wrapper Convention Validation

**What**: Reads every `~/bin/*.sh` script and validates it against 9 convention checks.
**Why**: Wrapper scripts are the bridge between deterministic scheduling (cron) and non-deterministic execution (LLM). If the bridge is wrong, agents run without guards, pile up duplicate sessions, or burn money on no-op polls.

Scripts are classified into three types:

| Type | Detection | Checks Applied |
|------|-----------|----------------|
| **Agent wrapper** | Contains `openclaw agent` command | All 9 checks |
| **Infrastructure** | Contains `rogue-watchdog`, `sync-rules`, `weekly-audit` | Shebang, strict mode, global pause, logging |
| **Utility** | Everything else | Shebang, strict mode |

#### The 9 Convention Checks

| # | Check | What It Validates | Why |
|---|-------|-------------------|-----|
| 1 | **Shebang** | `#!/bin/bash` on line 1 | Ensures bash execution, not sh/zsh |
| 2 | **Strict Mode** | `set -euo pipefail` | Fail fast on errors, undefined vars, pipe failures |
| 3 | **Global Pause** | Checks `~/.openclaw/.cron-paused` | Emergency kill switch: when spend ceiling hit or manual pause, ALL scripts stop |
| 4 | **Per-Task Pause** | Checks `~/.openclaw/.pause-{taskname}` | Granular control: pause one automation without affecting others |
| 5 | **Lockfile** | `LOCKFILE` variable + `trap` cleanup | Prevents duplicate execution when cron fires faster than script completes |
| 6 | **Logging** | Writes to `~/.openclaw/logs/` | Centralized log directory for all automation output |
| 7 | **Session ID** | `--session-id` with unique pattern | Prevents context accumulation across runs (each run is a fresh session) |
| 8 | **Pre-check** | Bash gate before `openclaw agent` | Lightweight check (himalaya IMAP, curl API, file mtime) BEFORE spawning LLM. No work → no tokens burned. |
| 9 | **Heredoc Prompt** | Multi-line `--message` via heredoc | Keeps prompts readable and maintainable, not inline strings |

### Step 6: Auto-Patching

**What**: For scripts that fail convention checks, Poseidon injects the missing code.
**Why**: Manual script editing is error-prone. Poseidon can add guards, pre-checks, and logging automatically.

**What gets patched**:
- **Global pause guard** → inserted after `set -euo pipefail`
- **Per-task pause guard** → inserted with `PAUSEFILE` variable and conditional exit
- **Lockfile guard** → `LOCKFILE` declaration, `trap EXIT` cleanup, stale-lock detection (600s timeout)
- **Pre-check gate** → `HAS_WORK` bash check inserted before `openclaw agent` invocation
- **Heredoc conversion** → inline `--message "..."` converted to heredoc format

### Step 7: Crontab Fixes

**What**: Ensures crontab has correct structure.
**Why**: Without a PATH line, scripts can't find binaries. Without correct keepalive syntax, ollama stalls.

**Fixes applied**:
- Adds `PATH=...` line if missing (derived from current `$PATH`)
- Fixes `--keepalive -1` → `--keepalive -1s` (ollama syntax)

### Step 8: Gateway Restart

**What**: If config sync was applied (rules changed), auto-restarts the OpenClaw gateway.
**Why**: The gateway caches config. After rule changes, it must restart to pick up new AGENTS.md content.

**Process**: Detects old PID via `lsof`, runs `openclaw gateway restart`, waits 2s, verifies new PID.

### Step 9: Post-Apply Snapshot

**What**: Commits all changes after apply.
**Why**: Creates a clean diff of exactly what Poseidon changed.
**Commit message**: `Poseidon: applied {categories}`

---

## Bootstrap Files

Every agent workspace requires these files. They are injected into every conversation, forming the agent's starting knowledge.

```
workspace/
├── AGENTS.md        # Rules of engagement — scheduling, logging, troubleshooting
│                    # Synced by Poseidon's config sync system
│                    # REQUIRED. ~2k tokens for processors, ~4k+ for interactive agents.
│
├── SOUL.md          # Personality, values, behavioral guidance
│                    # "You are {Name} — {role}." + core identity + principles
│                    # REQUIRED. ~400 tokens.
│
├── IDENTITY.md      # Agent metadata: Name, Role, Creature, Avatar
│                    # Parsed by Poseidon for display names in the dashboard
│                    # REQUIRED. ~70 tokens.
│
├── USER.md          # Human context: name, email, timezone, preferences
│                    # REQUIRED. ~60 tokens.
│
├── TOOLS.md         # MCP tool notes specific to this agent's setup
│                    # REQUIRED. ~200 tokens.
│
├── HEARTBEAT.md     # Reference doc listing recurring automations and their schedules
│                    # READ-ONLY by the agent. NOT instructions. NOT a trigger.
│                    # The agent must never read the clock to act on this.
│                    # REQUIRED. Variable size.
│
├── BOOT.md          # One-time startup tasks (gateway startup hook)
│                    # OPTIONAL. Only for main workspace.
│
├── MEMORY.md        # Long-term memory (agent-maintained, 200-line limit)
│                    # REQUIRED. Poseidon warns if >160 lines, critical if >200.
│
├── memory/          # Daily session notes (YYYY-MM-DD.md)
│                    # Raw conversation logs, distilled into MEMORY.md
│
├── docs/            # Documentation (on-demand retrieval, not injected)
│   └── avatars/     # Agent avatar images
│
└── config/          # Configuration files (on-demand retrieval)
```

**Token budget**: All bootstrap files are injected at session start. For a 200k context window (Claude), you want bootstrap under 5k tokens to leave room for conversation. Poseidon tracks this per agent.

---

## Determinism Scanner

Poseidon scans all workspace markdown files for patterns that could cause non-deterministic agent behavior.

### 6 Detection Categories

| Category | Severity | Example |
|----------|----------|---------|
| **Schedule language without crontab** | High/Medium | `"Check email every 5 minutes"` in AGENTS.md but no matching crontab entry |
| **Action imperatives without trigger** | High/Medium | `"Send daily reports at 6 AM"` with no wrapper script reference |
| **Missing safeguard language** | High | AGENTS.md missing canonical rule blocks (scheduling, troubleshooting) |
| **LLM-spawning cron entries** | High/Medium | High-frequency crontab entries (e.g. `*/5 * * * *`) spawning agents without pre-check gates |
| **Rogue scheduling mechanisms** | High | `openclaw cron list` returns entries, or unauthorized launchd services found |
| **Conditional logic in documents** | Medium/Low | `"If it's Monday, send the report"` — agent should not be reading the clock |

The scanner supports **deep scan**: sends flagged excerpts to an OC agent for LLM review, returning confidence ratings and suggested rewrites.

---

## Task Scheduler

Poseidon provides unified control over three scheduling systems:

### Crontab (Primary — the only approved scheduler)
- Parse, display, toggle (comment/uncomment), update schedule
- Profile filtering: only shows entries whose scripts reference the current `OC_HOME`
- Detects orphaned entries (scripts that no longer exist in `~/bin/`)
- Run history: parses log files to show last 7 runs with success/failure/skip status
- Cost estimation: reads `cron/runs/` session data for actual API spend per script
- Helplessness detection: flags scripts that consistently fail

### OC Internal Crons (Should always be empty)
- Lists via `openclaw cron list`
- Allows removal — these should not exist; all scheduling via crontab

### Launchd Services (Only gateway allowed)
- Scans `~/Library/LaunchAgents/` for OC-related plists
- Only `ai.openclaw.gateway` is legitimate
- Everything else is flagged as rogue (see rogue-watchdog.sh)

---

## Memory Dashboard

Monitors agent knowledge base health per profile:

- **Bootstrap file audit**: Presence, size, staleness, token count per file
- **MEMORY.md analysis**: Section parsing, line count vs 200-line limit, compaction warnings
- **Daily notes**: Session log enumeration with token counts
- **Retrieval index**: docs/, config/, memory/ directory enumeration
- **Context window gauge**: Bootstrap tokens as percentage of 200k context capacity
- **Memory system detection**: Reads `openclaw.json` for backend type (QMD, default, etc.)
- **Agent query**: Send questions to agents via `openclaw agent` to test their memory

---

## Multi-Tenancy

### URL Structure
```
Client:  /{profile-slug}/          → Dashboard
         /{profile-slug}/cost      → Cost
         /{profile-slug}/scheduler → Tasks
         /{profile-slug}/determinism → Audit
         /{profile-slug}/memory    → Memory

API:     /api/{profile-slug}/health
         /api/{profile-slug}/audit
         /api/{profile-slug}/memory
         /api/profiles              → List all profiles (global)
         /api/ping                  → Health check (global)
```

### Profile Slugs
- `openclaw` → `~/.openclaw` (default)
- `openclaw-iloomi` → `~/.openclaw-iloomi`
- `openclaw-personal` → `~/.openclaw-personal`

### How It Works
1. Every API request hits a middleware that resolves the profile slug to a directory
2. The middleware calls `recomputePaths()` which updates all module-level path variables (`OC_HOME`, `OC_CONFIG`, `OC_LOGS_DIR`, etc.)
3. Route handlers read from these variables, so they automatically operate on the correct profile
4. Profile switching is pure URL navigation — no server-side state mutation

---

## Onboarding a New Claw

When Poseidon encounters a new OpenClaw installation (e.g. `~/.openclaw-iloomi`), here is the expected state and what needs to happen:

### What the new Claw already has (from `openclaw init`)
- `openclaw.json` with gateway config
- `workspace/` directory with template bootstrap files (AGENTS.md, SOUL.md, etc.)
- Gateway running on its own port

### What Poseidon adds
1. **Git repository** in `OC_HOME` for change tracking
2. **Canonical rules** synced into `workspace/AGENTS.md` (all 6 rule blocks)
3. **Infrastructure scripts** deployed to `~/bin/` (rogue-watchdog, daily-spend-check, weekly-audit, sync-rules)
4. **Crontab entries** for the infrastructure scripts (if not already present)
5. **Config files** deployed to `OC_HOME/deploy/config/`
6. **Manifest entry** in `sync-manifest.json` for the new workspace
7. **Wrapper scripts** for any agent automations (with all 9 convention checks passing)

### What the human fills in
- `IDENTITY.md` — agent name, role, creature description, avatar
- `SOUL.md` — personality, values, behavioral guidance
- `USER.md` — human's name, email, timezone
- `TOOLS.md` — MCP tool notes specific to this agent

### What the agent fills in over time
- `MEMORY.md` — long-term memory (maintained by the agent, monitored by Poseidon)
- `memory/*.md` — daily session notes
- `docs/` — documentation the agent creates or receives

---

## Running Poseidon

```bash
# Development
npm run dev          # Starts client (Vite :5173) + server (:3333)

# Production
npm run build        # Builds client + server
npm start            # Runs server (serves built client)
```

Dashboard: `http://127.0.0.1:3333`

### Keyboard Shortcuts
- `R` — Refresh current view
- `T` — Toggle dark/light theme
