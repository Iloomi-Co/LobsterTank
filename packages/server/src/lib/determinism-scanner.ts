import { homedir } from "os";
import { join, basename, relative } from "path";
import { readTextFile, listDir, fileStat } from "./file-reader.js";
import { safeExec } from "./exec.js";
import { OC_HOME, DEPLOY_CONFIG } from "../config.js";
import { readJsonFile } from "./file-reader.js";

// --- Types ---

export type Severity = "high" | "medium" | "low" | "info";
export type Category =
  | "schedule-without-crontab"
  | "action-imperative"
  | "missing-safeguard"
  | "llm-spawning-cron"
  | "rogue-scheduling"
  | "conditional-logic";

export interface Finding {
  id: string;
  category: Category;
  severity: Severity;
  file: string | null;
  line: number | null;
  excerpt: string;
  context: string;
  suggestedAction: string;
  // Extra fields for specific categories
  hasCrontabMatch?: boolean;
  hasMechanismReference?: boolean;
  mechanismNote?: string;
  crontabEntry?: string;
  estimatedIdleCost?: string;
  missingRules?: string[];
  // Layer 2 enrichment (filled later)
  llmReview?: {
    isNonDeterministic: string;
    reasoning: string;
    suggestedRewrite: string | null;
    confidence: string;
  };
}

export interface ScanResult {
  scanTimestamp: string;
  target: string;
  workspacesScanned: string[];
  filesScanned: number;
  findings: Finding[];
  summary: { high: number; medium: number; low: number; info: number };
}

// --- Regex patterns ---

const CLOCK_TIME = /\d{1,2}:\d{2}\s*(AM|PM|MT|ET|CT|PT|UTC|am|pm)?/g;
const FREQUENCY_LANG = /every\s+\d+\s+(minute|hour|day|week)s?/gi;
const DAILY_WEEKLY = /\b(daily|weekly|hourly|nightly)\b/gi;
const CRON_LIKE = /\*\/\d+/g;
const DAY_RANGE = /\b(Mon-Fri|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|weekday|weekend)\b/gi;
const SCHEDULE_IMPERATIVE = /at\s+\d+.*[AP]M/gi;
const TWICE_A_DAY = /twice\s+(a\s+|per\s+)day/gi;

const ACTION_VERBS = /^[-*]\s*(Send|Compile|Check|Poll|Monitor|Scan|Run|Execute|Process|Draft|Deliver|Summarize|Report)\b/i;
const SCHEDULE_WORDS = /(daily|weekly|every|morning|evening|hourly|\d+:\d+)/i;
const MECHANISM_WORDS = /(crontab|cron|wrapper|script|triggered by|handled by|~\/bin\/|\.sh\b)/i;

const CONDITIONAL_PATTERNS = [
  /\bif\s+.*(then|,)\s*/i,
  /\bwhen\s+.*(new mail|no mail|inbox|unread|empty)/i,
  /\b(only if|unless|except when|skip if)\b/i,
];
const CONDITIONAL_ACTION = /(send|check|process|run|execute|compile|deliver|skip|start|spawn)/i;

// --- Workspace discovery ---

async function discoverWorkspaces(): Promise<{ name: string; path: string }[]> {
  const { entries } = await listDir(OC_HOME);
  const workspaces: { name: string; path: string }[] = [];

  for (const entry of entries) {
    if (!entry.startsWith("workspace")) continue;
    const fullPath = join(OC_HOME, entry);
    const stat = await fileStat(fullPath);
    if (stat?.isDirectory()) {
      const name = entry === "workspace" ? "chief" : entry.replace("workspace-", "");
      workspaces.push({ name, path: fullPath });
    }
  }

  return workspaces;
}

// --- Read all .md files in a workspace ---

async function readWorkspaceFiles(
  wsPath: string,
): Promise<{ path: string; content: string; lines: string[] }[]> {
  const { entries } = await listDir(wsPath);
  const mdFiles = entries.filter((f) => f.endsWith(".md"));
  const results: { path: string; content: string; lines: string[] }[] = [];

  for (const file of mdFiles) {
    const fullPath = join(wsPath, file);
    const { data } = await readTextFile(fullPath);
    if (data) {
      results.push({ path: fullPath, content: data, lines: data.split("\n") });
    }
  }

  return results;
}

