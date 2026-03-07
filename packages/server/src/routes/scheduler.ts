import { Router } from "express";
import { join, basename } from "path";
import { homedir } from "os";
import { readFile, writeFile, unlink, stat } from "fs/promises";
import { tmpdir } from "os";
import type {
  ApiResponse,
  SchedulerCrontabEntry,
  SchedulerOcCron,
  SchedulerLaunchdEntry,
  SchedulerState,
} from "../types/index.js";
import { safeExec } from "../lib/exec.js";
import { readTextFile, listDir, fileStat } from "../lib/file-reader.js";
import { parsePlistFile } from "../lib/parse-plist.js";
import { logAction } from "../lib/action-logger.js";
import { extractHeredocs, extractPrompts, replaceHeredocContent } from "../lib/prompt-extractor.js";
import { saveFeedback, getFeedback, markFeedbackApplied, hashPrompt, type FeedbackEntry } from "../lib/feedback-store.js";
import { rewritePrompt } from "../lib/prompt-rewriter.js";
import { ensureGitRepo, snapshot, revertLast } from "../lib/git.js";
import {
  OC_HOME,
  OC_CONFIG,
  OC_LOGS_DIR,
  BIN_DIR,
  DASHBOARD_STATE_DIR,
  getScriptLogMap,
  getScriptDescriptions,
  getRegisteredAutomations,
} from "../config.js";
import {
  checkHelplessness,
  extractSessionIdPattern,
  extractAgentName,
  bumpSessionVersion,
  cleanAgentMemory,
  type HelplessnessResult,
} from "../lib/helplessness-detector.js";

export const schedulerRoutes = Router();

const LAUNCH_AGENTS_DIR = join(homedir(), "Library/LaunchAgents");

const SYSTEM_SCRIPTS = new Set([
  "rogue-watchdog.sh",
  "weekly-audit.sh",
  "daily-spend-check.sh",
  "ollama",
]);
const ROGUE_BREADCRUMB = join(OC_HOME, "ROGUE_SERVICE_BLOCKED.md");
const GATEWAY_LABEL = "ai.openclaw.gateway";

// --- Helplessness detection cache (5-min TTL) ---

const helplessnessCache = new Map<string, { result: HelplessnessResult; cachedAt: number }>();
const HELPLESSNESS_CACHE_TTL = 5 * 60 * 1000;

async function checkAndCacheHelplessness(scriptName: string): Promise<HelplessnessResult> {
  const cached = helplessnessCache.get(scriptName);
  if (cached && Date.now() - cached.cachedAt < HELPLESSNESS_CACHE_TTL) {
    return cached.result;
  }
  const result = await checkHelplessness(scriptName);
  helplessnessCache.set(scriptName, { result, cachedAt: Date.now() });
  return result;
}

function invalidateHelplessnessCache(scriptName?: string) {
  if (scriptName) {
    helplessnessCache.delete(scriptName);
  } else {
    helplessnessCache.clear();
  }
}

// --- Run history helpers ---

type RunStatus = "success" | "failure" | "skipped";
const SKIP_HISTORY_SCRIPTS = new Set(["rogue-watchdog.sh", "ollama"]);
const FAILURE_RE = /\bError:|ALERT:|\bfailed\b|timeout after \d|exit code [1-9]|All models failed/i;
const SUCCESS_RE = /POLL_RESULT: completed|exit code 0\b|Audit complete|Email sent|Activity detected/;
const SKIP_RE = /NO_MAIL: 0 unseen|Skipping |No activity\b|POLL_RESULT: NO\b|HEARTBEAT_OK/;

function classifyLogBlock(content: string): RunStatus {
  if (FAILURE_RE.test(content)) return "failure";
  if (SUCCESS_RE.test(content)) return "success";
  if (SKIP_RE.test(content)) return "skipped";
  return "success";
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Timestamp regexes for log lines:
//   ISO:     2026-03-04T09:10:01-07:00 ...
//   Bracket: [2026-03-04 06:00:01] ...
const ISO_TS_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2})\s/;
const BRACKET_TS_RE = /^\[(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})\]/;

function parseLineTimestamp(line: string): { raw: string; epoch: number } | null {
  const iso = line.match(ISO_TS_RE);
  if (iso) return { raw: iso[1], epoch: new Date(iso[1]).getTime() };
  const bracket = line.match(BRACKET_TS_RE);
  if (bracket) return { raw: bracket[1], epoch: new Date(bracket[1]).getTime() };
  return null;
}

/**
 * Split a log file into individual runs by detecting time gaps between
 * consecutive timestamped lines. A gap > 90 seconds indicates a new run.
 * Returns runs in chronological order, each with timestamp and content.
 */
function splitLogIntoRuns(content: string): { timestamp: string; content: string }[] {
  const lines = content.split("\n");
  const runs: { timestamp: string; lines: string[] }[] = [];
  let currentRun: { timestamp: string; lines: string[] } | null = null;
  let lastEpoch: number | null = null;

  for (const line of lines) {
    const ts = parseLineTimestamp(line);
    if (ts) {
      // Start a new run if gap > 90s or first timestamped line
      if (!currentRun || (lastEpoch !== null && ts.epoch - lastEpoch > 90_000)) {
        if (currentRun) runs.push(currentRun);
        currentRun = { timestamp: ts.raw, lines: [line] };
      } else {
        currentRun.lines.push(line);
      }
      lastEpoch = ts.epoch;
    } else if (currentRun) {
      // Continuation line (multi-line output from a run)
      currentRun.lines.push(line);
    }
  }
  if (currentRun) runs.push(currentRun);

  return runs.map((r) => ({ timestamp: r.timestamp, content: r.lines.join("\n") }));
}

