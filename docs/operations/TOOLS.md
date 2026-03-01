# TOOLS.md - [AGENT_NAME] Local Notes

## Attribution

When leaving permanent text (comments, messages, notes), prefix with "[AGENT_EMOJI] [AGENT_NAME]:" unless asked to ghostwrite.

## Multi-Agent Team

| Agent | Project | Status |
|-------|---------|--------|
| [agent_1] | [PROJECT_1] | Active / Planned |
| [agent_2] | [PROJECT_2] | Active / Planned |
| [agent_3] | [PROJECT_3] | Active / Planned |
| [agent_4] | [PROJECT_4] | Active / Planned |

## Code Generation

- **Model:** OpenAI Codex (GPT-4 or code-optimized models)
- **API Key:** Configured (`OPENAI_API_KEY` in ~/.zprofile)
- **When to use:** All code writing, debugging, script generation

## News & Current Info

- **Model:** xAI Grok (real-time X/Twitter data)
- **API Key:** Configured (`XAI_API_KEY` in ~/.zprofile)
- **API Base:** `https://api.x.ai/v1` (OpenAI-compatible)
- **When to use:** News, current events, trending topics, real-time info

## Search

- **Brave Search** available via built-in `web_search` tool and MCP
- **API Key:** Configured (`BRAVE_API_KEY` in ~/.zprofile)

## Email Configuration

- **Account:** [AGENT_EMAIL]
- **Tool:** [Himalaya CLI / Python SMTP / Zapier MCP]
- **Default recipient:** [USER_EMAIL]

## API Key Setup

All API keys should be stored in `~/.zprofile` as environment variables. Never commit keys to git. Required keys for this agent:

```bash
# Add to ~/.zprofile
export OPENAI_API_KEY="your-key-here"
export XAI_API_KEY="your-key-here"
export BRAVE_API_KEY="your-key-here"
export GITHUB_TOKEN="your-token-here"
# Add any additional keys below
```

After adding keys, run `source ~/.zprofile` to load them into the current session.
