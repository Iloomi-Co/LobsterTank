# LLM Router — Unified Model Calling Interface

Prompt this to your OpenClaw agent to build a centralized LLM router.

---

## Prompt: Build Unified LLM Router

Build a unified LLM calling interface that auto-routes to the correct provider, handles authentication, logs everything, and keeps security-critical paths isolated.

### Main LLM Wrapper

Create a shared module (`llm-router.js` or `llm_router.py`) that:

1. Resolves credentials automatically (OAuth tokens, API keys from .env)
2. Runs a smoke test on first use (canary prompt to verify response)
3. Wraps all calls with auto-retry (exponential backoff for rate limits, network errors)
4. Logs every call to the centralized interaction store
5. Supports prompt caching for repeated system prompts (reduces cost)

### Unified Router Interface

Single calling interface:
```
callLlm({
  model: "opus-4.6",      // or "gpt-5.2", "gemini-2", etc.
  prompt: "...",
  systemPrompt: "...",
  maxTokens: 4096,
  temperature: 0.7,
  cache: true              // enable prompt caching
})
```

- Auto-detect provider from model name (anthropic, openai, google, xai, etc.)
- Route to the appropriate SDK or API client
- Log input/output tokens, latency, cost estimate, and task type
- Handle fallback: if primary provider fails, try secondary

### Direct Provider Path (Security-Critical)

A separate module that calls provider APIs directly, bypassing the router. Used by:
- Security scanner (prompt injection defense)
- Content gates (outbound redaction verification)
- Any operation where the scanning context must be isolated from the agent's own context

This module resolves credentials independently and does not share context with the main router.

### Model Tiering

Define model tiers for cost optimization:

| Tier | When to Use | Examples |
|------|------------|---------|
| Frontier | Complex analysis, security scanning, important drafts | Opus 4.6 |
| Standard | Daily tasks, email drafting, CRM updates | Sonnet 4.6 |
| Fast | Simple classification, labeling, quick lookups | Haiku 4.6, GPT-4o-mini |
| Local | Embeddings, simple transformations | Nomic, local models |

Route tasks to the cheapest capable tier. Configure routing rules in `config/model-routing.json`.

### Cost Tracking Integration

Every call through the router automatically:
- Logs to the JSONL usage file
- Records in the interaction store database
- Estimates cost using per-model pricing data
- Tracks by task type (cron, coding, email, analysis, etc.)

### Model Utilities

- Provider detection from model name strings
- Model tier/capability extraction
- Name normalization across providers
- Token estimation from character count
