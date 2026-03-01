# Cron Automation — Scheduling, Reliability, and Cost-Aware Execution

Prompt this to your OpenClaw agent to build the cron automation system.

---

## Prompt: Build Cron Automation System

Set up cron automation with central logging, a wrapper script with reliability features, and persistent failure detection.

### Central Cron Log Database (SQLite)

Create a cron log database with these operations:

1. **log-start:** Record job name, start time, return a run ID
2. **log-end:** Record completion with status (success/failure), duration, summary
3. **query:** Filter history by job name, status (success/failure), date range
4. **should-run:** Idempotency check — skip if already succeeded today/this hour (prevents duplicate runs)
5. **cleanup-stale:** Auto-mark jobs stuck in "running" state for >2 hours as failed (handles machine sleep, process crashes)

### Cron Wrapper Script

Create a wrapper script that all cron jobs run through:

- Signal traps (SIGTERM/SIGINT/SIGHUP) for clean shutdown
- PID-based lockfile to prevent concurrent runs of the same job
- Optional timeout (kill job if it runs too long)
- Integrates with the cron log for start/end recording
- Logs both stdout and stderr

### Cost-Aware Scheduling

Spread heavy cron jobs throughout the night to stay within token quota:

| Time (MT) | Job Category | Examples |
|-----------|-------------|---------|
| 1:00 AM | Social analytics | Instagram collection |
| 1:15 AM | Social analytics | X/Twitter collection |
| 1:30 AM | Social analytics | YouTube analytics |
| 2:00 AM | CRM | Contact discovery, relationship scoring |
| 2:30 AM | Knowledge base | Article refresh, proactive company research |
| 3:00 AM | Memory | Compaction, deduplication audit |
| 3:10 AM | Workspace | Folder cleanup and organization suggestions (see WORKSPACE_CLEANUP.md) |
| 3:20 AM | Security | Nightly security council |
| 3:45 AM | Self-improvement | Platform health review, innovation scout |
| 4:00 AM | Backup | Database encryption and upload |
| 4:30 AM | Sync | Git auto-commit and push |
| 5:00 AM | Logging | Log rotation, database ingest |

During business hours, only lightweight crons should run (email polling, calendar checks, heartbeats).

### Reliability Features

1. **Persistent failure detection:** Alert when the same job fails 3+ times within a 6-hour window (distinguishes flaky jobs from one-off failures)
2. **Health check:** Run every 30 minutes — check that all expected crons ran on schedule
3. **Duplicate run prevention:** PID files prevent concurrent execution
4. **Stale job cleanup:** Runs automatically on every new job start

### Notification Standards

- Only failures go to the cron-updates channel
- Success notifications go to the job's relevant channel (the output itself serves as confirmation)
- Persistent failures escalate to critical priority (immediate delivery)

### Job Configuration

Configure jobs in structured payloads that include:
- Job name and description
- Schedule (cron expression)
- Timeout
- Model to use (if LLM-powered)
- Notification channel for results
- Whether the job requires the main session context or runs independently
