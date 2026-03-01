# Workspace Structure — Canonical Folder Organization

This document defines the required folder structure for all agent workspaces. Key files live at the root. Everything else goes into organized subfolders.

## Standard Agent Workspace Layout

```
workspace-{agent}/
├── IDENTITY.md          # Name, creature, emoji (5-10 lines)
├── SOUL.md              # Personality, role, boundaries, communication rules
├── USER.md              # About Troy (name, timezone, role)
├── AGENTS.md            # Operational rules, session routine
├── TOOLS.md             # Environment-specific configs
├── HEARTBEAT.md         # Periodic cron checklist
├── MEMORY.md            # Long-term curated memory (main session only)
├── docs/                # Reference materials (loaded on demand)
│   ├── learnings.md     # Lessons learned from mistakes
│   ├── errors.md        # Error log with root causes and fixes
│   ├── feature-requests.md  # Ideas and enhancements
│   └── [project-specific docs]
├── memory/              # Daily session logs
│   ├── YYYY-MM-DD.md    # Daily notes (auto-created)
│   └── heartbeat-state.json  # Heartbeat tracking state
├── drafts/              # Work in progress (emails, memos, reports)
│   └── [draft files]
└── exports/             # Completed deliverables ready for sharing
    └── [export files]
```

## What Goes Where

| Content Type | Location | Notes |
|-------------|----------|-------|
| Agent identity and personality | Root key files | Loaded every session |
| Project documentation | docs/ | Loaded only when relevant |
| Daily session logs | memory/ | Raw logs, auto-created |
| Long-term curated memory | MEMORY.md (root) | Distilled from daily logs |
| Email drafts | drafts/ | Work in progress |
| Research output | docs/ or drafts/ | Depends on completion state |
| Completed reports | exports/ | Ready to send |
| Error logs | docs/errors.md | Persistent error tracking |
| Lessons learned | docs/learnings.md | Never repeat mistakes |
| Heartbeat state | memory/heartbeat-state.json | Last check timestamps |

## Rules

1. Only the 7 standard key files live at the workspace root
2. BOOTSTRAP.md may exist temporarily at root during first run, then gets deleted
3. No loose files at the root — if it's not a key file, it goes in a subfolder
4. The docs/ folder is for reference material that the agent loads on demand
5. The memory/ folder is for daily logs only — not for drafts or deliverables
6. The drafts/ folder is for work in progress — move to exports/ when done
7. Clean up drafts/ weekly — archive or delete completed drafts

## Infrastructure Folder (Shared)

The infrastructure folder lives at the OpenClaw root level (not per-agent) and contains shared policies:

```
OpenClaw/
├── infrastructure/
│   ├── marketing-instructions.md
│   ├── KEY_FILES_MANAGEMENT.md
│   ├── MEMORY_MANAGEMENT.md
│   ├── WORKSPACE_STRUCTURE.md (this file)
│   └── security/
│       ├── PROMPT_INJECTION_DEFENSE.md
│       ├── SANDBOXING.md
│       ├── SECRET_PROTECTION.md
│       ├── NIGHTLY_SECURITY_COUNCIL.md
│       └── DATA_CLASSIFICATION.md
└── Agents/
    ├── workspace/          (Chief)
    ├── workspace-beehive/  (Bee Hive / BZZR)
    ├── workspace-iloomi/   (Iloomi)
    ├── workspace-techfabric/ (Blanket / TechFabric)
    └── workspace-newsie/   (Wire / Newsie)
```

## Maintenance

A nightly cleanup cron runs at 3:10 AM MT (see `infrastructure/WORKSPACE_CLEANUP.md`) that:
- Moves misplaced files from workspace roots into the correct subfolders
- Archives stale drafts older than 14 days to `exports/archive/`
- Flags unsynthesized daily memory logs older than 30 days
- Ensures all 5 standard subfolders exist
- Writes per-agent suggestions to `docs/cleanup-suggestions.md`

The nightly deduplication audit (see KEY_FILES_MANAGEMENT.md) also checks:
- Are there loose files at workspace roots that should be in subfolders?
- Are subfolders growing too large? (docs/ > 20 files → consider sub-categorizing)
- Are there stale drafts older than 2 weeks?
- Are daily memory logs older than 30 days? (archive or delete)
