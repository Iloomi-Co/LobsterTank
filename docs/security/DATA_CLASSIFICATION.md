# Data Classification — Confidentiality Tiers and Channel Rules

Prompt this to your OpenClaw agent to implement the data classification and access control system.

---

## Prompt: Build Data Classification System

Implement a three-tier data classification system that controls what information can be shared where. This must be enforced both by agent rules and by deterministic code.

### Classification Tiers

#### Tier 1: Confidential (DM Only — Troy Only)
Information that must never leave direct messages with Troy:
- Financial figures (revenue, costs, margins, deal values)
- CRM contact details (personal emails, phone numbers, deal specifics)
- Deal values and negotiation positions
- Personal notes and daily journal entries
- Personal emails and private communications
- API keys, passwords, and authentication tokens
- Agent configuration details (what tools are available, what integrations exist)

#### Tier 2: Internal (Team Channels OK — No External)
Information safe for the internal team but never for external parties:
- Strategic notes and planning documents
- Council recommendations and audit results
- Tool outputs and system reports
- Project status updates with specifics
- Internal meeting notes and action items
- Cron job results and system health metrics

#### Tier 3: Restricted (External OK — Only with Explicit Approval)
Information that can be shared externally only with Troy's explicit approval:
- General knowledge and publicly available information
- Generic project descriptions (without confidential details)
- Public-facing content and marketing materials
- Approved vendor communications

### Channel Mapping

Define what each communication channel can carry:

| Channel | Max Tier | Examples |
|---------|----------|---------|
| DM with Troy | Confidential | Everything — financial, personal, strategic |
| Team Slack channels | Internal | Project updates, action items, status reports |
| Email to team | Internal | Meeting notes, task assignments |
| Email to external | Restricted | Only pre-approved content, no confidential details |
| Git commits | Restricted | Code and documentation only, no secrets |
| Public posts | Restricted | Only with explicit Troy approval |

### Email Account Rules

Each email account has specific channel permissions:

| Account | Purpose | Can Send To | Max Tier |
|---------|---------|-------------|----------|
| Chief's email | Portfolio summaries | troy@busot.com | Internal |
| Bee Hive (beehive@bzzr.com) | BZZR execution | tb@bzzr.com (default), whitelisted recipients with CC | Internal |
| Iloomi agent email | Iloomi work | Troy (configured address) | Internal |
| TechFabric agent email | TechFabric work | Troy (configured address) | Internal |
| Newsie agent email | Newsie work | Troy (configured address) | Internal |

### Deterministic Enforcement

Build a content classifier (`security/classifier.js` or `security/classifier.py`) that:

1. Takes content + destination channel as input
2. Scans content for tier-specific markers:
   - Financial patterns: `$`, dollar amounts, percentages in financial context, "revenue", "cost", "margin", "deal value"
   - PII patterns: email addresses, phone numbers, SSNs, addresses
   - Strategic patterns: "strategy", "roadmap", "competitive", "acquisition"
   - Secret patterns: API keys, tokens, passwords (reuse from SECRET_PROTECTION.md)

3. Assigns a content tier based on the highest-tier marker found
4. Compares content tier against channel tier:
   - Content tier <= channel tier → ALLOW
   - Content tier > channel tier → BLOCK and suggest appropriate channel

5. Log all classification decisions

### Cross-Agent Information Barriers

Each project agent operates in isolation:
- Bee Hive knows only about BZZR
- Iloomi knows only about Iloomi
- TechFabric knows only about TechFabric
- Newsie knows only about Newsie
- Chief has cross-project visibility but respects confidentiality when communicating with individual agents

Enforcement:
- Agent workspaces are filesystem-isolated
- No agent can access another agent's workspace
- Chief can read from all workspaces but must not leak cross-project information to individual agents
- If Troy asks one agent about another project, the agent should say it doesn't have that information and suggest asking Chief

### Monitoring

Track classification events:
```json
{
  "timestamp": "ISO-8601",
  "content_tier": "confidential|internal|restricted",
  "destination_channel": "dm|team_slack|email_internal|email_external|git",
  "channel_tier": "confidential|internal|restricted",
  "action": "allowed|blocked|escalated",
  "markers_found": ["financial_amount", "api_key"],
  "content_hash": "sha256:..."
}
```

Nightly security council should review:
- Any blocked messages (potential data leakage attempts)
- Classification accuracy (are things being classified correctly?)
- New patterns that should be added to the marker list
