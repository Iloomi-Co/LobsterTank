# HEARTBEAT.md

## Email Polling

- [ ] Check email inbox — notify agent of anything new/important

### Polling Schedule

| Window | Interval |
|--------|----------|
| Mon-Fri, business hours ([USER_TIMEZONE]) | Every [POLL_INTERVAL_BUSINESS] minutes |
| Mon-Fri, outside business hours | Every [POLL_INTERVAL_OFFHOURS] minutes |
| Weekend (Fri 5:00 PM - Mon 6:00 AM [USER_TIMEZONE]) | Every [POLL_INTERVAL_WEEKEND] minutes |

## Daily Status Reports

**[MORNING_REPORT_TIME] [USER_TIMEZONE]:**
- Compile [PROJECT_1] status -> email to [USER_EMAIL]
- Compile [PROJECT_2] status -> email to [USER_EMAIL]
- Compile [PROJECT_3] status -> email to [USER_EMAIL]
- Compile [PROJECT_4] status -> email to [USER_EMAIL]

**[AFTERNOON_REPORT_TIME] [USER_TIMEZONE]:**
- Compile [PROJECT_1] status -> email to [USER_EMAIL]
- Compile [PROJECT_2] status -> email to [USER_EMAIL]
- Compile [PROJECT_3] status -> email to [USER_EMAIL]
- Compile [PROJECT_4] status -> email to [USER_EMAIL]

Each email should include:
- What the agent accomplished since last update
- Current blockers or issues
- Next steps/ongoing work
- High-level progress summary

## Special Scheduled Tasks

[Add any project-specific deep updates, scans, or special cron jobs here]
