# Business Intelligence Council — Nightly Strategic Analysis

Prompt this to your OpenClaw agent to build the nightly business intelligence council.

---

## Prompt: Build Business Intelligence Council

Build a nightly advisory engine with multiple expert personas analyzing your data sources and producing ranked strategic recommendations.

### Data Sync Layer

Sync data from business tools on regular intervals into dedicated SQLite databases:

| Source | Sync Frequency | Database |
|--------|---------------|----------|
| Team chat (Slack/Telegram) | Every 3 hours | `data/chat-sync.db` |
| Project management (Asana/Linear/Todoist) | Every 4 hours | `data/projects-sync.db` |
| CRM / sales pipeline | Every 4 hours | `data/crm.db` |
| Social analytics | Daily (overnight cron) | `data/social-analytics.db` |
| Financial data | Imported from exports | `data/financials.db` |
| Knowledge base | Continuous | `data/knowledge.db` |

### Independent Expert Architecture

Define multiple expert personas, each focused on a domain. Each expert only sees signals from their tagged data sources plus a cross-domain brief.

Recommended experts for Betterist:

| Expert | Focus | Data Sources |
|--------|-------|-------------|
| Portfolio Strategist | Cross-project coordination, resource allocation | All project data, CRM |
| Revenue Guardian | Revenue health, deal pipeline, financial trends | CRM, financials, email |
| Operations Analyst | Dev velocity, blockers, delivery timelines | Project management, GitHub, chat |
| Content Strategist | Content performance, audience growth, trends | Social analytics, knowledge base |
| Market Analyst | Competitive landscape, industry trends | Knowledge base, web research |
| Risk Assessor | Risks, blockers, dependencies, deadline threats | All sources |

Run experts in parallel for speed. Each produces a structured finding:
```markdown
## [Expert Name] — [Date]

### Key Findings
1. [Finding with evidence and confidence level]
2. [Finding with evidence and confidence level]

### Recommendations
1. [Actionable recommendation with rationale]

### Risks Identified
- [Risk with severity and suggested mitigation]
```

### Synthesis Pass

A synthesizer LLM merges all expert findings:
1. Identify overlapping insights (multiple experts flagging the same issue = high signal)
2. Resolve conflicting recommendations
3. Produce ranked recommendations with rationale
4. Assign priority (critical/high/medium/low) and effort estimate
5. Store snapshots and recommendation history in SQLite

### Delivery

- Post nightly digest to strategy/analysis channel
- Format as a concise briefing (not a wall of text)
- Include: top 3-5 recommendations, key risks, metrics summary
- Build a CLI for deeper dive exploration of specific recommendations
- Feedback loop: accept/reject recommendations to tune future analysis

### Model Routing

- Expert analysis: use the most capable model (Opus 4.6)
- Synthesis: same or moderately capable model (Sonnet 4.6)
- Data fetching/formatting: fast model (Haiku) or code-based
