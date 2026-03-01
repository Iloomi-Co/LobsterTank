# Marketing Instructions — OpenClaw Automation

Generic marketing automation patterns adapted from Matthew Berman's workflow. These are CRM-agnostic and can be implemented with any pipeline (Airtable, Notion, custom SQLite, etc.).

## Inbound Lead Pipeline

### Email Ingestion
Set up a dedicated email address for your OpenClaw agent (e.g., agent@yourdomain.com) and add it to your public-facing contact groups. The agent should:

1. Poll the inbox on a cron schedule (every 10 minutes is a good starting cadence)
2. Quarantine and scan each email before processing (see `security/PROMPT_INJECTION_DEFENSE.md`)
3. Classify each email using the scoring rubric below
4. Apply labels/tags and draft a context-aware reply
5. Escalate high-value leads immediately; batch lower-priority notifications

### Scoring Rubric
Build an editable scoring rubric with five weighted dimensions:

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| Fit | 25% | How relevant is this company/person to your business? |
| Clarity | 15% | Is the request specific with clear deliverables? |
| Budget | 20% | Are there budget signals or is it vague? |
| Company Trust | 20% | Does the company have verifiable web presence, reviews, social proof? |
| Close Likelihood | 20% | Based on tone, urgency, and specificity, how likely is this to convert? |

### Score-Based Actions

| Score Range | Label | Action |
|-------------|-------|--------|
| 80–100 | Exceptional | Escalate to team immediately. No automated reply. Human handles. |
| 60–79 | High | Escalate to team (non-urgent). Queue for human follow-up. |
| 40–59 | Medium | Send automated qualification questions. Ask for budget, timeline, deliverables. |
| 20–39 | Low | Send polite decline with alternative resources or referral link. |
| 0–19 | Spam | Ignore. Archive. Log for pattern detection. |

The rubric should be living — give your agent feedback on scores regularly. Over a few days of calibration, it will align closely with your judgment.

### Sender Research
For every inbound lead scored Medium or above, the agent should:

- Look up the sender's company website
- Check for verifiable web presence and social proof (reviews, press mentions)
- Look up the people at the company (LinkedIn profiles, team pages)
- Verify any claims in the email (funding rounds, company size, partnerships)
- Store all research in the CRM database

### Context-Aware Reply Drafting
Replies should not be templates. The agent should:

- Reference previous conversations with this person or similar companies
- Pull relevant information from the knowledge base
- Use a natural, human tone (configure a "humanizer" prompt to avoid AI-sounding language)
- Draft the reply but require human approval before sending (for Medium+ leads)

## CRM Pipeline Management

### Contact Discovery
Scan email, calendar, and messaging channels to automatically discover contacts:

1. Filter out spam, marketing, event invites
2. Classify remaining contacts by relationship type (lead, partner, vendor, team)
3. Store in a local database with SQL + vector columns for both structured queries and semantic search
4. Run proactive research on each contact's company

### Deal Stage Tracking
Monitor email conversations for stage-change signals:

| Signal | Stage Change |
|--------|-------------|
| Initial outreach received | New Lead |
| Qualification questions answered | Qualified |
| Budget/timeline discussed | Negotiations |
| Contract/terms mentioned | Closing |
| Payment or agreement confirmed | Won |
| No response after 2+ follow-ups | Stale |

When a stage change is detected:
- Update the local CRM database
- Send a notification to the team
- If using an external CRM, sync the stage change
- Watch for drift between local records and external CRM

### Natural Language Queries
Your CRM database should support natural language queries:
- "Who have I talked to in the last week?"
- "Who haven't I heard from in 4 months?"
- "Which leads are in the negotiation stage?"
- "Show me all contacts from companies in the AI space"

### Automatic Follow-Ups
Set up nudge rules:
- Lead hasn't responded in 3 days → Draft a follow-up
- Deal has been in same stage for 2 weeks → Flag for review
- Contact hasn't been reached in 4 months → Suggest re-engagement

## Meeting Intelligence

### Post-Meeting Processing
After each meeting:

1. Pull the transcript (from Fathom, Otter, Fireflies, or any transcription tool)
2. Match attendees to CRM contacts
3. Extract insights and action items
4. Generate embeddings for semantic search later
5. If action items exist, send to your task manager for approval before adding
6. Update the CRM with meeting notes and next steps

### Action Item Routing
When multiple people attend a meeting:
- Identify who is responsible for each action item based on context
- Associate action items with the correct deal/project
- Assign to the right person in your task management tool
- Send a summary to the team channel

## Knowledge Base

### Content Ingestion
Create a knowledge base where you can throw anything interesting:

- Articles, videos, X posts, research papers
- Share via messaging (Telegram, Slack) — agent downloads and indexes
- Team members can also contribute — agent indexes but doesn't cross-post back
- Every piece gets chunked, embedded, and stored in SQLite with vector columns

### Security on Ingestion
Every piece of content from the internet must go through:
1. Deterministic sanitization (strip potential prompt injections)
2. Sandbox isolation (process in quarantine)
3. Frontier model scan (secondary AI review of sanitized content)
4. Only if all three pass → store and index

### Cross-Pollination
The real value is connecting knowledge base entries to CRM contacts:
- New article about a contact's company → Link to their CRM record
- Proactive daily scan for news about companies you work with
- When drafting replies to a lead, pull relevant knowledge base articles automatically

### Content Pipeline Integration
When you identify a potential content idea (blog post, video, social media):
1. Agent reads the full conversation context
2. Queries knowledge base for related content
3. Searches the web for supplementary discourse
4. Creates a structured brief with outline, reference material, packaging ideas (hook, title, thumbnail suggestions)
5. Posts back to your team channel

## Notification Batching

### Priority-Based Delivery
Reduce notification noise by batching:

| Priority | Delivery | Examples |
|----------|----------|---------|
| Critical | Immediate | Security alerts, deal closures, urgent escalations |
| High | Hourly batch | CRM updates, cron failures, important lead activity |
| Medium | Every 3 hours | Routine updates, non-urgent notifications, daily metrics |
| Low | Daily digest | Background task completions, minor updates |

All notifications get stored in a notification database regardless of delivery timing.

## Financial Tracking

Export financial data (from QuickBooks, Xero, Wave, or CSV) into your local database:
- Natural language queries against financial data
- "What did I spend the most on this month?"
- "Which clients generated the most revenue?"
- Confidentiality rules: financial data shared only in DMs or dedicated finance channels

## Cost Optimization

1. Use local embeddings (Nomic, or similar on-device model) — zero cost for vector operations
2. Implement model tiering — use cheaper/faster models for routine tasks, frontier models only when needed
3. Spread heavy cron jobs throughout the night to stay within quota limits
4. Use prompt caching where available
5. Calendar-aware polling — don't poll constantly, look for signals that indicate when to check
6. Batch notifications to reduce API calls
7. Use context-aware polling — only fetch when conditions suggest new data

## Backup and Recovery

### Database Backup
- Automatically discover all database files
- Encrypt before uploading to cloud storage (Google Drive, S3, etc.)
- Document the backup manifest
- Rotate old backups on a schedule

### Code/Config Sync
- Auto-commit changes to git every hour
- Push to remote repository
- Alert on commit failures

### Restoration
- Maintain a restoration playbook as a markdown file
- Document: download from storage → decrypt → read manifest → restore
- Test restoration periodically
