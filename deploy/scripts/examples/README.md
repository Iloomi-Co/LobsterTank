# Example Wrapper Scripts

These are example cron wrapper scripts from a real OpenClaw deployment.
They are NOT installed by LobsterTank — they are provided as templates
for writing your own automation scripts.

To register your own scripts with LobsterTank, use the automation
registry API: POST /api/scheduler/register

## Files
- openclaw-agent-wrapper.sh — Generic agent invocation wrapper with logging
- openclaw-agent-wrapper-v2.sh — Enhanced wrapper with pause/precheck gates
- openclaw-portfolio-wrapper.sh — Example scheduled analysis job
