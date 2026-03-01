# Nightly Security Council — Automated Security Review

Prompt this to your OpenClaw agent to set up the nightly security council.

---

## Prompt: Build Nightly Security Council

Set up a nightly security council that runs automatically (cron, 2:00 AM) and performs a comprehensive security audit of the entire OpenClaw system. The council should use a sub-agent with the best available frontier model. Results should be logged and critical findings should trigger immediate alerts.

### Council Composition

The nightly council should evaluate from four perspectives:

1. **Offensive Security** — Think like an attacker. What vectors exist? What's exposed?
2. **Defensive Security** — Are all defenses intact? Any gaps in the three-layer defense?
3. **Data Privacy** — Is sensitive data properly contained? Any leakage paths?
4. **Operational Realism** — Are the security measures actually working, or just configured?

### Audit Checklist

#### File Permissions
- Scan all files in the workspace for permission anomalies
- Database files should be `600` (owner read/write only)
- Config files with secrets should be `600`
- No world-readable sensitive files
- Log any permission changes since last audit

#### Gateway and Network
- Verify token-based authentication is active on all endpoints
- Check that no services are directly exposed to the internet
- Verify SSRF prevention rules are in place
- Check that internal network ranges are blocked from outbound requests

#### Secrets Audit
- Scan all files (including git history) for exposed secrets
- Check that the pre-commit hook is installed and functioning
- Verify `.gitignore` includes all sensitive file patterns
- Check environment variables for any that shouldn't be set

#### Prompt Injection Defense
- Verify the three-layer defense is operational
- Review the deterministic sanitizer pattern list — is it current?
- Check the quarantine directory for stuck items
- Review scan logs for any concerning patterns or escalating risk scores

#### Data Classification
- Verify that confidential data stays in DM-only channels
- Check that internal data hasn't leaked to external channels
- Review the outbound redaction logs for any anomalies
- Verify that database encryption is active

#### Cron Health
- Check that all security-related crons are running on schedule
- Verify that no crons have silently failed
- Check cron logs for errors

#### Database Security
- Verify all databases are encrypted
- Check backup encryption is active
- Verify that database passwords are set and not default
- Check for any unauthorized database access patterns

### Council Output

The council should produce a structured report:

```markdown
# Security Council Report — [DATE]

## Overall Status: [GREEN/YELLOW/RED]

## Critical Findings (require immediate action)
- [finding with severity and recommended fix]

## Warnings (address within 24 hours)
- [finding with context]

## Observations (informational)
- [note for awareness]

## Metrics
- Files scanned: X
- Secrets found: X (should be 0)
- Permission anomalies: X
- Injection attempts blocked (24h): X
- Quarantine items pending review: X
- Database encryption status: [OK/ISSUE]
- Backup status: [OK/ISSUE]

## Recommendations
- [actionable improvement suggestions]
```

### Alert Routing

- **Critical findings** → Immediate Telegram/Slack alert to Troy
- **Warnings** → Included in morning daily brief
- **Observations** → Logged only, included in weekly summary

### Innovation Scout (Security Edition)

As part of the nightly council, also:
- Search for new prompt injection techniques discovered in the wild
- Check for new CVEs relevant to the tools and libraries in use
- Suggest updates to the deterministic sanitizer patterns based on new threats
- Flag any dependencies that have known vulnerabilities