// --- Get crontab lines ---

async function getCrontabLines(): Promise<string[]> {
  const result = await safeExec("crontab", ["-l"]);
  if (result.exitCode !== 0) return [];
  return result.stdout.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
}

// --- Category 1: Schedule language without matching crontab ---

function scanScheduleLanguage(
  file: { path: string; lines: string[] },
  crontabRaw: string,
  wsName: string,
): Finding[] {
  const findings: Finding[] = [];
  const displayPath = file.path.replace(homedir(), "~");

  for (let i = 0; i < file.lines.length; i++) {
    const line = file.lines[i];
    // Skip headings, code blocks, and blank lines
    if (line.startsWith("#") || line.startsWith("```") || !line.trim()) continue;

    const timeMatches = [
      ...line.matchAll(CLOCK_TIME),
      ...line.matchAll(FREQUENCY_LANG),
      ...line.matchAll(DAILY_WEEKLY),
      ...line.matchAll(CRON_LIKE),
      ...line.matchAll(DAY_RANGE),
      ...line.matchAll(SCHEDULE_IMPERATIVE),
      ...line.matchAll(TWICE_A_DAY),
    ];

    if (timeMatches.length === 0) continue;

    // Get surrounding paragraph for context (5 lines each way)
    const paraStart = Math.max(0, i - 5);
    const paraEnd = Math.min(file.lines.length, i + 5);
    const paragraph = file.lines.slice(paraStart, paraEnd).join("\n");

    const hasMech = MECHANISM_WORDS.test(paragraph);
    const hasAction = ACTION_VERBS.test(line) || /\b(send|compile|check|deliver)\b/i.test(line);

    // Check if any time reference in this line matches something in crontab
    const hasCrontabMatch = timeMatches.some((m) => {
      const val = m[0].trim();
      return crontabRaw.toLowerCase().includes(val.toLowerCase());
    });

    let severity: Severity;
    if (hasAction && !hasCrontabMatch && !hasMech) {
      severity = "high";
    } else if (!hasCrontabMatch && !hasMech) {
      severity = "medium";
    } else {
      severity = "info";
    }

    findings.push({
      id: "", // assigned later
      category: "schedule-without-crontab",
      severity,
      file: displayPath,
      line: i + 1,
      excerpt: line.trim().slice(0, 200),
      context: hasCrontabMatch
        ? "Time reference has matching crontab entry"
        : "No matching crontab entry found",
      hasCrontabMatch,
      hasMechanismReference: hasMech,
      mechanismNote: hasMech ? "Mechanism referenced in surrounding paragraph" : undefined,
      suggestedAction: hasCrontabMatch
        ? "Informational — crontab entry exists"
        : "Verify a crontab entry exists or rewrite as pure reference",
    });
  }

  return findings;
}

// --- Category 2: Action imperatives without trigger ---

function scanActionImperatives(
  file: { path: string; lines: string[] },
): Finding[] {
  const findings: Finding[] = [];
  const displayPath = file.path.replace(homedir(), "~");

  for (let i = 0; i < file.lines.length; i++) {
    const line = file.lines[i];
    if (!ACTION_VERBS.test(line)) continue;

    const paraStart = Math.max(0, i - 3);
    const paraEnd = Math.min(file.lines.length, i + 3);
    const paragraph = file.lines.slice(paraStart, paraEnd).join("\n");

    const hasSchedule = SCHEDULE_WORDS.test(paragraph);
    if (!hasSchedule) continue;

    const hasMech = MECHANISM_WORDS.test(paragraph);

    let severity: Severity;
    if (!hasMech) {
      severity = "high";
    } else if (/vague|should|could/i.test(paragraph)) {
      severity = "medium";
    } else {
      severity = "low";
    }

    findings.push({
      id: "",
      category: "action-imperative",
      severity,
      file: displayPath,
      line: i + 1,
      excerpt: line.trim().slice(0, 200),
      context: hasMech
        ? "Action imperative with mechanism reference"
        : "Action imperative with schedule language but no mechanism reference",
      hasMechanismReference: hasMech,
      suggestedAction: hasMech
        ? "Consider making mechanism reference more explicit"
        : "Rewrite as reference or create wrapper + cron entry",
    });
  }

  return findings;
}

