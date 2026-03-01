# Workspace Cleanup — Nightly Folder Hygiene and Organization Suggestions

Cron job that runs nightly to enforce folder structure and suggest organizational improvements to each agent.

## Schedule

- **Frequency:** Nightly at 3:10 AM MT (after memory compaction, before security council)
- **Model:** Haiku (cheap classification work; escalate to Sonnet only if reorganization proposals are complex)
- **Timeout:** 5 minutes
- **Notification:** Summary to Troy only if issues found; silent on clean pass

## What It Does

### Phase 1: Enforcement (automatic)

These checks run across all 5 agent workspaces. Violations are fixed automatically.

1. **Root cleanliness:** Scan each workspace root for files that aren't one of the 7 standard key files (IDENTITY.md, SOUL.md, USER.md, AGENTS.md, TOOLS.md, HEARTBEAT.md, MEMORY.md). Move violators to the appropriate subfolder:
   - `.md` reference docs → `docs/`
   - `.json` config files → `config/`
   - Draft-looking files (incomplete, WIP, "draft" in name) → `drafts/`
   - Everything else → `docs/` (safe default)
   - Log the move in `docs/learnings.md` so the agent knows what happened

2. **Stale draft cleanup:** Flag drafts older than 14 days. Don't delete them — move to `exports/archive/` and note the move in the agent's daily log.

3. **Memory log rotation:** Flag daily notes in `memory/` older than 30 days. Verify their content has been synthesized into MEMORY.md before archiving. If not synthesized, leave them and flag for the agent's next session.

4. **Empty subfolder creation:** Ensure all 5 standard subfolders exist (docs/, memory/, drafts/, exports/, config/). Create any missing ones silently.

### Phase 2: Suggestions (report only)

These generate recommendations but take no automatic action. Delivered as a brief report to each agent's `docs/cleanup-suggestions.md` (overwritten each run).

1. **docs/ growth check:** If docs/ has more than 20 files, suggest sub-categorizing (e.g., `docs/integrations/`, `docs/product/`). Propose specific groupings based on file names and content.

2. **exports/ accumulation:** If exports/ has more than 10 files, suggest archiving older deliverables or cleaning up files that have already been sent.

3. **New work organization:** Review the agent's most recent daily notes (last 3 days in `memory/`) for patterns:
   - Is the agent creating files that could benefit from a new subfolder?
   - Are there repeated tasks that should have their own docs/ reference file?
   - Is the agent storing similar content in inconsistent locations?
   Suggest specific reorganization moves.

4. **Cross-agent consistency:** Compare folder structures across all 5 workspaces. Flag any workspace that has drifted from the standard layout (e.g., extra subfolders that other agents don't have, missing standard files).

## Output Format

### Summary (to Troy, only if issues found)

```
Workspace Cleanup — [date]

Fixes applied:
- [workspace]: Moved [file] from root to docs/ (not a key file)
- [workspace]: Archived 3 stale drafts to exports/archive/

Suggestions pending:
- Bee Hive: docs/ has 24 files, recommend sub-categorizing
- Chief: exports/ has 12 files, consider archiving sent deliverables

All clean: [list workspaces with no issues]
```

### Per-Agent Suggestions (docs/cleanup-suggestions.md)

```
# Cleanup Suggestions — [date]

## Recommended Actions
- [specific suggestion with exact file paths and proposed moves]

## Folder Health
- docs/: [count] files ([status: healthy | crowded | needs sub-categorizing])
- memory/: [count] daily logs ([oldest date] — [newest date])
- drafts/: [count] files ([count] older than 14 days)
- exports/: [count] files

No action needed if all folders are healthy.
```

## Integration

- Uses the cron wrapper script and logs to the central cron DB (see CRON_AUTOMATION.md)
- Respects workspace isolation: each agent's workspace is scanned independently
- The cleanup-suggestions.md file is overwritten each run (not appended) to stay current
- Agents should check `docs/cleanup-suggestions.md` during their morning startup if it exists

## What It Does NOT Do

- Never deletes files. Moves to archive subfolders only.
- Never modifies key file content. Only moves misplaced files.
- Never crosses workspace boundaries (agent A's files stay in agent A's workspace).
- Never moves files without logging the action.
