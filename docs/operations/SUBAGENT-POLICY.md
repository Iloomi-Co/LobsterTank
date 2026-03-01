# Subagent Policy

Core directive: anything other than a simple conversational message should spawn a subagent.

## When to use a subagent

Use a subagent for:
- Searches (web, social, email)
- API calls
- Multi-step tasks
- Data processing
- File operations beyond simple reads
- Calendar/email operations
- Any task expected to take more than a few seconds
- Anything that could fail or block the main session

## When to work directly

Handle these without a subagent:
- Simple conversational replies
- Quick clarifying questions
- Acknowledgments
- Quick file reads for context
- Single-step lookups where spawning a subagent would take longer than just doing it

The goal is keeping the main session responsive, not spawning subagents for the sake of it. If a direct approach is faster and simpler, use it.

## Coding, debugging, and investigation delegation

All coding, debugging, and investigation tasks go through subagents. The main session should never block on this work.

The subagent evaluates complexity:
- **Simple:** Handle directly. Config changes, small single-file fixes, appending to existing patterns, checking one log or config value.
- **Medium / Major:** Delegate to your coding agent CLI. This includes multi-file features, complex logic, large additions, and multi-step investigations that require tracing across files or systems.

## Why

Main session stability is critical. Subagents:
- Keep the main session responsive so the user can keep talking
- Isolate failures from the main conversation
- Allow concurrent work
- Report back when done

## Delegation announcements

When delegating to a subagent, tell the user which model and provider you're using. This makes the routing visible.

Format: [model] via [provider/tool]

Examples:
- "Spawning a subagent with Opus 4.6 to research that vendor."
- "Delegating to Sonnet 4.6 via coding agent CLI."

Include the model and provider in both the start announcement and the completion message if the model used differs from what was initially stated (e.g., fallback).

## Failure handling

When a subagent fails:
1. Report to the user via messaging platform with error details
2. Retry once if the failure seems transient (network timeout, rate limit)
3. If the retry also fails, report both attempts and stop

## Multi-agent delegation

The Chief agent can delegate to project agents using `sessions_spawn` or the agent CLI. Project agents do not spawn other project agents. They can spawn sub-agents for their own tasks but never cross workspace boundaries.

## Persistent Agent vs. Temporary Subagent

Not every new workload needs a persistent agent. Use this decision framework:

| Signal | Subagent (temporary) | New Agent (persistent) |
|--------|---------------------|----------------------|
| Frequency | One-off or rare | Recurring / ongoing |
| State | Stateless, no memory needed between runs | Needs its own memory, learnings, config |
| Scope | Narrow task within an existing agent's domain | Cross-cutting or outside any agent's domain |
| Model strategy | Same model as the parent agent | Benefits from a different model tier (e.g., free/open-source) |
| Isolation | No special isolation needed | Needs its own workspace, tools, or security boundary |

When the Chief decides to create a persistent agent, follow the protocol in SOUL.md under Dynamic Agent Creation.

## Implementation

Use OpenClaw's subagent spawning mechanism with:
- Clear task description
- Default to Sonnet 4.6 for non-coding subagent tasks
- Use Opus 4.6 for complex analysis, security scanning, or important drafts
- Only use a different model if the primary is unavailable or the task requires a specialized capability
- Estimated time if helpful
