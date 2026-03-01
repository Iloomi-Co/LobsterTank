# Dual Prompt Stacks — Multi-Model Support with Automated Sync

Prompt this to your OpenClaw agent to set up dual prompt stacks.

---

## Prompt: Set Up Dual Prompt Stacks

Set up two parallel prompt configurations optimized for different model families, with an automated sync script that catches when they drift apart.

### Primary Stack (Claude-Optimized)

Root `.md` files use Claude best practices:
- Natural language style, explain the "why" behind rules
- Avoid aggressive emphasis (ALL-CAPS, excessive "CRITICAL", "MUST")
- Claude models overtrigger on urgency markers — just tell it what to do
- Use examples and reasoning over commands
- Reference the Claude prompting guide for specific techniques

### Secondary Stack (GPT/Codex-Optimized)

Separate directory (e.g., `codex-prompts/`) with the same files:
- XML tags or structured markers for hierarchy
- ALL-CAPS emphasis works well for GPT models
- More explicit structural formatting
- Direct commands over explanatory reasoning
- Reference the GPT prompting guide for specific techniques

### Identical Operational Facts

Both stacks must contain identical:
- Channel IDs, project IDs, file paths
- Security rules, data classification, cron standards
- Learned preferences and workflow triggers
- Contact information and team details
- Tool configurations

Only the formatting and style should differ.

### Automated Nightly Sync Review

Create a sync script (run at 3:30 AM as part of nightly crons):

1. **File coverage check:** Every file in one stack must exist in the other
2. **Operational fact diff:** Extract channel IDs, rules, paths from both stacks and compare
3. **Content drift detection:** Look for cases where one stack was updated but the other wasn't
4. **Report discrepancies** to monitoring channel with specific file:line references
5. If drift detected → alert in morning daily brief with "Fix it" as the suggested action

This catches the common bug: "I updated the Slack channel ID in the Claude prompts but forgot the GPT prompts."

### Model Swap Procedure

When switching active models:

1. Update framework config to point to the new model
2. Promote the secondary stack's folder to root
3. Move the current root files to the secondary folder
4. Restart the gateway/server
5. Verify with a canary message: send a structured test prompt and check response metadata
6. If metadata shows the wrong provider, auth failed and fallback kicked in
7. Update all references (TOOLS.md, config files) to reflect the active model

The swap should be a single command: `swap-model` — and the agent handles everything.
