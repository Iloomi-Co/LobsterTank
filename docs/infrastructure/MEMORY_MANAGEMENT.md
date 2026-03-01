# Memory Management — Compaction, Deduplication, and Context Optimization

Prompt this to your OpenClaw agent to implement the memory management system based on Matthew Berman's approach.

---

## Prompt: Build Memory Management System

Implement a memory management system that keeps agent memory lean, accurate, and useful. Memory bloat is the primary cause of agents "forgetting" things — when context is too full, important information gets pushed out. The goal is aggressive compaction and deduplication while preserving every meaningful insight.

### Memory Architecture

Each agent has two memory layers:

1. **Daily Notes** (`memory/YYYY-MM-DD.md`) — Raw session logs. What happened today. Created automatically during each session.
2. **Long-Term Memory** (`MEMORY.md`) — Curated insights, decisions, and context. Distilled from daily notes. Loaded in main sessions only.

Additionally, specialized memory files may exist in `docs/`:
- `docs/learnings.md` — Lessons learned from mistakes (never repeat the same error)
- `docs/errors.md` — Error log with root causes and fixes
- `docs/feature-requests.md` — Ideas and enhancements to implement later

### Daily Notes Schema

Each daily note should follow this structure:

```markdown
# [YYYY-MM-DD] — [Agent Name] Daily Notes

## Session Summary
- [1-3 sentence overview of what happened today]

## Key Events
- [HH:MM] [Event description]
- [HH:MM] [Event description]

## Decisions Made
- [Decision and rationale]

## Action Items
- [ ] [Incomplete item]
- [x] [Completed item]

## Issues Encountered
- [Issue and resolution or current status]

## Notes for Tomorrow
- [Anything the next session should know immediately]
```

### MEMORY.md Schema

Long-term memory should be organized by topic, not chronologically:

```markdown
# MEMORY.md — [Agent Name] Long-Term Memory

## Active Context
[Things that are immediately relevant to current work — max 10 items]

## Key Decisions
[Important decisions and their rationale — helps avoid re-debating settled issues]

## Solved Issues
[Problems that were solved — prevents re-solving the same problem]

## Integration Points
[How this agent connects to other systems — email, APIs, tools]

## Standing Rules
[Persistent rules that aren't in SOUL.md or AGENTS.md — operational specifics]

## People and Relationships
[Key contacts, their roles, preferences, communication style]

## Archive
[Older items moved here during compaction — still searchable but not in active context]
```

### Compaction Process

Run compaction as a cron job every 3 days (or when MEMORY.md exceeds 300 lines):

1. **Read recent daily notes** (last 7 days)
2. **Read current MEMORY.md**
3. **Identify promotion candidates** — daily note entries that represent:
   - Decisions that will matter in future sessions
   - Lessons learned from mistakes
   - New integration points or configuration changes
   - Relationship context (new contacts, communication preferences learned)
   - Standing rules that emerged from experience
4. **Promote to MEMORY.md** — add to the appropriate section
5. **Identify archive candidates** in MEMORY.md:
   - Issues that were solved more than 2 weeks ago and haven't recurred
   - Decisions about features that are now shipped
   - Context that's no longer actively relevant
6. **Move to Archive section** — don't delete, just move down. Keeps it searchable.
7. **Deduplicate** — look for entries saying the same thing in different words
8. **Compress** — rewrite verbose entries to be concise without losing meaning

### Deduplication Rules

When the same information appears in multiple places:

1. **Across daily notes** — Normal, no action needed. Daily notes are append-only logs.
2. **Within MEMORY.md** — Merge into a single entry in the most appropriate section.
3. **Between MEMORY.md and key files** — Remove from MEMORY.md. Key files are the canonical source.
4. **Between MEMORY.md and docs/** — Keep in docs/ (the detailed version). MEMORY.md should have a brief pointer.

### Context Window Monitoring

Monitor context utilization regularly (use `/status` command or equivalent):

| Context Usage | Status | Action |
|---------------|--------|--------|
| < 50% | Healthy | No action needed |
| 50-70% | Watch | Start looking for trim opportunities |
| 70-85% | Warning | Run compaction immediately, increase daily note expiration rate |
| 85-95% | Critical | Clear old context, archive aggressively, trim all key files |
| > 95% | Emergency | Clear context and restart with only essential key files |

### Telegram/Slack Topic-Based Memory

Following Matthew Berman's approach, use separate channels/topics for different concerns. Each topic maintains its own conversational context, which means:
- The agent has to "remember" less per topic
- Context stays relevant to the topic at hand
- You don't need to reset context as frequently

Recommended topic structure:
- **General** — Default catch-all
- **CRM** — Contact and deal management
- **Cron Updates** — Automated task results
- **Daily Brief** — Morning summary and priorities
- **Project-Specific** — One topic per active project
- **Knowledge Base** — Article saves and research
- **Self-Improvement** — Agent optimization and learning

### Learnings and Error Tracking

#### docs/learnings.md
```markdown
# Learnings — [Agent Name]

## [YYYY-MM-DD] [Category]
**What happened:** [Brief description]
**What went wrong:** [Root cause]
**What we learned:** [The takeaway]
**Prevention:** [How to avoid this in the future]
```

#### docs/errors.md
```markdown
# Error Log — [Agent Name]

## [YYYY-MM-DD] [Error Type]
**Error:** [Error message or description]
**Context:** [What was happening when it occurred]
**Root Cause:** [Why it happened]
**Fix:** [How it was resolved]
**Recurrence Prevention:** [Steps taken to prevent it]
```

### Automated Memory Maintenance Schedule

| Task | Frequency | Time |
|------|-----------|------|
| Daily note creation | Every session | Session start |
| MEMORY.md promotion from daily notes | Every 3 days | During heartbeat |
| Full compaction and deduplication | Weekly | 3:00 AM Sunday |
| Archive old entries | Weekly | 3:00 AM Sunday |
| Context usage check | Every heartbeat | — |
| Key files token budget check | Nightly | Part of dedup audit |
| Learnings.md and errors.md review | Weekly | Include in compaction |
| Daily note cleanup (delete > 30 days) | Monthly | 1st of month |

### Emergency Context Recovery

If an agent loses context or starts behaving erratically:

1. Check `/status` — is context > 90%?
2. If yes, clear the conversation context
3. The agent will re-read its key files on next session start
4. Check MEMORY.md — is it bloated or corrupted?
5. If yes, run manual compaction: keep only Active Context and Key Decisions
6. Move everything else to Archive
7. Resume normal operation

### Self-Healing From Logs

Following Matthew Berman's morning routine:
1. Agent wakes up
2. Reads error logs from overnight
3. Identifies any failures or issues
4. Attempts to fix them automatically
5. Reports what it fixed and what needs human intervention
6. Updates docs/learnings.md with any new insights

This creates a virtuous cycle: errors get logged → agent reads logs → agent fixes issues → agent records what it learned → future sessions benefit from the learning.
