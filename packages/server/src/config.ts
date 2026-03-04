import { homedir } from "os";
import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";

export const PORT = parseInt(process.env.LOBSTER_PORT || "3333", 10);
export const COMMAND_TIMEOUT_MS = 5000;

export const OC_HOME = join(homedir(), ".openclaw");
export const OC_CONFIG = join(OC_HOME, "openclaw.json");
export const OC_GATEWAY_PORT = parseInt(process.env.OC_GATEWAY_PORT || "18789", 10);

export const DASHBOARD_STATE_DIR = join(OC_HOME, "dashboard");
export const DASHBOARD_CONFIG_FILE = join(DASHBOARD_STATE_DIR, "config.json");
export const DASHBOARD_REGISTRY_FILE = join(DASHBOARD_STATE_DIR, "registry.json");
export const DASHBOARD_ACTIONS_LOG = join(DASHBOARD_STATE_DIR, "dashboard-actions.log");

// deploy/ source directory inside the LobsterTank repo
const SERVER_SRC_DIR = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
export const DEPLOY_SOURCE = join(SERVER_SRC_DIR, "../../../deploy");
export const DEPLOY_SCRIPTS = join(DEPLOY_SOURCE, "scripts/core");
export const DEPLOY_CONFIG = join(DEPLOY_SOURCE, "config");

// Deployed locations on the host
export const BIN_DIR = join(homedir(), "bin");
export const DEPLOYED_CONFIG_DIR = join(OC_HOME, "deploy/config");
export const OC_LOGS_DIR = join(OC_HOME, "logs");
export const REGISTRY_FILE = join(homedir(), ".openclaw-registry.json");

export const CLIENT_DIST = join(SERVER_SRC_DIR, "../../client/dist");
export const REGISTERED_AUTOMATIONS_FILE = join(OC_HOME, "registered-automations.json");

const SCRIPT_METADATA_FILE = join(DASHBOARD_STATE_DIR, "script-metadata.json");

// --- Expected cron entries (from registered-automations.json only) ---

export interface CronEntryDef {
  script: string;
  match: string;
  schedule: string;
  command: string;
}

export async function getExpectedCronEntries(): Promise<CronEntryDef[]> {
  try {
    const raw = await readFile(REGISTERED_AUTOMATIONS_FILE, "utf-8");
    const reg = JSON.parse(raw);
    if (reg.automations && Array.isArray(reg.automations)) {
      return reg.automations.map((a: any) => ({
        script: a.script,
        match: a.match,
        schedule: a.schedule,
        command: a.command,
      }));
    }
  } catch {
    // File doesn't exist — no expected entries
  }
  return [];
}

export async function getRegisteredAutomations(): Promise<any[]> {
  try {
    const raw = await readFile(REGISTERED_AUTOMATIONS_FILE, "utf-8");
    const reg = JSON.parse(raw);
    return reg.automations || [];
  } catch {
    return [];
  }
}

// --- Crontab PATH line (discovered, not hardcoded) ---

export async function getCrontabPathLine(): Promise<string> {
  try {
    const { safeExec } = await import("./lib/exec.js");
    const result = await safeExec("crontab", ["-l"]);
    if (result.exitCode === 0) {
      const pathLine = result.stdout.split("\n").find((l) => l.startsWith("PATH="));
      if (pathLine) return pathLine;
    }
  } catch {}
  // Build from current process PATH
  const envPath = process.env.PATH || "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
  return `PATH=${envPath}`;
}

// --- Script metadata (from dashboard state file) ---

interface ScriptMeta {
  description?: string;
  logPattern?: string;
}

interface ScriptMetadataFile {
  scripts: Record<string, ScriptMeta>;
}

let metadataCache: ScriptMetadataFile | null = null;
let metadataCacheTime = 0;
const METADATA_CACHE_TTL = 10_000; // 10 seconds

async function loadScriptMetadata(): Promise<ScriptMetadataFile> {
  const now = Date.now();
  if (metadataCache && now - metadataCacheTime < METADATA_CACHE_TTL) {
    return metadataCache;
  }
  try {
    const raw = await readFile(SCRIPT_METADATA_FILE, "utf-8");
    metadataCache = JSON.parse(raw);
    metadataCacheTime = now;
    return metadataCache!;
  } catch {
    metadataCache = { scripts: {} };
    metadataCacheTime = now;
    return metadataCache;
  }
}

export async function getScriptLogMap(): Promise<Record<string, string | ((date: Date) => string)>> {
  const meta = await loadScriptMetadata();
  const map: Record<string, string | ((date: Date) => string)> = {};
  for (const [script, info] of Object.entries(meta.scripts)) {
    if (!info.logPattern) continue;
    if (info.logPattern.includes("YYYY")) {
      // Date-based pattern — return a function
      const pattern = info.logPattern;
      map[script] = (d: Date) =>
        pattern
          .replace("YYYY", String(d.getFullYear()))
          .replace("MM", String(d.getMonth() + 1).padStart(2, "0"))
          .replace("DD", String(d.getDate()).padStart(2, "0"));
    } else {
      map[script] = info.logPattern;
    }
  }
  return map;
}

export async function getScriptDescriptions(): Promise<Record<string, string>> {
  const meta = await loadScriptMetadata();
  const descs: Record<string, string> = {};
  for (const [script, info] of Object.entries(meta.scripts)) {
    if (info.description) descs[script] = info.description;
  }
  return descs;
}

export async function registerScriptMetadata(
  name: string,
  description: string,
  logPattern?: string,
): Promise<void> {
  const meta = await loadScriptMetadata();
  meta.scripts[name] = { description, logPattern };
  await mkdir(DASHBOARD_STATE_DIR, { recursive: true });
  await writeFile(SCRIPT_METADATA_FILE, JSON.stringify(meta, null, 2));
  // Invalidate cache
  metadataCache = meta;
  metadataCacheTime = Date.now();
}

export const ALLOWED_BINARIES = new Set([
  "ps",
  "lsof",
  "kill",
  "launchctl",
  "crontab",
  "ollama",
  "openclaw",
  "pgrep",
  "git",
  "shasum",
  "bash",
  "diff",
  "chmod",
  "cp",
  "mkdir",
]);