async function scanDateBasedLogs(
  logFn: (d: Date) => string,
): Promise<{ timestamp: string; status: RunStatus }[]> {
  // Collect all runs across day files, newest days first
  const allRuns: { timestamp: string; status: RunStatus }[] = [];
  const today = new Date();
  for (let i = 0; i < 21 && allRuns.length < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const fileName = logFn(d);
    const logPath = join(OC_LOGS_DIR, fileName);
    if (!(await fileStat(logPath))) continue;
    const { data: content } = await readTextFile(logPath);
    if (!content?.trim()) continue;

    const runs = splitLogIntoRuns(content);
    if (runs.length === 0) continue;

    // Runs are chronological; classify each one
    const classified = runs.map((r) => ({ timestamp: r.timestamp, status: classifyLogBlock(r.content) }));

    // We iterate newest day first — prepend this day's runs so older days go to front
    allRuns.unshift(...classified);
  }
  // Return only the 7 most recent runs, in chronological order
  return allRuns.slice(-7);
}

async function parseAuditHistory(): Promise<{ timestamp: string; status: RunStatus }[]> {
  const logPath = join(OC_LOGS_DIR, "audit.log");
  const { data: content } = await readTextFile(logPath);
  if (!content?.trim()) return [];
  const sections = content.split(/^-{3,}$/m);
  const runs: { timestamp: string; status: RunStatus }[] = [];
  for (const section of sections) {
    const m = section.match(/Audit complete:\s*(\S+)/);
    if (!m) continue;
    runs.push({ timestamp: m[1], status: classifyLogBlock(section) });
  }
  return runs.slice(-7);
}

async function buildRunHistory(
  script: string,
  regLogPattern?: string | null,
): Promise<{ timestamp: string; status: RunStatus }[]> {
  if (SKIP_HISTORY_SCRIPTS.has(script)) return [];

  // 1. Registered automation logPattern (date-based)
  if (regLogPattern?.includes("YYYY")) {
    const fn = (d: Date) =>
      regLogPattern
        .replace("YYYY", String(d.getFullYear()))
        .replace("MM", String(d.getMonth() + 1).padStart(2, "0"))
        .replace("DD", String(d.getDate()).padStart(2, "0"));
    return scanDateBasedLogs(fn);
  }

  // 2. Script metadata log map (date-based or static)
  const logMap = await getScriptLogMap();
  const mapping = logMap[script];
  if (typeof mapping === "function") {
    return scanDateBasedLogs(mapping);
  }

  // 3. weekly-audit.sh has structured run markers
  if (script === "weekly-audit.sh") {
    return parseAuditHistory();
  }

  // 4. Other static logs — single latest status
  if (typeof mapping === "string") {
    const logPath = join(OC_LOGS_DIR, mapping);
    const { data: content } = await readTextFile(logPath);
    if (!content?.trim()) return [];
    const tsMatch = content.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:[+-]\d{2}:\d{2})?)/g);
    const ts = tsMatch ? tsMatch[tsMatch.length - 1] : new Date().toISOString();
    return [{ timestamp: ts, status: classifyLogBlock(content) }];
  }

  return [];
}

// --- Cost estimation helpers ---

const CRON_RUNS_DIR = join(OC_HOME, "cron/runs");

// Per-million-token pricing
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 0.25, output: 1.25 },
  "claude-opus-4-6": { input: 15.0, output: 75.0 },
};

function lookupPricing(model: string, provider: string): { input: number; output: number } | null {
  if (provider === "ollama") return { input: 0, output: 0 };
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.includes(key) || key.includes(model)) return pricing;
  }
  // Default to Sonnet pricing for unknown cloud models
  if (provider === "anthropic" || provider === "google") return { input: 3.0, output: 15.0 };
  return null;
}

// Maps cron/runs jobIds → crontab script names (populated from cron/runs data at runtime)
const JOB_SCRIPT_MAP: Record<string, string> = {};

// Estimated tokens for scripts without cron/runs data (populated from registered-automations.json at runtime)
const SCRIPT_COST_PROFILE: Record<string, { input: number; output: number; model: string } | null> = {};

interface ScriptCostData {
  costs: number[];
  totalWeekly: number;
  runsThisWeek: number;
}

async function parseCronRunCosts(): Promise<Map<string, ScriptCostData>> {
  const result = new Map<string, ScriptCostData>();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  try {
    const { entries: files } = await listDir(CRON_RUNS_DIR);
    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      const fullPath = join(CRON_RUNS_DIR, file);
      const { data: content } = await readTextFile(fullPath);
      if (!content) continue;

      for (const line of content.trim().split("\n")) {
        try {
          const rec = JSON.parse(line);
          if (rec.action !== "finished" || !rec.usage || rec.ts < weekAgo) continue;

          const script = JOB_SCRIPT_MAP[rec.jobId] ?? null;
          if (!script) continue;

          const pricing = lookupPricing(rec.model ?? "", rec.provider ?? "");
          if (!pricing) continue;

          const cost = (rec.usage.input_tokens * pricing.input + rec.usage.output_tokens * pricing.output) / 1_000_000;

          if (!result.has(script)) {
            result.set(script, { costs: [], totalWeekly: 0, runsThisWeek: 0 });
          }
          const entry = result.get(script)!;
          entry.costs.push(cost);
          entry.totalWeekly += cost;
          entry.runsThisWeek++;
        } catch {}
      }
    }
  } catch {}

  return result;
}

function buildCostEstimate(
  script: string,
  cronCosts: Map<string, ScriptCostData>,
  runsThisWeek: number,
): { lastRunCost: number | null; weeklyTotal: number | null; runsThisWeek: number } | null {
  // System scripts have no API cost
  if (SYSTEM_SCRIPTS.has(script)) return null;

  // Try actual data from cron/runs
  const actual = cronCosts.get(script);
  if (actual && actual.costs.length > 0) {
    return {
      lastRunCost: actual.costs[actual.costs.length - 1],
      weeklyTotal: actual.totalWeekly,
      runsThisWeek: actual.runsThisWeek,
    };
  }

  // Fall back to estimates
  const profile = SCRIPT_COST_PROFILE[script];
  if (!profile) return null;
  const pricing = MODEL_PRICING[profile.model];
  if (!pricing) return null;
  const perRun = (profile.input * pricing.input + profile.output * pricing.output) / 1_000_000;

  return {
    lastRunCost: perRun,
    weeklyTotal: runsThisWeek > 0 ? runsThisWeek * perRun : null,
    runsThisWeek,
  };
}

