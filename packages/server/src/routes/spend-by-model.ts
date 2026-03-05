import { Router } from "express";
import { join } from "path";
import type { ApiResponse, ModelSpendEntry, DailyModelSpend, ModelSpendResponse, DayDetailResponse, DayDetailHourly, DayDetailAgent, DayDetailModelStats } from "../types/index.js";
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

spendByModelRoutes.get("/", async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 7, 1), 90);
    const cutoffDate = getLocalDateDaysAgo(days);

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

    // Query ollama list for all installed local models
    const installedNames = new Set<string>(); // full names from ollama list
    const installedBases = new Set<string>(); // base names (without :tag)
    try {
      const listResult = await safeExec("ollama", ["list"], { timeout: 5000 });
      if (listResult.exitCode === 0 && listResult.stdout) {
        const lines = listResult.stdout.trim().split("\n").slice(1);
        for (const line of lines) {
          const name = line.split(/\s+/)[0];
          if (name) {
            installedNames.add(name);
            installedBases.add(name.split(":")[0]);
            // Also add models not yet seen (installed but no invocations)
            if (!modelStats.has(name)) {
              getOrCreate(name, "ollama");
            }
          }
        }
      }
    } catch {}

    function isInstalledLocally(model: string): boolean {
      if (installedNames.has(model)) return true;
      if (installedBases.has(model)) return true;
      if (installedBases.has(model.split(":")[0])) return true;
      return false;
    }

    // isLocal if the model is installed in ollama
    for (const entry of modelStats.values()) {
      if (entry.provider === "ollama" || isInstalledLocally(entry.model)) {
        entry.isLocal = true;
      }
    }

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

// ── Day Detail Route ─────────────────────────────────────

