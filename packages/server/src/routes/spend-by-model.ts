import { Router } from "express";
import { join } from "path";
import type { ApiResponse, ModelSpendEntry, DailyModelSpend, ModelSpendResponse } from "../types/index.js";
import { readTextFile, listDir } from "../lib/file-reader.js";
import { safeExec } from "../lib/exec.js";
import { OC_HOME } from "../config.js";

export const spendByModelRoutes = Router();

const AGENTS_DIR = join(OC_HOME, "agents");

// ── Helpers ─────────────────────────────────────────────

const SONNET_PRICING = { input: 3.0, output: 15.0 }; // per million tokens

function detectProvider(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes("qwen") || lower.includes("llama") || lower.includes("mistral") || lower.includes("deepseek") || lower.includes("kimi") || lower.includes("minimax") || lower.includes("glm")) {
    return "ollama";
  }
  if (lower.includes("gpt") || lower.includes("o1") || lower.includes("o3") || lower.includes("o4")) return "openai";
  return "anthropic";
}

function isLocalProvider(provider: string): boolean {
  return provider === "ollama";
}

function computeCost(inputTokens: number, outputTokens: number, pricing: { input: number; output: number }): number {
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

function getLocalDate(isoTimestamp: string): string {
  // Convert UTC timestamp to local date string (YYYY-MM-DD)
  const d = new Date(isoTimestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getLocalDateDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Route ───────────────────────────────────────────────

spendByModelRoutes.get("/", async (_req, res) => {
  try {
    const cutoffDate = getLocalDateDaysAgo(7);

    // Discover all agent session directories
    const { entries: agentDirs } = await listDir(AGENTS_DIR);

    // Collect all session JSONL file paths
    const sessionFiles: { agent: string; path: string }[] = [];
    for (const agentName of agentDirs) {
      const sessDir = join(AGENTS_DIR, agentName, "sessions");
      const { entries: files } = await listDir(sessDir).catch(() => ({ entries: [] as string[] }));
      for (const f of files) {
        if (f.endsWith(".jsonl")) {
          sessionFiles.push({ agent: agentName, path: join(sessDir, f) });
        }
      }
    }

    // Parse all session files in parallel
    const modelStats = new Map<string, ModelSpendEntry>();
    const dailyMap = new Map<string, Map<string, number>>(); // date -> (model -> cost)

    function getOrCreate(model: string, provider: string): ModelSpendEntry {
      if (!modelStats.has(model)) {
        modelStats.set(model, {
          model,
          provider,
          invocations: 0,
          estimatedInputTokens: 0,
          estimatedOutputTokens: 0,
          estimatedCost: 0,
          isLocal: isLocalProvider(provider),
          agents: [],
        });
      }
      return modelStats.get(model)!;
    }

    const fileResults = await Promise.all(
      sessionFiles.map(async ({ agent, path: filePath }) => {
        const { data: content } = await readTextFile(filePath);
        if (!content) return [];

        const records: { agent: string; model: string; provider: string; date: string; cost: number; input: number; output: number; cacheRead: number; cacheWrite: number }[] = [];

        for (const line of content.split("\n")) {
          if (!line) continue;
          try {
            const rec = JSON.parse(line);
            const ts = rec.timestamp ?? "";
            if (!ts) continue;
            const localDate = getLocalDate(ts);
            if (localDate < cutoffDate) continue;

            const msg = rec.message;
            if (!msg || typeof msg !== "object") continue;

            const model = msg.model;
            const usage = msg.usage;
            if (!model || !usage) continue;

            const costObj = usage.cost;
            const totalCost = costObj?.total ?? 0;
            if (totalCost === 0 && usage.input === 0 && usage.output === 0) continue;

            records.push({
              agent,
              model,
              provider: msg.provider ?? detectProvider(model),
              date: localDate,
              cost: totalCost,
              input: usage.input ?? 0,
              output: usage.output ?? 0,
              cacheRead: usage.cacheRead ?? 0,
              cacheWrite: usage.cacheWrite ?? 0,
            });
          } catch {
            // Skip malformed lines
          }
        }
        return records;
      }),
    );

    // Aggregate
    for (const records of fileResults) {
      for (const r of records) {
        const entry = getOrCreate(r.model, r.provider);
        entry.invocations++;
        entry.estimatedInputTokens += r.input + r.cacheRead;
        entry.estimatedOutputTokens += r.output;
        entry.estimatedCost += r.cost;

        if (!entry.agents.includes(r.agent)) {
          entry.agents.push(r.agent);
        }

        // Daily accumulation
        if (!dailyMap.has(r.date)) dailyMap.set(r.date, new Map());
        const dayModels = dailyMap.get(r.date)!;
        dayModels.set(r.model, (dayModels.get(r.model) ?? 0) + r.cost);
      }
    }

    // Add local models from ollama that may not have invocations
    try {
      const ollamaResult = await safeExec("ollama", ["list"], { timeout: 5000 });
      if (ollamaResult.exitCode === 0 && ollamaResult.stdout) {
        const lines = ollamaResult.stdout.trim().split("\n").slice(1);
        for (const line of lines) {
          const name = line.split(/\s+/)[0];
          if (name && !modelStats.has(name)) {
            getOrCreate(name, "ollama");
          }
        }
      }
    } catch {}

    // ── Compute summaries ───────────────────────────────
    const models = [...modelStats.values()].sort((a, b) => b.estimatedCost - a.estimatedCost);
    const totalEstimatedCost = models.reduce((sum, m) => sum + m.estimatedCost, 0);

    // Local savings: what local model invocations would cost at sonnet pricing
    let localSavings = 0;
    for (const m of models) {
      if (m.isLocal && m.invocations > 0) {
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