// --- Category 3: Missing safeguard language ---

async function scanMissingSafeguards(
  workspaces: { name: string; path: string }[],
): Promise<Finding[]> {
  const findings: Finding[] = [];

  // Read sync manifest to know required rules
  const manifestPath = join(DEPLOY_CONFIG, "sync-manifest.json");
  const { data: manifest } = await readJsonFile<any>(manifestPath);
  if (!manifest) return findings;

  const rulesPath = join(DEPLOY_CONFIG, "agents-rules.json");
  const { data: rulesData } = await readJsonFile<any>(rulesPath);
  const ruleBlocks = rulesData?.ruleBlocks ?? [];

  for (const ws of workspaces) {
    const agentsPath = join(ws.path, "AGENTS.md");
    const { data: content } = await readTextFile(agentsPath);
    if (!content) continue;

    // Find this workspace's required rules from manifest
    const target = manifest.targets?.find(
      (t: any) => t.workspace === ws.name || t.path?.includes(ws.path),
    );
    const requiredRules: string[] = target?.requiredRules ?? ruleBlocks.map((r: any) => r.id);

    const missingRules: string[] = [];
    for (const ruleId of requiredRules) {
      const rule = ruleBlocks.find((r: any) => r.id === ruleId);
      if (!rule) continue;

      // Fix 4: Match sync-rules.sh behavior — check for section header first,
      // then validate keywords only if header exists
      const sectionHeader = `## ${rule.title}`;
      if (!content.includes(sectionHeader)) {
        missingRules.push(ruleId);
        continue;
      }

      // Section header exists — now check validation keywords
      const mustContain: string[] = rule.validation?.mustContain ?? [];
      const allPresent = mustContain.length === 0 || mustContain.every((s: string) =>
        content.toLowerCase().includes(s.toLowerCase()),
      );
      if (!allPresent) {
        missingRules.push(ruleId);
      }
    }

    if (missingRules.length === 0) continue;

    // Determine severity based on which rules are missing
    const criticalRules = ["scheduling-rules", "heartbeat-rules"];
    const hasCritical = missingRules.some((r) => criticalRules.includes(r));

    findings.push({
      id: "",
      category: "missing-safeguard",
      severity: hasCritical ? "high" : "medium",
      file: agentsPath.replace(homedir(), "~"),
      line: null,
      excerpt: `Missing rule blocks: ${missingRules.join(", ")}`,
      context: `${ws.name} workspace AGENTS.md is missing ${missingRules.length} required rule block(s)`,
      missingRules,
      suggestedAction: "Run Config Sync from the Audit & Deploy panel to add missing rules",
    });
  }

  return findings;
}

// --- Category 4: LLM-spawning cron entries ---

function scanLlmSpawningCrons(crontabLines: string[]): Finding[] {
  const findings: Finding[] = [];

  for (const line of crontabLines) {
    if (line.startsWith("PATH=") || line.startsWith("SHELL=")) continue;

    const spawnsLlm =
      line.includes("openclaw agent") ||
      line.includes("openclaw-agent-wrapper") ||
      line.includes("openclaw-portfolio-wrapper");

    if (!spawnsLlm) continue;

    // Parse schedule
    const parts = line.trim().split(/\s+/);
    const isReboot = parts[0] === "@reboot";
    const schedule = isReboot ? "@reboot" : parts.slice(0, 5).join(" ");

    // Check frequency
    const isHighFreq = schedule.startsWith("*/") && parseInt(schedule.split("/")[1]) <= 5;
    const isPollCheck = /poll|check|email|inbox|monitor/i.test(line);
    const isCompose = /compile|draft|analyze|report|portfolio/i.test(line);

    // Estimate cost for high-frequency entries
    let estimatedCost: string | undefined;
    if (isHighFreq) {
      // Roughly $0.09/hour for every-5-min LLM spawn
      estimatedCost = "$0.09/hour ($2.16/day)";
    }

    let severity: Severity;
    if (isHighFreq && isPollCheck && !isCompose) {
      severity = "high";
    } else if (isHighFreq) {
      severity = "medium";
    } else {
      severity = "info";
    }

    findings.push({
      id: "",
      category: "llm-spawning-cron",
      severity,
      file: null,
      line: null,
      excerpt: line.trim().slice(0, 200),
      context: isHighFreq
        ? `High-frequency (${schedule}) LLM spawn`
        : `LLM spawn on schedule: ${schedule}`,
      crontabEntry: line.trim(),
      estimatedIdleCost: estimatedCost,
      suggestedAction: severity === "high"
        ? "Add lightweight pre-check before LLM spawn"
        : severity === "medium"
          ? "Consider adding pre-check gate"
          : "Appropriately scheduled LLM task",
    });
  }

  return findings;
}

