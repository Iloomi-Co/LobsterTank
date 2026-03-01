# Self-Improvement — Error Capture, Review Councils, and Continuous Learning

Prompt this to your OpenClaw agent to build self-improvement systems.

---

## Prompt: Build Self-Improvement Systems

Build systems for error capture, automated review councils, tiered testing, and proactive error reporting so the agent continuously improves.

### Learnings Directory

Maintain three files in each agent's `docs/` folder:

1. **docs/learnings.md** — Captured corrections and insights from user feedback
2. **docs/errors.md** — Recurring error patterns the agent has encountered
3. **docs/feature-requests.md** — Ideas for improvement

Optional: post-tool-use hook that scans tool output for error patterns and auto-logs them.

### Automated Review Councils (Nightly Cron)

Run as sub-agents with the best available frontier model:

#### Platform Health Council
Reviews:
- Cron reliability (which jobs are failing? which are flaky?)
- Code quality (any lint errors, type errors, test failures?)
- Test coverage (are new features tested?)
- Prompt quality (are key files clean, deduplicated, within budget?)
- Dependency health (outdated packages, security vulnerabilities?)
- Storage usage (databases growing too large? logs need rotation?)
- Data integrity (CRM contacts correct? knowledge base entries valid?)
- Config consistency (are all agents using the same operational facts?)

#### Security Council
Multi-perspective analysis (see NIGHTLY_SECURITY_COUNCIL.md):
- Offensive: think like an attacker
- Defensive: are defenses intact?
- Data privacy: any leakage paths?
- Operational realism: are measures actually working?

#### Innovation Scout
Scans for new automation opportunities:
- Review everything the agent is doing
- Search the web for what other people are doing with AI agents
- Compare capabilities and identify gaps
- Propose new ideas with accept/reject feedback loop
- Store accepted ideas in `docs/feature-requests.md`

### Tiered Testing

| Tier | Frequency | Cost | What It Tests |
|------|-----------|------|--------------|
| 1 | Nightly | Free | Integration tests, no LLM calls. File operations, database queries, cron scheduling. |
| 2 | Weekly | Low | Tests that make live LLM calls. Prompt quality, response format, classification accuracy. |
| 3 | Weekly | Moderate | Full end-to-end tests including messaging platform round-trips, email sends, CRM updates. |

### Error Reporting Rule

Add to the agent's system prompt:
- Proactively report ALL failures via messaging platform
- Include error details and context
- The user cannot see stderr or background logs
- Proactive reporting is the only way they'll know something went wrong
- Don't swallow errors silently

### Continuous Learning Loop

1. Error occurs → logged to `docs/errors.md` with root cause and fix
2. User gives feedback → logged to `docs/learnings.md` with correction
3. Agent reviews logs each morning → identifies patterns
4. Patterns become rules in key files (AGENTS.md, SOUL.md)
5. Nightly councils verify rules are being followed
6. Innovation scout finds new opportunities
7. Cycle repeats
