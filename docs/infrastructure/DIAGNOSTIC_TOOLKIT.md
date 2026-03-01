# Diagnostic Toolkit — Health Checks, Debugging, and System Monitoring

Prompt this to your OpenClaw agent to build diagnostic tools.

---

## Prompt: Build Diagnostic Toolkit

Build health check scripts, cron job debugging tools, and log analysis utilities for when things break.

### System Health Check Script

Create a script that checks:
1. Agent server/gateway process is running
2. Expected port is reachable
3. Recent API/LLM failure rates from interaction store
4. Recent errors from structured event logs
5. Server/gateway error logs for anomalies
6. Database integrity (can connect, tables exist, not corrupted)
7. Disk space usage
8. Memory usage

Output: pass/fail summary with details on failures.

State file tracks alert frequency with exponential backoff so you don't get spammed with the same alert.

### Cron Job Debugging Tools

1. **Query tool:** Filter cron history by job name, status (success/failure), date range, with configurable result limit
2. **Persistent failure detector:** Flag when the same job has failed 3+ times within a 6-hour window
3. **Stale job cleaner:** Auto-mark jobs stuck in "running" state for >2 hours as failed
4. **Timeline view:** Show last 24 hours of cron activity with visual timeline

### Unified Log Viewer

Single CLI that reads from the unified event log stream:
- Filter by: event name, log level, content substring, time range
- JSON output mode for piping into other tools
- Quick-access aliases:
  - `errors-1h` — errors in the last hour
  - `cron-fails` — all cron failures today
  - `email-activity` — email sends/receives today
  - `security-events` — all security-related events

### Model/Provider Diagnostics

1. **Status command:** Show which model is actually running, context usage percentage, fallback chain status, plugin connections
2. **Canary test:** Send a test prompt and verify response metadata matches the expected provider (catches silent auth failures)
3. **Usage dashboard:** Model costs, cron reliability, storage sizes, API call counts — all from one command
4. **Context monitor:** Track context window usage per channel/topic. Alert when approaching limits.

### Quick Diagnostic Commands

| Command | What It Does |
|---------|-------------|
| `status` | Model, context %, cache hit rate, active crons |
| `health` | Full system health check |
| `crons` | Last 24h cron activity |
| `errors` | Recent errors with context |
| `usage` | LLM token usage and cost estimates |
| `canary` | Test model connectivity |
| `context` | Context window usage breakdown |