// --- Category 5: Rogue scheduling mechanisms ---

async function scanRogueScheduling(): Promise<Finding[]> {
  const findings: Finding[] = [];

  // OC internal crons
  const ocResult = await safeExec("openclaw", ["cron", "list"]);
  if (ocResult.exitCode === 0) {
    const lines = ocResult.stdout.trim().split("\n").filter(Boolean);
    const dataLines = lines.length > 0 && lines[0].toLowerCase().includes("id") ? lines.slice(1) : lines;
    const hasEntries = dataLines.length > 0 && !dataLines[0].toLowerCase().includes("no ");

    if (hasEntries) {
      findings.push({
        id: "",
        category: "rogue-scheduling",
        severity: "high",
        file: null,
        line: null,
        excerpt: `OC internal crons found: ${dataLines.length} entries`,
        context: "OC internal crons should always be empty. All scheduling belongs in crontab.",
        suggestedAction: "Remove all OC internal crons via Task Scheduler tab",
      });
    }
  }

  // Launchd (non-gateway)
  const launchResult = await safeExec("launchctl", ["list"]);
  if (launchResult.exitCode === 0) {
    const rogueLabels = launchResult.stdout
      .split("\n")
      .filter((l) => {
        const label = l.split("\t").pop()?.trim() ?? "";
        return (
          (label.includes("claw") || label.includes("openclaw")) &&
          label !== "ai.openclaw.gateway"
        );
      })
      .map((l) => l.split("\t").pop()?.trim() ?? "");

    for (const label of rogueLabels) {
      findings.push({
        id: "",
        category: "rogue-scheduling",
        severity: "high",
        file: null,
        line: null,
        excerpt: `Rogue launchd service: ${label}`,
        context: "Only ai.openclaw.gateway is allowed. All other OC services are unauthorized.",
        suggestedAction: "Remove via Task Scheduler tab",
      });
    }
  }

  return findings;
}

// --- AGENTS.md rule block section detection ---

// Build set of rule block titles from agents-rules.json at scan time
let _ruleBlockTitles: string[] | null = null;

async function getRuleBlockTitles(): Promise<string[]> {
  if (_ruleBlockTitles) return _ruleBlockTitles;
  const rulesPath = join(DEPLOY_CONFIG, "agents-rules.json");
  const { data } = await readJsonFile<any>(rulesPath);
  const titles: string[] = (data?.ruleBlocks ?? []).map((r: any) => r.title as string);
  _ruleBlockTitles = titles;
  return titles;
}

function isInsideRuleBlock(lines: string[], lineIndex: number, ruleBlockTitles: string[]): boolean {
  // Walk backwards to find the nearest ## heading
  for (let i = lineIndex; i >= 0; i--) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      const heading = line.slice(3).trim();
      return ruleBlockTitles.some((title) => heading.startsWith(title));
    }
  }
  return false;
}

// --- Category 6: Conditional logic in documents ---

