import { homedir } from "os";
import { join } from "path";

export const PORT = 3333;
export const COMMAND_TIMEOUT_MS = 5000;

export const OC_HOME = join(homedir(), ".openclaw");
export const OC_CONFIG = join(OC_HOME, "openclaw.json");
export const OC_GATEWAY_PORT = 18789;

export const DASHBOARD_STATE_DIR = join(OC_HOME, "dashboard");
export const DASHBOARD_CONFIG_FILE = join(DASHBOARD_STATE_DIR, "config.json");
export const DASHBOARD_REGISTRY_FILE = join(DASHBOARD_STATE_DIR, "registry.json");
export const DASHBOARD_ACTIONS_LOG = join(DASHBOARD_STATE_DIR, "dashboard-actions.log");

// deploy/ source directory inside the LobsterTank repo
const SERVER_SRC_DIR = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
export const DEPLOY_SOURCE = join(SERVER_SRC_DIR, "../../../deploy");
export const DEPLOY_SCRIPTS = join(DEPLOY_SOURCE, "scripts");
export const DEPLOY_CONFIG = join(DEPLOY_SOURCE, "config");

// Deployed locations on the host
export const BIN_DIR = join(homedir(), "bin");
export const DEPLOYED_CONFIG_DIR = join(OC_HOME, "deploy/config");
export const OC_LOGS_DIR = join(OC_HOME, "logs");
export const REGISTRY_FILE = join(homedir(), ".openclaw-registry.json");

export const CLIENT_DIST = join(SERVER_SRC_DIR, "../../client/dist");

// Expected crontab entries for deployed scripts
// `match` is the unique substring used to detect each entry in the live crontab
export const EXPECTED_CRON_ENTRIES = [
  { script: "rogue-watchdog.sh", match: "rogue-watchdog.sh", schedule: "*/5 * * * *", command: "~/bin/rogue-watchdog.sh 2>/dev/null" },
  { script: "weekly-audit.sh", match: "weekly-audit.sh", schedule: "0 6 * * 1", command: "~/bin/weekly-audit.sh >> ~/.openclaw/logs/audit.log 2>&1" },
  { script: "daily-spend-check.sh", match: "daily-spend-check.sh", schedule: "0 18 * * 1-5", command: "~/bin/daily-spend-check.sh personal 10.00 >> ~/.openclaw/logs/spend.log 2>&1" },
  { script: "bee-email-check.sh", match: "bee-email-check.sh", schedule: "*/15 * * * *", command: "~/bin/bee-email-check.sh 2>/dev/null" },
  { script: "openclaw-portfolio-wrapper.sh", match: "openclaw-portfolio-wrapper.sh", schedule: "0 6,15 * * 1-5", command: "~/bin/openclaw-portfolio-wrapper.sh >> ~/.openclaw/logs/portfolio-$(date +\\%Y-\\%m-\\%d).log 2>&1" },
  { script: "github-morning-check.sh", match: "github-morning-check.sh", schedule: "15 9 * * 1-5", command: '~/bin/github-morning-check.sh >> ~/.openclaw/logs/github-check-$(date +\\%Y-\\%m-\\%d).log 2>&1' },
  { script: "ollama", match: "ollama run qwen3", schedule: "@reboot", command: '/opt/homebrew/bin/ollama run qwen3:14b --keepalive -1s <<< "/bye"' },
];

export const CRONTAB_PATH_LINE = "PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

// Script name → log file path. Functions produce date-based filenames.
export const SCRIPT_LOG_MAP: Record<string, string | ((date: Date) => string)> = {
  "rogue-watchdog.sh": "audit.log",
  "weekly-audit.sh": "audit.log",
  "daily-spend-check.sh": "spend.log",
  "bee-email-check.sh": (d: Date) =>
    `cron-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.log`,
  "openclaw-portfolio-wrapper.sh": (d: Date) =>
    `portfolio-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.log`,
  "github-morning-check.sh": (d: Date) =>
    `github-check-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.log`,
  "sync-rules.sh": "sync-operations.log",
};

// Script name → human-readable description (wrapper/ollama descriptions parsed at runtime from args)
export const SCRIPT_DESCRIPTIONS: Record<string, string> = {
  "rogue-watchdog.sh": "Monitors for unauthorized OC processes",
  "weekly-audit.sh": "Weekly security and config audit",
  "daily-spend-check.sh": "Daily API spend threshold check",
  "bee-email-check.sh": "Lightweight email check (himalaya IMAP pre-gate)",
  "openclaw-portfolio-wrapper.sh": "Portfolio analysis job",
  "github-morning-check.sh": "GitHub activity scanner (API pre-gate, spawns Beehive on activity)",
  "sync-rules.sh": "Syncs config rules to deployed location",
};

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
