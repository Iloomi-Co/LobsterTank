# Secret Protection — Outbound Redaction and Key Management

Prompt this to your OpenClaw agent to implement comprehensive secret and PII protection.

---

## Prompt: Build Secret Protection System

Build a deterministic secret protection system that prevents sensitive information from leaking through any outbound channel. This runs on every message, email, and file before it leaves the agent.

### Outbound Redaction Pipeline

Every piece of outbound content (emails, Slack messages, Telegram messages, file attachments, git commits) must pass through the redaction pipeline before delivery.

1. Create a deterministic redaction engine (`security/redactor.js` or `security/redactor.py`)
2. The engine scans for and redacts the following pattern categories:

#### API Keys and Tokens
- Patterns matching common key formats:
  - `sk-[a-zA-Z0-9]{20,}` (OpenAI-style)
  - `xai-[a-zA-Z0-9]{20,}` (xAI-style)
  - `ghp_[a-zA-Z0-9]{36}` (GitHub personal access tokens)
  - `gho_[a-zA-Z0-9]{36}` (GitHub OAuth tokens)
  - `Bearer [a-zA-Z0-9\-._~+/]+=*` (Bearer tokens)
  - `AKIA[A-Z0-9]{16}` (AWS access keys)
  - Any string matching `[A-Za-z0-9+/]{40,}` in contexts that suggest it's a key
- App passwords and SMTP credentials
- OAuth tokens and refresh tokens
- Webhook URLs containing tokens

#### Personally Identifiable Information (PII)
- Social Security Numbers: `\d{3}-\d{2}-\d{4}`
- Credit card numbers: `\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}`
- Phone numbers (when not in an approved contact list)
- Email addresses (when not in an approved recipient list for the current context)
- Physical addresses (street addresses not in approved contexts)

#### Financial Information
- Bank account numbers and routing numbers
- Financial figures marked as confidential in the data classification system

#### Internal Infrastructure
- Internal IP addresses and hostnames
- Database connection strings
- File paths containing sensitive directory names
- SSH keys and certificates

### Context-Aware Redaction

Not everything matching a pattern should be redacted. The system must understand context:

1. Maintain a whitelist of approved values per channel:
   - DM with Troy: most things are safe, but still redact API keys and passwords
   - Team Slack: redact PII and financial details, allow project-specific info
   - External email: strictest redaction — only allow what's explicitly approved
   - Git commits: redact all secrets, keys, passwords, and connection strings

2. Classification tiers (from the video's data confidentiality model):
   - **Confidential** (DM only, Troy only): financial figures, CRM contact details, deal values, personal emails
   - **Internal** (team channels OK): strategic notes, council recommendations, tool outputs
   - **Restricted** (external OK only with explicit approval): general knowledge, public info

### Pre-Commit Hook

Create a git pre-commit hook that blocks commits containing:
- Any pattern matching API key formats
- `.env` files or files containing environment variables
- Files matching: `*.pem`, `*.key`, `*.p12`, `*.pfx`
- Strings matching: `password=`, `secret=`, `token=`, `api_key=`
- Database files (`.sqlite`, `.db`) unless explicitly in `.gitignore`

Install the hook:
```bash
# .git/hooks/pre-commit
#!/bin/bash
# Scan staged files for secrets
patterns=(
  'sk-[a-zA-Z0-9]{20,}'
  'AKIA[A-Z0-9]{16}'
  'ghp_[a-zA-Z0-9]{36}'
  'password\s*[:=]'
  'secret\s*[:=]'
  'api_key\s*[:=]'
  'token\s*[:=]'
)

for pattern in "${patterns[@]}"; do
  if git diff --cached --diff-filter=d | grep -qE "$pattern"; then
    echo "BLOCKED: Potential secret detected matching pattern: $pattern"
    echo "Review staged changes and remove secrets before committing."
    exit 1
  fi
done
```

### File Permissions

Lock down sensitive files:
- Database files: `chmod 600` (owner read/write only)
- Config files with secrets: `chmod 600`
- Memory files: `chmod 600`
- The `.env` file: `chmod 600` and added to `.gitignore`

### SSRF Prevention

When the agent makes HTTP requests:
- Block requests to internal network ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`)
- Block requests to metadata endpoints (`169.254.169.254`)
- Validate URL schemes (only `http://` and `https://`)
- Follow redirects cautiously — re-validate the destination URL after each redirect
- Timeout all requests after 30 seconds

### SQL Injection Protection

For all database queries:
- Use parameterized queries exclusively — never string concatenation
- Validate input types before they reach the query layer
- Log all queries that fail validation
- Maintain a query allowlist for the most common operations

### Monitoring and Alerts

Track all redaction events:
```json
{
  "timestamp": "ISO-8601",
  "channel": "email|slack|telegram|git",
  "redaction_type": "api_key|pii|financial|infrastructure",
  "pattern_matched": "sk-...",
  "action": "redacted|blocked",
  "content_hash": "sha256:..."
}
```

Nightly security council should review:
- Number of redaction events by type and channel
- Any new patterns detected
- Any attempted exfiltration patterns (repeated attempts to send secrets)
