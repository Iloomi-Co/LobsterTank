# Key Files Management — Deduplication, Cleanliness, and Governance

Prompt this to your OpenClaw agent to implement the key files governance system.

---

## Prompt: Build Key Files Governance System

Create a system that keeps agent key files distinct, deduplicated, and clean. Each agent workspace has a defined set of "key files" that are loaded into context on every session. These files must be lean, non-overlapping, and accurate. Implement automated enforcement and nightly auditing.

### Key Files Definition

Each agent workspace may contain ONLY these key files at the root level:

| File | Purpose | Max Lines | Loaded When |
|------|---------|-----------|-------------|
| `IDENTITY.md` | Name, creature type, emoji, avatar. 5-10 lines max. | 15 | Every session |
| `SOUL.md` | Personality, philosophy, role, boundaries, communication rules. | 200 | Every session |
| `USER.md` | About the human: name, timezone, role, preferences. | 20 | Every session |
| `AGENTS.md` | Operational rules: session routine, safety, memory, heartbeat, group chat behavior. | 250 | Every session |
| `TOOLS.md` | Environment-specific values: API configs, channel IDs, tool notes. | 150 | Every session |
| `HEARTBEAT.md` | Periodic cron checklist. Short. | 50 | On heartbeat only |
| `MEMORY.md` | Long-term curated memory. Loaded in main session only. | 300 | Main session only |
| `BOOTSTRAP.md` | First-run setup. Deleted after first conversation. | 50 | First run only |

All other documents (memory logs, drafts, research, session logs, reports) go into subfolders — never at the root.

### What Belongs Where — Canonical Placement Rules

Each piece of information has ONE home. If it appears in multiple files, it's a duplication bug.

| Information Type | Canonical Home | Does NOT Belong In |
|-----------------|----------------|-------------------|
| Agent name, emoji, creature type | IDENTITY.md | SOUL.md, AGENTS.md |
| Agent personality, tone, vibe description | SOUL.md | IDENTITY.md, AGENTS.md |
| Agent role and responsibilities | SOUL.md | AGENTS.md |
| Communication rules (external comms) | SOUL.md | AGENTS.md, TOOLS.md |
| Security boundaries and email policies | SOUL.md (policy) + TOOLS.md (technical details) | AGENTS.md |
| Human's name, timezone, preferences | USER.md | SOUL.md, MEMORY.md |
| Session startup routine | AGENTS.md | SOUL.md |
| Memory management rules | AGENTS.md | MEMORY.md |
| Heartbeat behavior rules | AGENTS.md | HEARTBEAT.md |
| Group chat behavior | AGENTS.md | SOUL.md |
| Specific heartbeat tasks | HEARTBEAT.md | AGENTS.md |
| API keys, tool configs, channel IDs | TOOLS.md | AGENTS.md, SOUL.md |
| Email sending configuration | TOOLS.md | SOUL.md (reference policy only) |
| Vendor/contact details | SOUL.md (key contacts) or `docs/contacts.md` | TOOLS.md |
| Project roadmap/architecture | SOUL.md (overview) or `docs/` subfolder | AGENTS.md, TOOLS.md |
| Historical decisions and solved issues | MEMORY.md | SOUL.md, AGENTS.md |
| Daily logs and session notes | `memory/YYYY-MM-DD.md` | MEMORY.md |

### Cross-Reference Rules

When one file needs to reference content that lives in another file:
- Use a brief pointer: `See TOOLS.md for email configuration details`
- Do NOT copy the content into both files
- Do NOT summarize the content in both files
- The pointer should be one line maximum

### Nightly Deduplication Audit

Create a cron job (run at 3:00 AM) that performs the following for every agent workspace:

1. **Read all key files** in the workspace
2. **Extract information chunks** — break each file into semantic blocks (paragraphs, sections, bullet points)
3. **Compare across files** — look for:
   - Identical text appearing in multiple files
   - Semantically similar content in multiple files (same information, different wording)
   - Information that's in the wrong file per the canonical placement rules
   - Files exceeding their max line count