function scanConditionalLogic(
  file: { path: string; lines: string[] },
  ruleBlockTitles: string[],
): Finding[] {
  const findings: Finding[] = [];
  const displayPath = file.path.replace(homedir(), "~");
  const fileName = basename(file.path);
  const isAgentsMd = fileName === "AGENTS.md";
  const isSoulMd = fileName === "SOUL.md";

  for (let i = 0; i < file.lines.length; i++) {
    const line = file.lines[i];
    if (!line.trim() || line.startsWith("#") || line.startsWith("```")) continue;

    const matchesConditional = CONDITIONAL_PATTERNS.some((p) => p.test(line));
    if (!matchesConditional) continue;

    // Fix 1: Skip content inside known rule block sections in AGENTS.md
    if (isAgentsMd && isInsideRuleBlock(file.lines, i, ruleBlockTitles)) {
      continue;
    }

    const hasAction = CONDITIONAL_ACTION.test(line);

    // Determine if this is behavioral guidance vs scriptable logic
    const isBehavioral = /tone|upset|angry|polite|feel|emotion|user asks|customer/i.test(line);
    const isScriptable = /mail|inbox|unread|count|threshold|spend|empty|fail/i.test(line);

    // Fix 3: Lines describing wrapper/script behavior are reference descriptions
    const isScriptReference = /himalaya|wrapper|script exits|script exit|watchdog|crontab triggers/i.test(line);

    let severity: Severity;
    if (isSoulMd || isScriptReference) {
      // Fix 2: SOUL.md conditional-logic → info (behavioral constraints requiring LLM judgment)
      // Fix 3: Script reference descriptions → info
      severity = "info";
    } else if (hasAction && isScriptable) {
      severity = "high";
    } else if (hasAction && !isBehavioral) {
      severity = "medium";
    } else {
      severity = "info";
    }

    const context = isSoulMd
      ? "Behavioral constraint in SOUL.md — requires LLM judgment at runtime"
      : isScriptReference
        ? "Reference description of script behavior — not an action instruction"
        : isScriptable
          ? "Conditional logic that could be a bash if-statement"
          : isBehavioral
            ? "Behavioral guidance that legitimately requires LLM judgment"
            : "Conditional logic in document";

    findings.push({
      id: "",
      category: "conditional-logic",
      severity,
      file: displayPath,
      line: i + 1,
      excerpt: line.trim().slice(0, 200),
      context,
      suggestedAction: severity === "high"
        ? "Move this logic into a wrapper script"
        : severity === "medium"
          ? "Consider whether this decision should be scripted"
          : "Acceptable — requires LLM judgment",
    });
  }

  return findings;
}

// --- Main scan function ---

export async function runDeterminismScan(): Promise<ScanResult> {
  _ruleBlockTitles = null; // Reset cache for fresh scan
  const workspaces = await discoverWorkspaces();

  // Read all workspace files
  const allFiles: { wsName: string; path: string; content: string; lines: string[] }[] = [];
  for (const ws of workspaces) {
    const files = await readWorkspaceFiles(ws.path);
    for (const f of files) {
      allFiles.push({ wsName: ws.name, ...f });
    }
  }

  // Get crontab
  const crontabLines = await getCrontabLines();
  const crontabRaw = crontabLines.join("\n");

  // Load rule block titles for AGENTS.md filtering
  const ruleBlockTitles = await getRuleBlockTitles();

  // Run all categories
  const allFindings: Finding[] = [];

  // Cat 1 & 2 & 6: Per-file scans
  for (const file of allFiles) {
    allFindings.push(...scanScheduleLanguage(file, crontabRaw, file.wsName));
    allFindings.push(...scanActionImperatives(file));
    allFindings.push(...scanConditionalLogic(file, ruleBlockTitles));
  }

  // Cat 3: Missing safeguards
  allFindings.push(...(await scanMissingSafeguards(workspaces)));

  // Cat 4: LLM-spawning crons
  allFindings.push(...scanLlmSpawningCrons(crontabLines));

  // Cat 5: Rogue scheduling
  allFindings.push(...(await scanRogueScheduling()));

  // Deduplicate: same file+line should only appear once (take highest severity)
  const seen = new Map<string, Finding>();
  for (const f of allFindings) {
    const key = `${f.file}:${f.line}:${f.category}`;
    const existing = seen.get(key);
    if (!existing || severityRank(f.severity) > severityRank(existing.severity)) {
      seen.set(key, f);
    }
  }
  const deduped = Array.from(seen.values());

  // Assign IDs and sort by severity
  deduped.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  deduped.forEach((f, i) => {
    f.id = `DET-${String(i + 1).padStart(3, "0")}`;
  });

  const summary = {
    high: deduped.filter((f) => f.severity === "high").length,
    medium: deduped.filter((f) => f.severity === "medium").length,
    low: deduped.filter((f) => f.severity === "low").length,
    info: deduped.filter((f) => f.severity === "info").length,
  };

  return {
    scanTimestamp: new Date().toISOString(),
    target: "~/.openclaw",
    workspacesScanned: workspaces.map((w) => w.name),
    filesScanned: allFiles.length,
    findings: deduped,
    summary,
  };
}

