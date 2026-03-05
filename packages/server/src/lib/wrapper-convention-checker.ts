// Pure function — no I/O. Receives script content and crontab text as strings.

export type CheckId =
  | "shebang"
  | "strict-mode"
  | "global-pause"
  | "per-task-pause"
  | "lockfile"
  | "logging"
  | "session-id"
  | "pre-check"
  | "heredoc-prompt";

export interface CheckResult {
  id: CheckId;
  label: string;
  passed: boolean;
  detail: string | null;
  agentOnly?: boolean;
  exempt?: boolean;
}

export type ScriptClassification = "agent-wrapper" | "infrastructure" | "utility";

export interface WrapperConventionReport {
  scriptName: string;
  classification: ScriptClassification;
  checks: CheckResult[];
  passCount: number;
  totalApplicable: number;
  agentName: string | null;
  schedule: string | null;
  hasCrontabEntry: boolean;
}

function classify(content: string): ScriptClassification {
  // Check for actual `openclaw agent` command invocation (not just mentions in comments).
  // Matches: `openclaw agent`, `$OPENCLAW agent`, `"$OPENCLAW" agent` at a word boundary
  // after a line start, pipe, semicolon, or $() — i.e. command position.
  const agentCmd = /(?:^|[|;&]\s*|`|\$\()(?:"\$OPENCLAW"|\$OPENCLAW|openclaw)\s+agent/m;
  if (agentCmd.test(content)) return "agent-wrapper";
  // Known infrastructure patterns
  if (/rogue[-_]watchdog|sync[-_]rules|weekly[-_]audit/i.test(content)) return "infrastructure";
  // If it has a cron-style structure but no agent invocation, it's infrastructure
  if (/\.cron-paused|LOCKFILE=/.test(content)) return "infrastructure";
  return "utility";
}

function extractAgentName(content: string): string | null {
  const m = content.match(/--agent\s+["']?([a-zA-Z0-9_-]+)/) ??
            content.match(/AGENT_ID="([a-zA-Z0-9_-]+)"/);
  return m?.[1] ?? null;
}

function extractScheduleFromCrontab(scriptName: string, crontabRaw: string): { schedule: string | null; found: boolean } {
  for (const line of crontabRaw.split("\n")) {
    if (!line.includes(scriptName)) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed.startsWith("PATH=") || trimmed.startsWith("SHELL=")) continue;

    if (trimmed.startsWith("@reboot")) {
      return { schedule: "@reboot", found: true };
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 6) {
      return { schedule: parts.slice(0, 5).join(" "), found: true };
    }
  }
  return { schedule: null, found: false };
}

export function checkWrapperConvention(
  scriptName: string,
  scriptContent: string,
  crontabRaw: string,
): WrapperConventionReport {
  const classification = classify(scriptContent);
  const isAgent = classification === "agent-wrapper";
  const agentName = isAgent ? extractAgentName(scriptContent) : null;
  const { schedule, found: hasCrontabEntry } = extractScheduleFromCrontab(scriptName, crontabRaw);

  const checks: CheckResult[] = [];

  // 1. shebang — all scripts
  checks.push({
    id: "shebang",
    label: "Shebang",
    passed: /^#!\/bin\/bash/.test(scriptContent),
    detail: null,
  });

  // 2. strict-mode — all scripts
  checks.push({
    id: "strict-mode",
    label: "Strict Mode",
    passed: /^set\s+-euo\s+pipefail$/m.test(scriptContent),
    detail: null,
  });

  // 3. global-pause — all scripts
  checks.push({
    id: "global-pause",
    label: "Global Pause",
    passed: /\.cron-paused/.test(scriptContent),
    detail: null,
  });

  // 4. per-task-pause — agent-only
  checks.push({
    id: "per-task-pause",
    label: "Per-Task Pause",
    passed: /PAUSEFILE|\.pause-[a-zA-Z0-9_-]+/.test(scriptContent),
    detail: null,
    agentOnly: true,
  });

  // 5. lockfile — agent-only, BOTH patterns must match
  const hasLockfileVar = /LOCKFILE=.*\.lock/.test(scriptContent);
  const hasLockfileTrap = /trap.*(?:LOCKFILE|\.lock|rm\s+-f)/.test(scriptContent);
  checks.push({
    id: "lockfile",
    label: "Lockfile",
    passed: hasLockfileVar && hasLockfileTrap,
    detail: !hasLockfileVar ? "Missing LOCKFILE= declaration" : !hasLockfileTrap ? "Missing trap cleanup" : null,
    agentOnly: true,
  });

  // 6. logging — all scripts
  checks.push({
    id: "logging",
    label: "Logging",
    passed: /(?:>>|[A-Z_]*LOG[A-Z_]*=).*\.openclaw\/logs/.test(scriptContent),
    detail: null,
  });

  // 7. session-id — agent-only
  checks.push({
    id: "session-id",
    label: "Session ID",
    passed: /--session-id\s+["']?[a-zA-Z0-9_-]+-/.test(scriptContent),
    detail: null,
    agentOnly: true,
  });

  // 8. pre-check — agent-only, must appear BEFORE openclaw agent line
  let preCheckPassed = false;
  if (isAgent) {
    const agentLineIdx = scriptContent.search(/(?:^|[|;&]\s*|`|\$\()(?:"\$OPENCLAW"|\$OPENCLAW|openclaw)\s+agent/m);
    if (agentLineIdx > 0) {
      const before = scriptContent.slice(0, agentLineIdx);
      preCheckPassed = /himalaya|curl\s+.*api|COUNT.*-eq\s+0|HAS_WORK|UNREAD/i.test(before);
    }
  }
  checks.push({
    id: "pre-check",
    label: "Pre-check",
    passed: preCheckPassed,
    detail: null,
    agentOnly: true,
  });

  // 9. heredoc-prompt — agent-only
  checks.push({
    id: "heredoc-prompt",
    label: "Heredoc Prompt",
    passed: /<<\s*['"]?[A-Z_]+['"]?$/m.test(scriptContent) || /--message\s+"[^"]{50,}"/.test(scriptContent),
    detail: null,
    agentOnly: true,
  });

  // Mark exemptions
  for (const check of checks) {
    if (check.id === "global-pause") {
      if (classification === "utility") check.exempt = true;
      if (/rogue[-_]watchdog|weekly[-_]audit|sync[-_]rules/i.test(scriptName)) check.exempt = true;
    }
    if (check.id === "logging") {
      if (classification === "utility") check.exempt = true;
      if (classification === "infrastructure" && !hasCrontabEntry && !check.passed) check.exempt = true;
      // Scripts with per-instance log paths (LOG_FILE= + >> usage but not .openclaw/logs)
      if (!check.passed && /LOG_FILE=/.test(scriptContent) && />>/.test(scriptContent)) check.exempt = true;
    }
    if (check.id === "pre-check" && isAgent) {
      // Scheduled reports (daily/weekly) don't need pre-check gates — only polling scripts do
      const isPolling = schedule && /^\*\/\d+/.test(schedule);
      if (!isPolling) check.exempt = true;
    }
  }

  // Count applicable checks (exclude exempt and non-applicable agent-only checks)
  const applicable = checks.filter((c) => !c.exempt && (!c.agentOnly || isAgent));
  const passCount = applicable.filter((c) => c.passed).length;

  return {
    scriptName,
    classification,
    checks,
    passCount,
    totalApplicable: applicable.length,
    agentName,
    schedule,
    hasCrontabEntry,
  };
}
