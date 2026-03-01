import { Router } from "express";
import { join, basename } from "path";
import { homedir } from "os";
import { writeFile, unlink, stat } from "fs/promises";
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
import {
  OC_HOME,
  OC_LOGS_DIR,
  BIN_DIR,
  CRONTAB_PATH_LINE,
  SCRIPT_LOG_MAP,
  SCRIPT_DESCRIPTIONS,
} from "../config.js";

export const schedulerRoutes = Router();

const LAUNCH_AGENTS_DIR = join(homedir(), "Library/LaunchAgents");
const ROGUE_BREADCRUMB = join(OC_HOME, "ROGUE_SERVICE_BLOCKED.md");
const GATEWAY_LABEL = "ai.openclaw.gateway";

// --- Helpers ---

function extractScript(command: string): string {
  // Extract script name from a crontab command like ~/bin/foo.sh or /path/to/foo.sh
  const match = command.match(/[\w-]+\.sh/);
  return match ? match[0] : basename(command.split(/\s+/)[0]);
}

function resolveLogFile(script: string): string | null {
  const mapping = SCRIPT_LOG_MAP[script];
  if (!mapping) return null;
  if (typeof mapping === "function") return mapping(new Date());
  return mapping;
}

function descriptionForEntry(script: string, command: string): string {
  const desc = SCRIPT_DESCRIPTIONS[script];
  if (desc) return desc;
  // Try to extract description from wrapper args (e.g. openclaw-agent-wrapper.sh <agent> <processor> "<desc>")
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
  // Walk backwards looking for a timestamp
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
    const ts = lines[i].match(/\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}/);
    if (ts) return ts[0];
    const bracket = lines[i].match(/\[(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}[^\]]*)\]/);
    if (bracket) return bracket[1];
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

    const state: SchedulerState = {
      crontab: crontabResult,
      ocCrons: ocCronResult,
      launchd: launchdResult,
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
    const logFile = resolveLogFile(script);
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

    entries.push({
      lineIndex: i,
      schedule,
      command,
      script,
      description: descriptionForEntry(script, command),
      logFile,
      lastRun,
      status,
    });
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
  const { lineIndex, enabled } = req.body;
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

// --- POST /crontab/edit ---

schedulerRoutes.post("/crontab/edit", async (req, res) => {
  const { content } = req.body;
  if (typeof content !== "string") {
    res.status(400).json({ ok: false, error: "Invalid content", timestamp: new Date().toISOString() });
    return;
  }

  try {
    const tmpFile = join(tmpdir(), `lobstertank-cron-${Date.now()}`);
    await writeFile(tmpFile, content);
    const result = await safeExec("crontab", [tmpFile]);
    await unlink(tmpFile).catch(() => {});

    await logAction("CRONTAB_EDIT", "Full crontab replaced");

    // Read back the installed crontab
    const readBack = await safeExec("crontab", ["-l"]);
    res.json({
      ok: result.exitCode === 0,
      data: { raw: readBack.stdout },
      error: result.exitCode !== 0 ? result.stderr : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- POST /oc-cron/remove ---

schedulerRoutes.post("/oc-cron/remove", async (req, res) => {
  const { id } = req.body;
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
  const { label } = req.body;
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

// --- GET /logs/:scriptName ---

schedulerRoutes.get("/logs/:scriptName", async (req, res) => {
  const { scriptName } = req.params;
  const mapping = SCRIPT_LOG_MAP[scriptName];

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
