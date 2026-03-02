import { Router } from "express";
import type { ApiResponse, ModelSpendEntry, DailyModelSpend, ModelSpendResponse } from "../types/index.js";
import { readJsonFile, readTextFile, listDir } from "../lib/file-reader.js";
import { safeExec } from "../lib/exec.js";
import { OC_CONFIG, OC_LOGS_DIR } from "../config.js";

export const spendByModelRoutes = Router();

// ── Pricing per million tokens ──────────────────────────
const PRICING: Record<string, { input: number; output: number }> = {
  "sonnet-4-5": { input: 3.0, output: 15.0 },
  "sonnet-4-6": { input: 3.0, output: 15.0 },
  "haiku-4-5":  { input: 0.25, output: 1.25 },
  "haiku-4-6":  { input: 0.25, output: 1.25 },
  "opus-4-5":   { input: 15.0, output: 75.0 },
  "opus-4-6":   { input: 15.0, output: 75.0 },
};

const SONNET_PRICING = PRICING["sonnet-4-5"];

// ── Token estimates per invocation type ─────────────────
const TOKEN_ESTIMATES: Record<string, { input: number; output: number }> = {
  poller:    { input: 400,  output: 100 },
  processor: { input: 2000, output: 3000 },
  portfolio: { input: 3000, output: 5000 },
  default:   { input: 1500, output: 2000 },
};

// ── Helpers ─────────────────────────────────────────────

function normalizeModel(raw: string | undefined): string {
  if (!raw) return "unknown";
  let m = raw.toLowerCase().trim();
  m = m.replace(/^claude-/, "");
  // Handle provider/model format like "anthropic/sonnet-4-5"
  if (m.includes("/")) {
    const parts = m.split("/");
    m = parts[parts.length - 1];
  }
  return m;
}

function detectProvider(model: string, raw: string | undefined): string {
  if (!raw) return "anthropic";
  const lower = (raw ?? "").toLowerCase();
  if (lower.includes("ollama") || lower.includes("qwen") || lower.includes("llama") || lower.includes("mistral") || lower.includes("deepseek")) {
    return "ollama";
  }
  if (lower.includes("openai") || lower.includes("gpt")) return "openai";
  return "anthropic";
}

function isLocalModel(provider: string): boolean {
  return provider === "ollama";
}

function getPricing(model: string): { input: number; output: number } {
  if (PRICING[model]) return PRICING[model];
  // Fuzzy match: if model contains a known key
  for (const [key, price] of Object.entries(PRICING)) {
    if (model.includes(key)) return price;
  }
  // Default to sonnet pricing for unknown cloud models
  return SONNET_PRICING;
}