function severityRank(s: Severity): number {
  return { high: 3, medium: 2, low: 1, info: 0 }[s];
}

// --- Export formatter ---

export function formatExport(scan: ScanResult): string {
  const lines: string[] = [];

  lines.push("LobsterTank Determinism Audit");
  lines.push(`Scanned: ${scan.scanTimestamp}`);
  lines.push(`Target: ${scan.target}`);
  lines.push(`Workspaces: ${scan.workspacesScanned.join(", ")}`);
  lines.push(`Files scanned: ${scan.filesScanned}`);
  lines.push("");
  lines.push(
    `-- FINDINGS (${scan.summary.high} high, ${scan.summary.medium} medium, ${scan.summary.low} low, ${scan.summary.info} info) --`,
  );
  lines.push("");

  for (const f of scan.findings) {
    if (f.severity === "info") continue; // Skip info in export

    const tag = `[${f.severity.toUpperCase()}]`;
    const categoryLabel = categoryName(f.category);
    lines.push(`${tag} ${f.id}: ${categoryLabel}`);

    if (f.file) {
      lines.push(`  Source: ${f.file}${f.line ? ` line ${f.line}` : ""}`);
    }
    if (f.crontabEntry) {
      lines.push(`  Entry: ${f.crontabEntry}`);
    }
    lines.push(`  Text: "${f.excerpt}"`);
    lines.push(`  Problem: ${f.context}`);
    if (f.estimatedIdleCost) {
      lines.push(`  Cost: ${f.estimatedIdleCost}`);
    }
    lines.push(`  Fix: ${f.suggestedAction}`);

    if (f.llmReview) {
      lines.push(`  LLM Review: ${f.llmReview.isNonDeterministic === "yes" ? "NON-DETERMINISTIC" : "SAFE"}`);
      lines.push(`  ${f.llmReview.reasoning}`);
      if (f.llmReview.suggestedRewrite) {
        lines.push(`  Rewrite: ${f.llmReview.suggestedRewrite}`);
      }
    }

    lines.push("");
  }

  if (scan.summary.info > 0) {
    lines.push(`(${scan.summary.info} info-level findings omitted)`);
    lines.push("");
  }

  lines.push("Paste this into Claude or Cowork for review.");

  return lines.join("\n");
}

function categoryName(cat: Category): string {
  const map: Record<Category, string> = {
    "schedule-without-crontab": "Schedule Language Without Crontab",
    "action-imperative": "Action Imperative Without Trigger",
    "missing-safeguard": "Missing Safeguard Language",
    "llm-spawning-cron": "LLM-Spawning Cron",
    "rogue-scheduling": "Rogue Scheduling Mechanism",
    "conditional-logic": "Conditional Logic in Document",
  };
  return map[cat] ?? cat;
}

// --- Deep scan prompt builder ---

export function buildDeepScanPrompt(finding: Finding): string {
  const categoryLabel = categoryName(finding.category);
  return `You are auditing an OpenClaw agent workspace for non-deterministic patterns.

The architecture principle: LLMs should never decide IF or WHEN to act. That's handled by crontab and wrapper scripts. LLMs only act when spawned with a specific instruction.

Here is an excerpt${finding.file ? ` from ${finding.file}` : ""}:

---
${finding.excerpt}
---

This was flagged as: ${categoryLabel} / ${finding.severity}
Reason: ${finding.context}

Answer in this exact JSON format (no other text):
{
  "isNonDeterministic": "yes" or "no" or "maybe",
  "reasoning": "one sentence explanation",
  "suggestedRewrite": "rewritten text or null if safe",
  "confidence": "high" or "medium" or "low"
}`;
}