// --- Agent → Model resolution ---

interface AgentModelMap {
  [agentId: string]: { model: string; provider: string; isLocal: boolean };
}

let agentModelCache: AgentModelMap | null = null;
let agentModelCacheTime = 0;
const AGENT_MODEL_CACHE_TTL = 30_000;

async function loadAgentModelMap(): Promise<AgentModelMap> {
  const now = Date.now();
  if (agentModelCache && now - agentModelCacheTime < AGENT_MODEL_CACHE_TTL) {
    return agentModelCache;
  }
  const map: AgentModelMap = {};
  try {
    const raw = await readFile(OC_CONFIG, "utf-8");
    const config = JSON.parse(raw);
    const agents = config?.agents?.list ?? [];
    for (const agent of agents) {
      const primary = agent?.model?.primary;
      if (!primary || !agent.id) continue;
      const [provider, ...rest] = primary.split("/");
      const model = rest.join("/") || provider;
      map[agent.id] = {
        model,
        provider,
        isLocal: provider === "ollama",
      };
    }
  } catch {}
  agentModelCache = map;
  agentModelCacheTime = now;
  return map;
}

async function resolveModelForScript(
  script: string,
  scriptPath: string,
  regAgent?: string,
): Promise<{ model: string; provider: string; isLocal: boolean } | null> {
  const modelMap = await loadAgentModelMap();

  // 1. Try registered automation agent
  if (regAgent && modelMap[regAgent]) return modelMap[regAgent];

  // 2. Parse --agent flag from script content
  try {
    const content = await readFile(scriptPath, "utf-8");
    const m = content.match(/--agent\s+["']?([a-zA-Z0-9_-]+)/);
    if (m && modelMap[m[1]]) return modelMap[m[1]];
    const m2 = content.match(/AGENT_ID=["']([a-zA-Z0-9_-]+)["']/);
    if (m2 && modelMap[m2[1]]) return modelMap[m2[1]];
  } catch {}

  return null;
}

// --- Helpers ---

function extractScript(command: string): string {
  // Extract script name from a crontab command like ~/bin/foo.sh or /path/to/foo.sh
  const match = command.match(/[\w-]+\.sh/);
  return match ? match[0] : basename(command.split(/\s+/)[0]);
}

async function resolveLogFile(script: string): Promise<string | null> {
  const logMap = await getScriptLogMap();
  const mapping = logMap[script];
  if (!mapping) return null;
  if (typeof mapping === "function") return mapping(new Date());
  return mapping;
}

async function descriptionForEntry(script: string, command: string): Promise<string> {
  const descriptions = await getScriptDescriptions();
  const desc = descriptions[script];
  if (desc) return desc;
  // Try to extract description from quoted args in the cron command
  const quoted = command.match(/"([^"]+)"/);
  if (quoted) return quoted[1];
  // Ollama keepalive
  if (command.includes("ollama run")) {
    const model = command.match(/ollama run (\S+)/);
    return model ? `Keep ${model[1]} loaded in memory` : "Ollama model keepalive";
  }
  return script;
}

async function parseLastRun(logFileName: string | null): Promise<string | null> {
  if (!logFileName) return null;
  const logPath = join(OC_LOGS_DIR, logFileName);
  const { data } = await readTextFile(logPath);
  if (!data) return null;
  const lines = data.trim().split("\n");

  const TS_RE = /\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}/;
  const BRACKET_RE = /\[(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}[^\]]*)\]/;

  // Walk backwards from end looking for the most recent timestamp
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 50); i--) {
    const bracket = lines[i].match(BRACKET_RE);
    if (bracket) return bracket[1];
    const ts = lines[i].match(TS_RE);
    if (ts) return ts[0];
  }

  // Fallback: scan from beginning (date-based logs with LLM output at the end)
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const bracket = lines[i].match(BRACKET_RE);
    if (bracket) return bracket[1];
    const ts = lines[i].match(TS_RE);
    if (ts) return ts[0];
  }

  return null;
}

// --- GET / — combined scheduler state ---