function computeCost(inputTokens: number, outputTokens: number, pricing: { input: number; output: number }): number {
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

function getInvocationType(agentId: string): string {
  const lower = agentId.toLowerCase();
  if (lower.includes("poll") || lower.includes("checker") || lower.includes("email-check")) return "poller";
  if (lower.includes("process") || lower.includes("handler") || lower.includes("responder")) return "processor";
  if (lower.includes("portfolio")) return "portfolio";
  return "default";
}

function getDateDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// ── Route ───────────────────────────────────────────────

spendByModelRoutes.get("/", async (_req, res) => {
  try {
    const last30dates = new Set<string>();
    for (let i = 0; i < 30; i++) {
      last30dates.add(getDateDaysAgo(i));
    }

    // Three concurrent data fetches
    const [agentConfigResult, logDirResult, ollamaResult] = await Promise.all([
      // 1. Agent config → model map
      readJsonFile<any>(OC_CONFIG),
      // 2. Cron log files list
      listDir(OC_LOGS_DIR),
      // 3. Ollama models
      safeExec("ollama", ["list"], { timeout: 5000 }).catch(() => ({
        stdout: "", stderr: "", exitCode: 1,
      })),
    ]);

    // ── Step 1: Build agent→model map ───────────────────
    const agentModelMap = new Map<string, { model: string; provider: string; raw: string }>();
    const ocConfig = agentConfigResult.data;
    if (ocConfig) {
      const agentList = ocConfig.agents?.list ?? [];
      const defaults = ocConfig.agents?.defaults ?? {};
      const defaultModel = defaults.model?.primary ?? "sonnet-4-5";

      for (const agent of agentList) {
        const rawModel = agent.model?.primary ?? defaultModel;
        const model = normalizeModel(rawModel);
        const provider = detectProvider(model, rawModel);
        agentModelMap.set(agent.id, { model, provider, raw: rawModel });
      }
    }

    // ── Step 2: Parse cron logs ─────────────────────────
    interface Invocation {
      agent: string;
      type: string;
      date: string;
    }
    const invocations: Invocation[] = [];

    const cronLogFiles = (logDirResult.entries ?? []).filter((f) => {
      const match = f.match(/^cron-(\d{4}-\d{2}-\d{2})\.log$/);
      return match && last30dates.has(match[1]);
    });

    // Read all matching log files in parallel
    const logContents = await Promise.all(
      cronLogFiles.map(async (filename) => {
        const dateMatch = filename.match(/^cron-(\d{4}-\d{2}-\d{2})\.log$/);
        const date = dateMatch ? dateMatch[1] : "";
        const { data } = await readTextFile(`${OC_LOGS_DIR}/${filename}`);
        return { date, content: data ?? "" };
      })
    );

    for (const { date, content } of logContents) {
      for (const line of content.split("\n")) {
        // RUNNING: <agent> -> <target>  (poller invocation)
        const runMatch = line.match(/RUNNING:\s+(\S+)\s*->/);
        if (runMatch) {
          invocations.push({ agent: runMatch[1], type: "poller", date });
          continue;
        }

        // MAIL_DETECTED: Handing off to <agent>  (processor invocation)
        const mailMatch = line.match(/MAIL_DETECTED:.*?(?:Handing off to|handing off to|hand off to)\s+(\S+)/i);
        if (mailMatch) {
          invocations.push({ agent: mailMatch[1], type: "processor", date });
          continue;
        }

        // Skip HIMALAYA_CHECK, POLL_RESULT, PROCESSOR_RESULT (zero-token or double-count)
      }
    }

    // Also check portfolio logs
    const portfolioLogFiles = (logDirResult.entries ?? []).filter((f) => {
      const match = f.match(/^portfolio-(\d{4}-\d{2}-\d{2})\.log$/);
      return match && last30dates.has(match[1]);
    });

    for (const filename of portfolioLogFiles) {
      const dateMatch = filename.match(/^portfolio-(\d{4}-\d{2}-\d{2})\.log$/);
      if (dateMatch) {
        // Each portfolio log file = one portfolio invocation that day
        // Find agents that do portfolio work
        const portfolioAgents = [...agentModelMap.entries()]
          .filter(([id]) => id.toLowerCase().includes("portfolio"))
          .map(([id]) => id);
        const agent = portfolioAgents[0] ?? "portfolio";
        invocations.push({ agent, type: "portfolio", date: dateMatch[1] });
      }
    }

    // ── Step 3: Ollama local models ─────────────────────
    const localModels: string[] = [];
    if (ollamaResult.exitCode === 0 && ollamaResult.stdout) {
      const lines = ollamaResult.stdout.trim().split("\n").slice(1); // skip header
      for (const line of lines) {
        const name = line.split(/\s+/)[0];
        if (name) localModels.push(name);
      }
    }

    // ── Accumulate per-model stats ──────────────────────
    const modelStats = new Map<string, ModelSpendEntry>();

    function getOrCreateModel(model: string, provider: string): ModelSpendEntry {
      if (!modelStats.has(model)) {
        modelStats.set(model, {
          model,
          provider,
          invocations: 0,
          estimatedInputTokens: 0,
          estimatedOutputTokens: 0,
          estimatedCost: 0,
          isLocal: isLocalModel(provider),
          agents: [],
        });
      }
      return modelStats.get(model)!;
    }

    // Daily tracking
    const dailyMap = new Map<string, Map<string, number>>(); // date -> (model -> cost)

    for (const inv of invocations) {
      const agentInfo = agentModelMap.get(inv.agent);
      const model = agentInfo?.model ?? "unknown";
      const provider = agentInfo?.provider ?? "anthropic";
      const entry = getOrCreateModel(model, provider);

      const tokens = TOKEN_ESTIMATES[inv.type] ?? TOKEN_ESTIMATES.default;
      entry.invocations++;
      entry.estimatedInputTokens += tokens.input;
      entry.estimatedOutputTokens += tokens.output;

      if (!entry.agents.includes(inv.agent)) {
        entry.agents.push(inv.agent);
      }

      const pricing = entry.isLocal ? { input: 0, output: 0 } : getPricing(model);
      const cost = computeCost(tokens.input, tokens.output, pricing);
      entry.estimatedCost += cost;

      // Daily accumulation
      if (!dailyMap.has(inv.date)) dailyMap.set(inv.date, new Map());
      const dayModels = dailyMap.get(inv.date)!;
      dayModels.set(model, (dayModels.get(model) ?? 0) + cost);
    }

    // Add local models from ollama that may not have invocations
    for (const localModel of localModels) {
      const normalized = normalizeModel(localModel);
      if (!modelStats.has(normalized)) {
        getOrCreateModel(normalized, "ollama");
      }
    }

    // ── Compute summaries ───────────────────────────────
    const models = [...modelStats.values()].sort((a, b) => b.estimatedCost - a.estimatedCost);
    const totalEstimatedCost = models.reduce((sum, m) => sum + m.estimatedCost, 0);

    // Local savings: what local model invocations would cost at sonnet pricing
    let localSavings = 0;
    for (const m of models) {
      if (m.isLocal) {
        localSavings += computeCost(m.estimatedInputTokens, m.estimatedOutputTokens, SONNET_PRICING);
      }
    }

    const activeModelCount = models.filter((m) => m.invocations > 0).length;
    const mostActiveModel = models.length > 0 && models[0].invocations > 0 ? models[0].model : "none";

    // Build daily array sorted by date
    const daily: DailyModelSpend[] = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, modelsMap]) => {
        const modelsObj: Record<string, number> = {};
        let total = 0;
        for (const [model, cost] of modelsMap) {
          modelsObj[model] = cost;
          total += cost;
        }
        return { date, models: modelsObj, total };
      });

    const responseData: ModelSpendResponse = {
      models,
      totalEstimatedCost,
      localSavings,
      activeModelCount,
      mostActiveModel,
      daily,
      lastUpdated: new Date().toISOString(),
    };

    const response: ApiResponse<ModelSpendResponse> = {
      ok: true,
      data: responseData,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (e: any) {
    const response: ApiResponse<ModelSpendResponse> = {
      ok: true,
      data: {
        models: [],
        totalEstimatedCost: 0,
        localSavings: 0,
        activeModelCount: 0,
        mostActiveModel: "none",
        daily: [],
        lastUpdated: new Date().toISOString(),
        error: e.message,
      },
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  }
});
