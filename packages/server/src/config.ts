import { homedir } from "os";
import { join } from "path";
import { readFile, writeFile, mkdir, readdir, stat as fsStat } from "fs/promises";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "fs";

export const PORT = parseInt(process.env.LOBSTER_PORT || "3333", 10);
export const COMMAND_TIMEOUT_MS = 5000;

/* ── Profile-dependent paths (mutable — updated by switchProfile) ── */

export let OC_HOME = join(homedir(), ".openclaw");
export let OC_CONFIG = join(OC_HOME, "openclaw.json");
export let OC_GATEWAY_PORT = parseInt(process.env.OC_GATEWAY_PORT || "18789", 10);

export let DASHBOARD_STATE_DIR = join(OC_HOME, "dashboard");
export let DASHBOARD_CONFIG_FILE = join(DASHBOARD_STATE_DIR, "config.json");
export let DASHBOARD_REGISTRY_FILE = join(DASHBOARD_STATE_DIR, "registry.json");
export let DASHBOARD_ACTIONS_LOG = join(DASHBOARD_STATE_DIR, "dashboard-actions.log");

// deploy/ source directory inside the Poseidon repo
const SERVER_SRC_DIR = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
export const DEPLOY_SOURCE = join(SERVER_SRC_DIR, "../../../deploy");
export const DEPLOY_SCRIPTS = join(DEPLOY_SOURCE, "scripts/core");
export const DEPLOY_CONFIG = join(DEPLOY_SOURCE, "config");

// Deployed locations on the host
export const BIN_DIR = join(homedir(), "bin");
export let DEPLOYED_CONFIG_DIR = join(OC_HOME, "deploy/config");
export let OC_LOGS_DIR = join(OC_HOME, "logs");
export const REGISTRY_FILE = join(homedir(), ".openclaw-registry.json");

export const CLIENT_DIST = join(SERVER_SRC_DIR, "../../client/dist");
let REGISTERED_AUTOMATIONS_FILE = join(OC_HOME, "registered-automations.json");

let SCRIPT_METADATA_FILE = join(DASHBOARD_STATE_DIR, "script-metadata.json");

/* ── Active profile tracking ── */

export let activeProfileName = "default";

export interface ProfileInfo {
  name: string;
  path: string;
  active: boolean;
  gatewayPort: number;
  hasConfig: boolean;
}

function readGatewayPort(configPath: string): number {
  try {
    const raw = readFileSync(configPath, "utf-8");
    const cfg = JSON.parse(raw);
    return cfg?.gateway?.port ?? 18789;
  } catch {
    return 18789;
  }
}

export function discoverProfiles(): ProfileInfo[] {
  const home = homedir();
  const profiles: ProfileInfo[] = [];
  try {
    const entries = readdirSync(home);
    for (const e of entries) {
      if (!e.startsWith(".openclaw")) continue;
      if (e.endsWith(".json") || e.endsWith(".bak")) continue; // skip registry files
      const full = join(home, e);
      try { if (!statSync(full).isDirectory()) continue; } catch { continue; }
      const name = e === ".openclaw" ? "default" : e.replace(".openclaw-", "");
      const configPath = join(full, "openclaw.json");
      let hasConfig = false;
      try { statSync(configPath); hasConfig = true; } catch {}
      profiles.push({
        name,
        path: full,
        active: full === OC_HOME,
        gatewayPort: hasConfig ? readGatewayPort(configPath) : 18789,
        hasConfig,
      });
    }
  } catch {}
  // Sort: active first, then alphabetical
  profiles.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return profiles;
}

/** Map URL slug to profile name: "openclaw" → "default", "openclaw-foo" → "foo" */
export function profileSlugToName(slug: string): string {
  return slug === "openclaw" ? "default" : slug.replace(/^openclaw-/, "");
}

/** Map profile name to URL slug: "default" → "openclaw", "foo" → "openclaw-foo" */
export function profileNameToSlug(name: string): string {
  return name === "default" ? "openclaw" : `openclaw-${name}`;
}

export function recomputePaths(home: string) {
  OC_HOME = home;
  OC_CONFIG = join(home, "openclaw.json");
  OC_GATEWAY_PORT = readGatewayPort(OC_CONFIG);
  DASHBOARD_STATE_DIR = join(home, "dashboard");
  DASHBOARD_CONFIG_FILE = join(DASHBOARD_STATE_DIR, "config.json");
  DASHBOARD_REGISTRY_FILE = join(DASHBOARD_STATE_DIR, "registry.json");
  DASHBOARD_ACTIONS_LOG = join(DASHBOARD_STATE_DIR, "dashboard-actions.log");
  DEPLOYED_CONFIG_DIR = join(home, "deploy/config");
  OC_LOGS_DIR = join(home, "logs");
  REGISTERED_AUTOMATIONS_FILE = join(home, "registered-automations.json");
  SCRIPT_METADATA_FILE = join(DASHBOARD_STATE_DIR, "script-metadata.json");
  // Invalidate metadata cache
  metadataCache = null;
  metadataCacheTime = 0;
}

/* ── Profile persistence ── */

const POSEIDON_STATE_DIR = join(homedir(), ".poseidon");
const PROFILE_STATE_FILE = join(POSEIDON_STATE_DIR, "active-profile.json");

function persistActiveProfile(name: string) {
  try {
    mkdirSync(POSEIDON_STATE_DIR, { recursive: true });
    writeFileSync(PROFILE_STATE_FILE, JSON.stringify({ active: name }));
  } catch {}
}

function restoreActiveProfile(): string | null {
  try {
    const raw = readFileSync(PROFILE_STATE_FILE, "utf-8");
    const data = JSON.parse(raw);
    return data?.active ?? null;
  } catch {
    return null;
  }
}

// Restore profile on startup
const savedProfile = restoreActiveProfile();
if (savedProfile && savedProfile !== "default") {
  const home = homedir();
  const dir = join(home, `.openclaw-${savedProfile}`);
  try {
    if (statSync(dir).isDirectory()) {
      recomputePaths(dir);
      activeProfileName = savedProfile;
    }
  } catch {}
}

export function switchProfile(name: string): ProfileInfo | null {
  const home = homedir();
  const dir = name === "default" ? join(home, ".openclaw") : join(home, `.openclaw-${name}`);
  try { if (!statSync(dir).isDirectory()) return null; } catch { return null; }
  recomputePaths(dir);
  activeProfileName = name;
  persistActiveProfile(name);
  return {
    name,
    path: dir,
    active: true,
    gatewayPort: OC_GATEWAY_PORT,
    hasConfig: true,
  };
}

// Legacy: still used by scheduler for logPattern lookup.
// Not used by the audit system (which now discovers patterns directly).
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