4. **Generate a deduplication report:**
   ```markdown
   # Deduplication Report — [Agent] — [Date]

   ## Duplications Found
   - [File A, line X] and [File B, line Y]: "[duplicated content]"
     → Canonical home: [File A]. Remove from [File B].

   ## Misplaced Content
   - [File A, line X]: "[content]" belongs in [File B]
     → Move to [File B] and replace with pointer in [File A].

   ## Oversized Files
   - [File]: X lines (max: Y). Trim or move excess to docs/ subfolder.

   ## Drift Detection
   - [File A] and [File B] say conflicting things about [topic]:
     - File A: "[version 1]"
     - File B: "[version 2]"
     → Resolve to single source of truth in [canonical file].
   ```
5. **Apply fixes automatically** for clear-cut duplications (identical text in wrong file)
6. **Flag for human review** anything ambiguous (conflicting information, unclear canonical home)
7. **Log the audit** to `infrastructure/audit-logs/dedup-YYYY-MM-DD.md`

### Prompt Drift Detection

Beyond deduplication, check for drift:
- Are two files giving contradictory instructions?
- Has a file accumulated "cruft" — outdated information that no longer applies?
- Are there TODO items or temporary notes that should have been cleaned up?
- Has a file grown beyond its purpose (e.g., TOOLS.md containing project strategy)?

### File Size Budget

Track token count for each key file. The total budget for all key files loaded per session should stay under a target:

| File Set | Target Max Tokens |
|----------|------------------|
| Every-session files (IDENTITY + SOUL + USER + AGENTS + TOOLS) | 8,000 tokens |
| With MEMORY.md (main session) | 12,000 tokens |
| With HEARTBEAT.md (heartbeat) | 9,000 tokens |

If the total exceeds the budget:
1. Identify the largest file
2. Move detailed/reference content to `docs/` subfolder
3. Replace with a brief summary and a pointer to the detailed file
4. The detailed file gets loaded only when relevant, not every session

### Automated Trimming

Every other day (or as needed), the agent should:
1. Review all key files for trim opportunities
2. Move stale/completed items from MEMORY.md to archive
3. Compress verbose sections without losing meaning
4. Target ~10% reduction per cycle (per Matthew Berman's guidance)
5. Log what was trimmed and why

### Template for New Agents

When creating a new agent workspace, start with these templates:

**IDENTITY.md template:**
```markdown
# IDENTITY.md
- **Name:** [Agent Name]
- **Creature:** [What kind of AI agent]
- **Vibe:** [2-3 word description]
- **Emoji:** [Single emoji]
```

**USER.md template:**
```markdown
# USER.md
- **Name:** Troy Busot
- **What to call them:** Troy
- **Timezone:** America/Denver
- **Role:** [Role relevant to this project]
```

**SOUL.md template:**
```markdown
# SOUL.md — [Agent Name]

You are **[Agent Name]** — [one-line description of role].

## How You Work
- [3-5 bullets defining behavior]

## Boundaries
- [Security and scope rules]

## Communication Rules
- [How to communicate externally]

## Direct Communication from Troy
Troy may send you direct instructions. When this happens:
- Act immediately on Troy's instructions
- Report the instruction and your response in your next regular report to Chief
- This keeps Chief aware of all portfolio activity
```

**AGENTS.md** — Use the standard template from Chief's workspace (it's the OpenClaw default). Do NOT customize per agent unless the agent has genuinely different operational needs.

**TOOLS.md template:**
```markdown
# TOOLS.md — [Agent Name] Local Notes

## Email Configuration
- **Account:** [email]
- **Tool:** [Himalaya/Python SMTP/Zapier MCP]
- **Default recipient:** [primary contact]

## Integrations
- [List environment-specific tool configs]
```