spendByModelRoutes.get("/day-detail/:date", async (req, res) => {
  try {
    const targetDate = req.params.date; // YYYY-MM-DD

    // Discover all agent session directories
    const { entries: agentDirs } = await listDir(AGENTS_DIR);

    // Collect all session JSONL file paths with sessionId extracted from filename
    const sessionFiles: { agent: string; sessionId: string; path: string }[] = [];
    for (const agentName of agentDirs) {
      const sessDir = join(AGENTS_DIR, agentName, "sessions");
      const { entries: files } = await listDir(sessDir).catch(() => ({ entries: [] as string[] }));
      for (const f of files) {
        if (f.endsWith(".jsonl")) {
          const sessionId = f.replace(/\.jsonl$/, "");
          sessionFiles.push({ agent: agentName, sessionId, path: join(sessDir, f) });
        }
      }
    }

    // Accumulators
    let totalCost = 0;
    let totalInvocations = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheRead = 0;
    let totalCacheWrite = 0;

    // hour -> { cost, invocations, models: { model -> cost } }
    const hourlyMap = new Map<number, { cost: number; invocations: number; models: Map<string, number> }>();
    // agent -> session -> { cost, invocations, inputTokens, outputTokens, models: Set, firstActivity, lastActivity }
    const agentMap = new Map<string, Map<string, {
      cost: number; invocations: number; inputTokens: number; outputTokens: number;
      models: Set<string>; firstActivity: string; lastActivity: string;
    }>>();
    // model -> { cost, invocations, inputTokens, outputTokens }
    const modelMap = new Map<string, { cost: number; invocations: number; inputTokens: number; outputTokens: number }>();

    await Promise.all(
      sessionFiles.map(async ({ agent, sessionId, path: filePath }) => {
        const { data: content } = await readTextFile(filePath);
        if (!content) return;

        const records: {
          agent: string; sessionId: string; model: string; ts: string; hour: number;
          cost: number; input: number; output: number; cacheRead: number; cacheWrite: number;
        }[] = [];

        for (const line of content.split("\n")) {
          if (!line) continue;
          try {
            const rec = JSON.parse(line);
            const ts = rec.timestamp ?? "";
            if (!ts) continue;
            const localDate = getLocalDate(ts);
            if (localDate !== targetDate) continue;

            const msg = rec.message;
            if (!msg || typeof msg !== "object") continue;

            const model = msg.model;
            const usage = msg.usage;
            if (!model || !usage) continue;

            const costObj = usage.cost;
            const cost = costObj?.total ?? 0;
            if (cost === 0 && usage.input === 0 && usage.output === 0) continue;

            const hour = new Date(ts).getHours();

            records.push({
              agent, sessionId, model, ts, hour, cost,
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
    ).then((allResults) => {
      for (const records of allResults) {
        if (!records) continue;
        for (const r of records) {
          totalCost += r.cost;
          totalInvocations++;
          totalInputTokens += r.input;
          totalOutputTokens += r.output;
          totalCacheRead += r.cacheRead;
          totalCacheWrite += r.cacheWrite;

          // Hourly
          if (!hourlyMap.has(r.hour)) {
            hourlyMap.set(r.hour, { cost: 0, invocations: 0, models: new Map() });
          }
          const h = hourlyMap.get(r.hour)!;
          h.cost += r.cost;
          h.invocations++;
          h.models.set(r.model, (h.models.get(r.model) ?? 0) + r.cost);

          // Agent → Session
          if (!agentMap.has(r.agent)) agentMap.set(r.agent, new Map());
          const sessions = agentMap.get(r.agent)!;
          if (!sessions.has(r.sessionId)) {
            sessions.set(r.sessionId, {
              cost: 0, invocations: 0, inputTokens: 0, outputTokens: 0,
              models: new Set(), firstActivity: r.ts, lastActivity: r.ts,
            });
          }
          const sess = sessions.get(r.sessionId)!;
          sess.cost += r.cost;
          sess.invocations++;
          sess.inputTokens += r.input + r.cacheRead;
          sess.outputTokens += r.output;
          sess.models.add(r.model);
          if (r.ts < sess.firstActivity) sess.firstActivity = r.ts;
          if (r.ts > sess.lastActivity) sess.lastActivity = r.ts;

          // Model
          if (!modelMap.has(r.model)) {
            modelMap.set(r.model, { cost: 0, invocations: 0, inputTokens: 0, outputTokens: 0 });
          }
          const m = modelMap.get(r.model)!;
          m.cost += r.cost;
          m.invocations++;
          m.inputTokens += r.input + r.cacheRead;
          m.outputTokens += r.output;
        }
      }
    });

    // Build hourly array (0-23)
    const hourly: DayDetailHourly[] = [];
    for (let i = 0; i < 24; i++) {
      const h = hourlyMap.get(i);
      if (h) {
        const models: Record<string, number> = {};
        for (const [m, c] of h.models) models[m] = c;
        hourly.push({ hour: i, cost: h.cost, invocations: h.invocations, models });
      } else {
        hourly.push({ hour: i, cost: 0, invocations: 0, models: {} });
      }
    }

    // Build agents array
    const agents: DayDetailAgent[] = [];
    for (const [name, sessions] of agentMap) {
      let agentCost = 0;
      let agentInvocations = 0;
      const sessionList = [];
      for (const [sessionId, s] of sessions) {
        agentCost += s.cost;
        agentInvocations += s.invocations;
        sessionList.push({
          sessionId,
          cost: s.cost,
          invocations: s.invocations,
          inputTokens: s.inputTokens,
          outputTokens: s.outputTokens,
          models: [...s.models],
          firstActivity: s.firstActivity,
          lastActivity: s.lastActivity,
        });
      }
      sessionList.sort((a, b) => b.cost - a.cost);
      agents.push({ name, cost: agentCost, invocations: agentInvocations, sessions: sessionList });
    }
    agents.sort((a, b) => b.cost - a.cost);

    // Build models record
    const models: Record<string, DayDetailModelStats> = {};
    for (const [name, stats] of modelMap) {
      models[name] = stats;
    }

    const data: DayDetailResponse = {
      date: targetDate,
      totalCost,
      totalInvocations,
      totalInputTokens,
      totalOutputTokens,
      totalCacheRead,
      totalCacheWrite,
      hourly,
      agents,
      models,
    };

    const response: ApiResponse<DayDetailResponse> = {
      ok: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (e: any) {
    const response: ApiResponse = {
      ok: false,
      error: e.message,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  }
});
