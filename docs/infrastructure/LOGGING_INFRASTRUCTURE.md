# Logging Infrastructure — Structured Events, Unified Viewer, and Rotation

Prompt this to your OpenClaw agent to build comprehensive logging.

---

## Prompt: Build Logging Infrastructure

Build a hybrid logging system with structured event logs, a unified viewer, database ingestion for analysis, and automated rotation. Log everything — every error, every LLM call, every external service hit.

### Structured Event Logging

Create a shared logging module used across the entire app:

1. **Per-event JSONL files** at `data/logs/<event_name>.jsonl` (e.g., `email-send.jsonl`, `cron-run.jsonl`, `llm-call.jsonl`)
2. **Unified stream** at `data/logs/all.jsonl` — every event mirrored here
3. Auto-redact secrets before writing (reuse patterns from SECRET_PROTECTION.md)
4. Timestamp all entries with ISO format
5. Include: event type, severity (info/warn/error/critical), source module, message, metadata

Log entry schema:
```json
{
  "timestamp": "2026-02-25T10:30:00Z",
  "event": "email-send",
  "level": "info",
  "source": "beehive/email",
  "message": "Sent daily status to tb@bzzr.com",
  "metadata": {
    "recipient": "tb@bzzr.com",
    "subject": "BZZR Daily Status",
    "duration_ms": 1200
  }
}
```

### Log Viewer CLI

Build a CLI tool for querying logs:
- Filter by event name, log level, content substring, time range
- JSON output mode for scripting and analysis
- Quick-access aliases: "errors in the last hour", "all cron failures today"
- Colorized terminal output for readability

### Nightly Database Ingest

Run nightly (part of the 5:00 AM cron):
- Parse JSONL files into a `structured_logs` table in SQLite
- Parse raw server logs into a separate table
- Deduplicate on insert to handle overlapping rotated files
- Index by timestamp, event type, and level for fast queries

### Log Rotation (Daily Cron)

- Rotate JSONL files exceeding 50MB
- Archive old interaction/API log rows into monthly databases
- Keep last 3 rotations
- Delete rotated files older than 30 days

### LLM Usage Tracking

Centralized interaction store (SQLite):
- `llm_calls` table: provider, model, prompt hash, token counts (in/out), duration, estimated cost, status, task type
- `api_calls` table: service, endpoint, method, status code, duration
- Fire-and-forget logging for minimal performance impact
- Auto-redact secrets before storing prompts/responses
- Archive rows older than 90 days into monthly databases

### Usage Dashboard

Aggregate data from interaction store, cron log, and other databases:
- Model costs by provider
- Cron job reliability rates
- Database sizes
- API call counts and failure rates
- Token usage by task type
- JSON output mode for programmatic consumption

### Morning Self-Healing Routine

Every morning, the agent should:
1. Read error logs from overnight
2. Identify any failures or issues
3. Attempt to fix them automatically
4. Report what was fixed and what needs human intervention
5. Update `docs/learnings.md` with new insights
6. Update `docs/errors.md` with new error patterns

This creates a virtuous cycle: errors get logged → agent reads logs → agent fixes issues → agent records what it learned → future sessions benefit.