schedulerRoutes.get("/", async (_req, res) => {
  try {
    const [crontabResult, ocCronResult, launchdResult] = await Promise.all([
      parseCrontab(),
      parseOcCrons(),
      parseLaunchd(),
    ]);

    // Compute budget roll-up
    const weeklyTotal = crontabResult.entries.reduce(
      (sum, e) => sum + (e.costEstimate?.weeklyTotal ?? 0), 0,
    );

    const state: SchedulerState = {
      crontab: crontabResult,
      ocCrons: ocCronResult,
      launchd: launchdResult,
      budgetSummary: {
        weeklyTotal,
        dailyAverage: weeklyTotal / 7,
        estimatedMonthly: (weeklyTotal / 7) * 30,
      },
    };

    const response: ApiResponse<SchedulerState> = {
      ok: true,
      data: state,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

async function parseCrontab() {
  const result = await safeExec("crontab", ["-l"]);
  const raw = result.exitCode === 0 ? result.stdout : "";
  const lines = raw.split("\n");

  // Build registration lookup map
  const automations = await getRegisteredAutomations();
  const regMap = new Map<string, (typeof automations)[number]>();
  for (const a of automations) {
    if (a.match) regMap.set(a.match, a);
    if (a.script && !regMap.has(a.script)) regMap.set(a.script, a);
  }

  // Parse actual cost data from cron/runs
  const cronCosts = await parseCronRunCosts();

  let pathLine: string | null = null;
  const entries: SchedulerCrontabEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Detect PATH line
    if (line.startsWith("PATH=")) {
      pathLine = line;
      continue;
    }

    // Skip pure comments that aren't commented-out cron lines
    const isPaused = line.startsWith("#");
    const content = isPaused ? line.replace(/^#\s*/, "") : line;

    // Must look like a cron schedule: 5 time fields or @keyword
    const cronPattern = /^(@\w+|[\d*,\/-]+\s+[\d*,\/-]+\s+[\d*,\/-]+\s+[\d*,\/-]+\s+[\d*,\/-]+)\s+(.+)$/;
    const match = content.match(cronPattern);
    if (!match) continue;

    const schedule = match[1];
    const command = match[2];
    const script = extractScript(command);
    const logFile = await resolveLogFile(script);
    const scriptPath = join(BIN_DIR, script);
    const scriptExists = script.endsWith(".sh") ? await fileStat(scriptPath) : true;

    let status: "active" | "paused" | "missing";
    if (isPaused) {
      status = "paused";
    } else if (!scriptExists) {
      status = "missing";
    } else {
      status = "active";
    }

    const lastRun = await parseLastRun(logFile);
    const category = SYSTEM_SCRIPTS.has(script) ? "system" as const : "agent" as const;
    const reg = regMap.get(script);
    const runHistory = await buildRunHistory(script, reg?.logPattern ?? null);

    // Count runs this week from runHistory
    const weekAgoStr = fmtDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const runsThisWeek = runHistory.filter((r) => r.timestamp >= weekAgoStr).length;

    // Detect if script has a heredoc prompt (for feedback UI)
    let hasPrompt = false;
    if (script.endsWith(".sh") && scriptExists) {
      const { data: scriptContent } = await readTextFile(scriptPath);
      if (scriptContent) {
        hasPrompt = extractPrompts(scriptContent).length > 0;
      }
    }

    // Helplessness detection for active agent scripts with prompts
    let helplessness: HelplessnessResult | null = null;
    if (hasPrompt && category === "agent" && status === "active") {
      try {
        helplessness = await checkAndCacheHelplessness(script);
      } catch {
        // Detection failure must not break scheduler
      }
    }

    // Resolve model for agent tasks
    let modelInfo: { model: string; provider: string; isLocal: boolean } | null = null;
    if (category === "agent") {
      modelInfo = await resolveModelForScript(script, scriptPath, reg?.agent);
      console.log(`[model-resolve] ${script} -> ${JSON.stringify(modelInfo)}`);
    }

    const entry: SchedulerCrontabEntry = {
      lineIndex: i,
      schedule,
      command,
      script,
      description: await descriptionForEntry(script, command),
      logFile,
      lastRun,
      status,
      category,
      scriptPath: scriptPath,
      runHistory,
      costEstimate: buildCostEstimate(script, cronCosts, runsThisWeek),
      hasPrompt,
      modelInfo,
      helplessness: helplessness?.detected ? {
        detected: true,
        agentName: helplessness.agentName,
        patterns: helplessness.patterns,
        recommendation: helplessness.recommendation,
      } : null,
    };

    if (category === "agent" && reg) {
      entry.registrationMeta = {
        agent: reg.agent ?? "",
        description: reg.description ?? "",
        pauseFile: reg.pauseFile ?? "",
        preCheck: reg.preCheck ?? "",
      };
    }

    entries.push(entry);
  }

  return { entries, pathLine, raw };
}

async function parseOcCrons(): Promise<{ entries: SchedulerOcCron[]; isEmpty: boolean }> {
  const result = await safeExec("openclaw", ["cron", "list"]);
  if (result.exitCode !== 0) {
    // If openclaw not available or cron list fails, treat as empty
    return { entries: [], isEmpty: true };
  }

  const lines = result.stdout.trim().split("\n").filter(Boolean);
  // Skip header line if present
  const dataLines = lines.length > 0 && lines[0].toLowerCase().includes("id") ? lines.slice(1) : lines;

  if (dataLines.length === 0 || (dataLines.length === 1 && dataLines[0].toLowerCase().includes("no "))) {
    return { entries: [], isEmpty: true };
  }

  const entries: SchedulerOcCron[] = dataLines.map((line, idx) => {
    const parts = line.trim().split(/\s+/);
    const id = parts[0] ?? String(idx);
    const schedule = parts.slice(1, 6).join(" ");
    const command = parts.slice(6).join(" ");
    return { id, schedule, command };
  });

  return { entries, isEmpty: entries.length === 0 };
}

async function parseLaunchd(): Promise<{
  entries: SchedulerLaunchdEntry[];
  breadcrumbExists: boolean;
}> {
  const breadcrumbExists = !!(await fileStat(ROGUE_BREADCRUMB));

  const result = await safeExec("launchctl", ["list"]);
  const lines = result.stdout.split("\n").slice(1).filter(Boolean);

  // Scan plist files
  const { entries: plistFiles } = await listDir(LAUNCH_AGENTS_DIR);
  const ocPlistFiles = plistFiles.filter(
    (f) => f.endsWith(".plist") && (f.includes("claw") || f.includes("oc") || f.includes("openclaw"))
  );

  const entries: SchedulerLaunchdEntry[] = [];
  const seenLabels = new Set<string>();

  // Parse running jobs that look OC-related
  for (const line of lines) {
    const parts = line.trim().split(/\t+/);
    if (parts.length < 3) continue;
    const label = parts[2];
    if (
      !label.toLowerCase().includes("claw") &&
      !label.toLowerCase().includes("openclaw") &&
      !label.toLowerCase().includes("ai.openclaw")
    )
      continue;

    seenLabels.add(label);
    entries.push({
      label,
      pid: parts[0] === "-" ? null : parseInt(parts[0], 10),
      status: parseInt(parts[1], 10) || 0,
      classification: classifyLaunchdJob(label),
    });
  }

  // Parse plist files for more detail
  for (const file of ocPlistFiles) {
    const fullPath = join(LAUNCH_AGENTS_DIR, file);
    const { data: plistData } = await parsePlistFile(fullPath);
    const label = plistData?.Label ?? file.replace(".plist", "");

    if (seenLabels.has(label)) {
      const existing = entries.find((e) => e.label === label);
      if (existing) existing.plistPath = fullPath;
      continue;
    }

    seenLabels.add(label);
    entries.push({
      label,
      pid: null,
      status: 0,
      plistPath: fullPath,
      classification: classifyLaunchdJob(label),
    });
  }

  return { entries, breadcrumbExists };
}

function classifyLaunchdJob(label: string): "protected" | "rogue" | "unknown" {
  if (label === GATEWAY_LABEL) return "protected";
  const lower = label.toLowerCase();
  if (lower.includes("ai.openclaw") || lower === "oc-gateway") return "protected";
  if (lower.includes("claw") || lower.includes("oc-")) return "rogue";
  return "unknown";
}

// --- POST /crontab/toggle ---

schedulerRoutes.post("/crontab/toggle", async (req, res) => {
  const { lineIndex, enabled } = req.body ?? {};
  if (typeof lineIndex !== "number" || typeof enabled !== "boolean") {
    res.status(400).json({ ok: false, error: "Invalid parameters", timestamp: new Date().toISOString() });
    return;
  }

  try {
    const result = await safeExec("crontab", ["-l"]);
    if (result.exitCode !== 0) {
      res.json({ ok: false, error: "Failed to read crontab", timestamp: new Date().toISOString() });
      return;
    }

    const lines = result.stdout.split("\n");
    if (lineIndex < 0 || lineIndex >= lines.length) {
      res.status(400).json({ ok: false, error: "Invalid line index", timestamp: new Date().toISOString() });
      return;
    }

    if (enabled) {
      // Uncomment: remove leading # (and optional space)
      lines[lineIndex] = lines[lineIndex].replace(/^#\s*/, "");
    } else {
      // Comment out
      if (!lines[lineIndex].startsWith("#")) {
        lines[lineIndex] = "# " + lines[lineIndex];
      }
    }

    const tmpFile = join(tmpdir(), `lobstertank-cron-${Date.now()}`);
    await writeFile(tmpFile, lines.join("\n"));
    const installResult = await safeExec("crontab", [tmpFile]);
    await unlink(tmpFile).catch(() => {});

    await logAction("CRONTAB_TOGGLE", `Line ${lineIndex} → ${enabled ? "enabled" : "disabled"}`);

    res.json({
      ok: installResult.exitCode === 0,
      data: { lineIndex, enabled },
      error: installResult.exitCode !== 0 ? installResult.stderr : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- POST /crontab/update-schedule ---

const SCHEDULE_RE = /^(@\w+|[\d*,\/-]+\s+[\d*,\/-]+\s+[\d*,\/-]+\s+[\d*,\/-]+\s+[\d*,\/-]+)$/;
const CRON_LINE_RE = /^(@\w+|[\d*,\/-]+\s+[\d*,\/-]+\s+[\d*,\/-]+\s+[\d*,\/-]+\s+[\d*,\/-]+)\s+(.+)$/;

schedulerRoutes.post("/crontab/update-schedule", async (req, res) => {
  const { lineIndex, schedule } = req.body ?? {};
  if (typeof lineIndex !== "number" || typeof schedule !== "string") {
    res.status(400).json({ ok: false, error: "Invalid parameters", timestamp: new Date().toISOString() });
    return;
  }

  if (!SCHEDULE_RE.test(schedule.trim())) {
    res.status(400).json({ ok: false, error: "Invalid cron schedule format", timestamp: new Date().toISOString() });
    return;
  }

  try {
    const result = await safeExec("crontab", ["-l"]);
    if (result.exitCode !== 0) {
      res.json({ ok: false, error: "Failed to read crontab", timestamp: new Date().toISOString() });
      return;
    }

    const lines = result.stdout.split("\n");
    if (lineIndex < 0 || lineIndex >= lines.length) {
      res.status(400).json({ ok: false, error: "Invalid line index", timestamp: new Date().toISOString() });
      return;
    }

    const rawLine = lines[lineIndex];
    const isPaused = rawLine.trimStart().startsWith("#");
    const content = isPaused ? rawLine.replace(/^(\s*)#\s*/, "$1") : rawLine;

    const match = content.match(CRON_LINE_RE);
    if (!match) {
      res.status(400).json({ ok: false, error: "Target line is not a cron entry", timestamp: new Date().toISOString() });
      return;
    }

    const command = match[2];
    const newLine = isPaused ? `# ${schedule.trim()} ${command}` : `${schedule.trim()} ${command}`;
    lines[lineIndex] = newLine;

    const tmpFile = join(tmpdir(), `lobstertank-cron-${Date.now()}`);
    await writeFile(tmpFile, lines.join("\n"));
    const installResult = await safeExec("crontab", [tmpFile]);
    await unlink(tmpFile).catch(() => {});

    await logAction("CRONTAB_UPDATE_SCHEDULE", `Line ${lineIndex}: schedule → ${schedule.trim()}`);

    res.json({
      ok: installResult.exitCode === 0,
      data: { lineIndex, schedule: schedule.trim() },
      error: installResult.exitCode !== 0 ? installResult.stderr : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- POST /oc-cron/remove ---

schedulerRoutes.post("/oc-cron/remove", async (req, res) => {
  const { id } = req.body ?? {};
  if (!id || typeof id !== "string") {
    res.status(400).json({ ok: false, error: "Invalid id", timestamp: new Date().toISOString() });
    return;
  }

  try {
    await logAction("OC_CRON_REMOVE", `ID: ${id}`);
    const result = await safeExec("openclaw", ["cron", "remove", id]);
    res.json({
      ok: result.exitCode === 0,
      data: { id, removed: result.exitCode === 0 },
      error: result.exitCode !== 0 ? result.stderr : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- POST /oc-cron/remove-all ---

schedulerRoutes.post("/oc-cron/remove-all", async (req, res) => {
  try {
    const listResult = await safeExec("openclaw", ["cron", "list"]);
    if (listResult.exitCode !== 0) {
      res.json({ ok: false, error: "Failed to list OC crons", timestamp: new Date().toISOString() });
      return;
    }

    const lines = listResult.stdout.trim().split("\n").filter(Boolean);
    const dataLines = lines.length > 0 && lines[0].toLowerCase().includes("id") ? lines.slice(1) : lines;
    const ids = dataLines
      .map((l) => l.trim().split(/\s+/)[0])
      .filter(Boolean);

    const results: { id: string; ok: boolean }[] = [];
    for (const id of ids) {
      const r = await safeExec("openclaw", ["cron", "remove", id]);
      results.push({ id, ok: r.exitCode === 0 });
    }

    await logAction("OC_CRON_REMOVE_ALL", `Removed ${results.filter((r) => r.ok).length}/${ids.length}`);

    res.json({
      ok: true,
      data: { results },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- POST /launchd/remove ---

schedulerRoutes.post("/launchd/remove", async (req, res) => {
  const { label } = req.body ?? {};
  if (!label || typeof label !== "string") {
    res.status(400).json({ ok: false, error: "Invalid label", timestamp: new Date().toISOString() });
    return;
  }

  if (label === GATEWAY_LABEL) {
    res.status(403).json({ ok: false, error: "Cannot remove protected gateway service", timestamp: new Date().toISOString() });
    return;
  }

  try {
    await logAction("SCHEDULER_LAUNCHD_REMOVE", `Label: ${label}`);

    // Remove from launchctl
    const result = await safeExec("launchctl", ["remove", label]);

    // Try to delete plist file
    const plistPath = join(LAUNCH_AGENTS_DIR, `${label}.plist`);
    await unlink(plistPath).catch(() => {});

    // Create breadcrumb
    const breadcrumbContent = `# Rogue Service Blocked\n\nService \`${label}\` was removed by LobsterTank on ${new Date().toISOString()}\n`;
    await writeFile(ROGUE_BREADCRUMB, breadcrumbContent);

    res.json({
      ok: result.exitCode === 0,
      data: { label, removed: result.exitCode === 0 },
      error: result.exitCode !== 0 ? result.stderr : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- POST /run-script ---

schedulerRoutes.post("/run-script", async (req, res) => {
  const { scriptName } = req.body ?? {};
  if (!scriptName || typeof scriptName !== "string") {
    res.status(400).json({ ok: false, error: "Invalid scriptName", timestamp: new Date().toISOString() });
    return;
  }

  // Only allow .sh files from BIN_DIR — no path traversal
  if (!scriptName.endsWith(".sh") || scriptName.includes("/") || scriptName.includes("..")) {
    res.status(400).json({ ok: false, error: "Invalid script name", timestamp: new Date().toISOString() });
    return;
  }

  const scriptPath = join(BIN_DIR, scriptName);
  const exists = await fileStat(scriptPath);
  if (!exists) {
    res.status(404).json({ ok: false, error: `Script not found: ${scriptName}`, timestamp: new Date().toISOString() });
    return;
  }

  try {
    await logAction("SCHEDULER_RUN_SCRIPT", `Manual run: ${scriptName}`);
    const result = await safeExec("bash", [scriptPath], { timeout: 120_000 });

    const output = (result.stdout + "\n" + result.stderr).trim();
    const truncated = output.length > 4000 ? output.slice(-4000) : output;

    res.json({
      ok: result.exitCode === 0,
      data: { scriptName, exitCode: result.exitCode, output: truncated },
      error: result.exitCode !== 0 ? `Exit code ${result.exitCode}` : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- GET /helplessness-check/:scriptName ---

schedulerRoutes.get("/helplessness-check/:scriptName", async (req, res) => {
  const { scriptName } = req.params;

  if (!scriptName.endsWith(".sh") || scriptName.includes("/") || scriptName.includes("..")) {
    res.status(400).json({ ok: false, error: "Invalid script name", timestamp: new Date().toISOString() });
    return;
  }

  try {
    const result = await checkAndCacheHelplessness(scriptName);
    res.json({ ok: true, data: result, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- POST /force-new-session/:scriptName ---

schedulerRoutes.post("/force-new-session/:scriptName", async (req, res) => {
  const { scriptName } = req.params;

  if (!scriptName.endsWith(".sh") || scriptName.includes("/") || scriptName.includes("..")) {
    res.status(400).json({ ok: false, error: "Invalid script name", timestamp: new Date().toISOString() });
    return;
  }

  try {
    const scriptPath = join(BIN_DIR, scriptName);
    const { data: content } = await readTextFile(scriptPath);
    if (!content) {
      res.json({ ok: false, error: "Script not found", timestamp: new Date().toISOString() });
      return;
    }

    const oldPattern = extractSessionIdPattern(content);
    if (!oldPattern) {
      res.json({ ok: false, error: "No --session-id found in script", timestamp: new Date().toISOString() });
      return;
    }

    const newPattern = bumpSessionVersion(oldPattern);

    // Step 1: Snapshot before changes
    await ensureGitRepo(BIN_DIR);
    await snapshot(BIN_DIR, `LobsterTank: pre-session-bump snapshot for ${scriptName}`);

    // Step 2: Bump session-id in script
    const updated = content.replace(
      new RegExp(`(--session-id\\s+["'])${oldPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(["'])`, "g"),
      `$1${newPattern}$2`,
    );
    await writeFile(scriptPath, updated);

    const commitSnap = await snapshot(BIN_DIR, `LobsterTank: bump session ${oldPattern} -> ${newPattern} in ${scriptName}`);

    // Step 3: Clean agent memory of stale limitation beliefs
    const agentName = extractAgentName(content);
    let memoryCleaned: { cleaned: boolean; removedPhrases: string[] } = { cleaned: false, removedPhrases: [] };
    if (agentName) {
      // Get the current helplessness patterns to know what to clean
      const cached = helplessnessCache.get(scriptName);
      const limitations = cached?.result.patterns.map((p) => p.claimedLimitation) ?? [];
      if (limitations.length > 0) {
        memoryCleaned = await cleanAgentMemory(agentName, limitations);
      }
    }

    // Step 4: Run the script to verify the fix
    let runResult: { exitCode: number; output: string } | null = null;
    try {
      const execResult = await safeExec("bash", [scriptPath], { timeout: 120_000 });
      const output = (execResult.stdout + "\n" + execResult.stderr).trim();
      runResult = {
        exitCode: execResult.exitCode,
        output: output.length > 4000 ? output.slice(-4000) : output,
      };
    } catch {
      // Run failure is non-fatal — session was already bumped
    }

    // Invalidate helplessness cache for this script
    invalidateHelplessnessCache(scriptName);

    await logAction("FORCE_NEW_SESSION", `${scriptName}: ${oldPattern} -> ${newPattern}, memory cleaned=${memoryCleaned.cleaned}, run exit=${runResult?.exitCode ?? "skipped"}`);

    res.json({
      ok: true,
      data: {
        oldSessionPattern: oldPattern,
        newSessionPattern: newPattern,
        commitHash: commitSnap?.hash ?? null,
        memoryCleaned: memoryCleaned.cleaned,
        removedPhrases: memoryCleaned.removedPhrases,
        runResult,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- GET /script/:scriptName/prompts --- (Phase 1, must precede generic /script/:scriptName)

schedulerRoutes.get("/script/:scriptName/prompts", async (req, res) => {
  const { scriptName } = req.params;

  if (!scriptName.endsWith(".sh") || scriptName.includes("/") || scriptName.includes("..")) {
    res.status(400).json({ ok: false, error: "Invalid script name", timestamp: new Date().toISOString() });
    return;
  }

  try {
    const scriptPath = join(BIN_DIR, scriptName);
    const { data: content } = await readTextFile(scriptPath);

    if (!content) {
      res.json({ ok: true, data: { prompts: [], heredocs: [] }, timestamp: new Date().toISOString() });
      return;
    }

    const heredocs = extractHeredocs(content);
    const prompts = heredocs.filter((b) => b.isPromptLikely);

    res.json({
      ok: true,
      data: { prompts, heredocs },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- POST /script/:scriptName/rewrite --- (Phase 4, must precede generic /script/:scriptName)

schedulerRoutes.post("/script/:scriptName/rewrite", async (req, res) => {
  const { scriptName } = req.params;
  const { suggestion, heredocId, lastOutput } = req.body ?? {};

  if (!scriptName.endsWith(".sh") || scriptName.includes("/") || scriptName.includes("..")) {
    res.status(400).json({ ok: false, error: "Invalid script name", timestamp: new Date().toISOString() });
    return;
  }

  if (!suggestion || typeof suggestion !== "string") {
    res.status(400).json({ ok: false, error: "Missing suggestion", timestamp: new Date().toISOString() });
    return;
  }

  try {
    const scriptPath = join(BIN_DIR, scriptName);
    const { data: content } = await readTextFile(scriptPath);

    if (!content) {
      res.json({ ok: false, error: "Script not found", timestamp: new Date().toISOString() });
      return;
    }

    const heredocs = extractHeredocs(content);
    const target = heredocId
      ? heredocs.find((b) => b.id === heredocId)
      : heredocs.find((b) => b.isPromptLikely);

    if (!target) {
      res.json({ ok: false, error: "No extractable prompt found", timestamp: new Date().toISOString() });
      return;
    }

    await logAction("PROMPT_REWRITE", `${scriptName}: heredoc ${target.id}`);

    // Gather feedback history for context
    const history = await getFeedback(scriptName);
    const recentHistory = history.slice(-5).map((h) => ({
      rating: h.rating,
      suggestion: h.suggestion,
      timestamp: h.timestamp,
    }));

    const result = await rewritePrompt(
      target.content,
      suggestion,
      scriptName,
      target.containsVariables,
      lastOutput ?? null,
      recentHistory,
    );

    res.json({
      ok: true,
      data: { ...result, heredocId: target.id },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- POST /script/:scriptName/apply-rewrite --- (Phase 5, must precede generic /script/:scriptName)

schedulerRoutes.post("/script/:scriptName/apply-rewrite", async (req, res) => {
  const { scriptName } = req.params;
  const { heredocId, newContent, feedbackId, changeDescription } = req.body ?? {};

  if (!scriptName.endsWith(".sh") || scriptName.includes("/") || scriptName.includes("..")) {
    res.status(400).json({ ok: false, error: "Invalid script name", timestamp: new Date().toISOString() });
    return;
  }

  if (!heredocId || !newContent) {
    res.status(400).json({ ok: false, error: "Missing heredocId or newContent", timestamp: new Date().toISOString() });
    return;
  }

  try {
    await ensureGitRepo(BIN_DIR);
    const snap = await snapshot(BIN_DIR, `LobsterTank: pre-rewrite snapshot for ${scriptName}`);

    const scriptPath = join(BIN_DIR, scriptName);
    const { data: content } = await readTextFile(scriptPath);

    if (!content) {
      res.json({ ok: false, error: "Script not found", timestamp: new Date().toISOString() });
      return;
    }

    const modified = replaceHeredocContent(content, heredocId, newContent);
    await writeFile(scriptPath, modified);

    const desc = changeDescription ?? "prompt edit";
    const commitSnap = await snapshot(BIN_DIR, `LobsterTank: ${desc} in ${scriptName}`);

    if (feedbackId) {
      await markFeedbackApplied(scriptName, feedbackId, commitSnap?.hash ?? null, desc);
    }

    invalidateHelplessnessCache(scriptName);
    await logAction("PROMPT_APPLY_REWRITE", `${scriptName}: heredoc ${heredocId}, commit ${commitSnap?.hash ?? "none"}`);

    res.json({
      ok: true,
      data: {
        applied: true,
        commitHash: commitSnap?.hash ?? null,
        preSnapshotHash: snap?.hash ?? null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- POST /script/:scriptName/revert-rewrite --- (Phase 5, must precede generic /script/:scriptName)

schedulerRoutes.post("/script/:scriptName/revert-rewrite", async (req, res) => {
  const { scriptName } = req.params;

  if (!scriptName.endsWith(".sh") || scriptName.includes("/") || scriptName.includes("..")) {
    res.status(400).json({ ok: false, error: "Invalid script name", timestamp: new Date().toISOString() });
    return;
  }

  try {
    const reverted = await revertLast(BIN_DIR);
    await logAction("PROMPT_REVERT_REWRITE", `${scriptName}: reverted=${reverted}`);

    res.json({
      ok: true,
      data: { reverted },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- GET /script/:scriptName ---

schedulerRoutes.get("/script/:scriptName", async (req, res) => {
  const { scriptName } = req.params;

  // Only allow .sh files from BIN_DIR
  if (!scriptName.endsWith(".sh") || scriptName.includes("/") || scriptName.includes("..")) {
    res.status(400).json({ ok: false, error: "Invalid script name", timestamp: new Date().toISOString() });
    return;
  }

  try {
    const scriptPath = join(BIN_DIR, scriptName);
    const { data: content } = await readTextFile(scriptPath);

    if (!content) {
      res.json({
        ok: true,
        data: { content: "# Script file not found", path: scriptPath },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.json({
      ok: true,
      data: { content, path: scriptPath },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- GET /logs/:scriptName ---

schedulerRoutes.get("/logs/:scriptName", async (req, res) => {
  const { scriptName } = req.params;
  const logMap = await getScriptLogMap();
  const mapping = logMap[scriptName];

  if (!mapping) {
    res.status(404).json({ ok: false, error: `No log mapping for ${scriptName}`, timestamp: new Date().toISOString() });
    return;
  }

  try {
    const logFileName = typeof mapping === "function" ? mapping(new Date()) : mapping;
    const logPath = join(OC_LOGS_DIR, logFileName);
    const { data: content } = await readTextFile(logPath);

    if (!content) {
      res.json({ ok: true, data: { content: "No log file found", lines: 0 }, timestamp: new Date().toISOString() });
      return;
    }

    const allLines = content.split("\n");
    const last50 = allLines.slice(-50).join("\n");

    res.json({
      ok: true,
      data: { content: last50, lines: allLines.length },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- POST /feedback --- (Phase 2)

schedulerRoutes.post("/feedback", async (req, res) => {
  const { scriptName, rating, suggestion, promptHash: ph, heredocId, lastOutputSnippet } = req.body ?? {};

  if (!scriptName || typeof scriptName !== "string") {
    res.status(400).json({ ok: false, error: "Missing scriptName", timestamp: new Date().toISOString() });
    return;
  }
  if (rating !== "up" && rating !== "down") {
    res.status(400).json({ ok: false, error: "Invalid rating", timestamp: new Date().toISOString() });
    return;
  }

  try {
    const entry: FeedbackEntry = {
      id: `fb-${Date.now()}`,
      scriptName,
      timestamp: new Date().toISOString(),
      rating,
      suggestion: suggestion ?? null,
      lastOutputSnippet: typeof lastOutputSnippet === "string" ? lastOutputSnippet.slice(0, 500) : null,
      promptHash: ph ?? "",
      heredocId: heredocId ?? null,
      applied: false,
      rewriteSnapshot: null,
      changeDescription: null,
    };

    await saveFeedback(entry);
    await logAction("FEEDBACK_SUBMIT", `${scriptName}: ${rating}${suggestion ? ` — ${suggestion.slice(0, 100)}` : ""}`);

    res.json({ ok: true, data: entry, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- GET /feedback-history --- All scripts feedback (must precede :scriptName)

schedulerRoutes.get("/feedback-history", async (_req, res) => {
  try {
    const { entries: files } = await listDir(join(DASHBOARD_STATE_DIR, "feedback"));
    const allFeedback: Record<string, any[]> = {};
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const scriptName = file.replace(".json", "");
      allFeedback[scriptName] = await getFeedback(scriptName);
    }
    res.json({ ok: true, data: allFeedback, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ ok: true, data: {}, timestamp: new Date().toISOString() });
  }
});

// --- GET /feedback/:scriptName --- (Phase 2)

schedulerRoutes.get("/feedback/:scriptName", async (req, res) => {
  const { scriptName } = req.params;

  try {
    const entries = await getFeedback(scriptName);
    res.json({ ok: true, data: entries, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- GET /feedback-diff/:commitHash --- Git diff for a feedback commit

schedulerRoutes.get("/feedback-diff/:commitHash", async (req, res) => {
  const { commitHash } = req.params;

  if (!/^[a-f0-9]{4,40}$/.test(commitHash)) {
    res.status(400).json({ ok: false, error: "Invalid commit hash", timestamp: new Date().toISOString() });
    return;
  }

  try {
    const { getDiff } = await import("../lib/git.js");
    const diff = await getDiff(BIN_DIR, `${commitHash}~1`);
    res.json({ ok: true, data: { diff }, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});
