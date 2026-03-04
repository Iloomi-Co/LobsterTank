import { join } from "path";
import { writeFile } from "fs/promises";
import { readTextFile, fileStat } from "./file-reader.js";
import { getScriptLogMap, OC_HOME, BIN_DIR, OC_LOGS_DIR } from "../config.js";

// --- Types ---

export interface HelplessnessPattern {
  type: "repeated-failure" | "capability-mismatch" | "stale-session";
  claimedLimitation: string;
  actualCapability?: string;
  toolsmdLastModified?: string;
  firstFailure?: string;
  lastFailure?: string;
  occurrences: number;
}

export interface HelplessnessResult {
  detected: boolean;
  scriptName: string;
  agentName: string | null;
  patterns: HelplessnessPattern[];
  recommendation: string | null;
}

// --- Regex patterns ---

const FAILURE_PHRASES_RE =
  /\b(cannot|unable to|failed to|limitation|not supported|does not work|known issue|not possible|not available|doesn't support|can't|won't work)\b[^.\n]{0,120}/gi;

const AGENT_FLAG_RE = /--agent\s+["']?(\S+?)["']?(?:\s|$)/;
const SESSION_ID_RE = /--session-id\s+["']([^"']+)["']/;

// --- Helpers ---

export function extractAgentName(scriptContent: string): string | null {
  const match = scriptContent.match(AGENT_FLAG_RE);
  return match ? match[1] : null;
}

export function extractSessionIdPattern(scriptContent: string): string | null {
  const match = scriptContent.match(SESSION_ID_RE);
  return match ? match[1] : null;
}

export function bumpSessionVersion(sessionPattern: string): string {
  // If pattern ends with -vN, increment N
  const versionMatch = sessionPattern.match(/^(.*)-v(\d+)$/);
  if (versionMatch) {
    return `${versionMatch[1]}-v${parseInt(versionMatch[2], 10) + 1}`;
  }
  // Otherwise append -v2
  return `${sessionPattern}-v2`;
}

// Timestamp parsing for splitting runs (mirrors scheduler.ts splitLogIntoRuns)
const ISO_TS_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2})\s/;
const BRACKET_TS_RE = /^\[(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})\]/;

function parseLogTimestamp(line: string): number | null {
  const iso = line.match(ISO_TS_RE);
  if (iso) return new Date(iso[1]).getTime();
  const bracket = line.match(BRACKET_TS_RE);
  if (bracket) return new Date(bracket[1]).getTime();
  return null;
}

/** Split log into runs by >90s gaps between timestamped lines. */
function splitIntoRuns(content: string): string[] {
  const lines = content.split("\n");
  const runs: string[][] = [];
  let current: string[] = [];
  let lastEpoch: number | null = null;

  for (const line of lines) {
    const epoch = parseLogTimestamp(line);
    if (epoch !== null) {
      if (current.length > 0 && lastEpoch !== null && epoch - lastEpoch > 90_000) {
        runs.push(current);
        current = [];
      }
      lastEpoch = epoch;
    }
    current.push(line);
  }
  if (current.length > 0) runs.push(current);

  return runs.map((r) => r.join("\n"));
}

/** Check if a run block contains only "no-op" output (e.g., NO_MAIL: 0 unseen). */
const NOOP_RUN_RE = /^[\s\S]*NO_MAIL: 0 unseen[\s\S]*$/;

async function getTodayLogContent(scriptName: string): Promise<string | null> {
  const logMap = await getScriptLogMap();
  const mapping = logMap[scriptName];
  if (!mapping) return null;

  let fullContent: string | null = null;
  if (typeof mapping === "function") {
    const fileName = mapping(new Date());
    const logPath = join(OC_LOGS_DIR, fileName);
    const { data } = await readTextFile(logPath);
    fullContent = data;
  } else {
    const logPath = join(OC_LOGS_DIR, mapping);
    const { data } = await readTextFile(logPath);
    fullContent = data;
  }

  if (!fullContent) return null;

  // Split into individual runs and find the last non-trivial run.
  // If it has no failure phrases, there's no helplessness to detect.
  const runs = splitIntoRuns(fullContent);
  if (runs.length === 0) return null;

  // Walk backwards to find the last run that actually did something (not a no-op skip)
  let lastSubstantiveIndex = -1;
  for (let i = runs.length - 1; i >= 0; i--) {
    if (!NOOP_RUN_RE.test(runs[i])) {
      lastSubstantiveIndex = i;
      break;
    }
  }

  if (lastSubstantiveIndex < 0) return null; // All runs are no-ops, no helplessness

  // Check if the last substantive run actually succeeded.
  // A run that mentions a limitation but then resolves it (e.g., finds a workaround)
  // should not trigger helplessness detection.
  const lastRun = runs[lastSubstantiveIndex];
  const SUCCESS_IN_RUN_RE = /\bsent successfully\b|Response sent|✅.*Action Taken|completed successfully|exit code 0\b|Email sent/i;
  if (SUCCESS_IN_RUN_RE.test(lastRun)) {
    return null; // Last substantive run succeeded — no helplessness
  }

  // Only scan the last substantive run and any runs after it.
  return runs.slice(lastSubstantiveIndex).join("\n\n");
}

function findFailurePhrases(content: string): { phrase: string; line: string }[] {
  const results: { phrase: string; line: string }[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(FAILURE_PHRASES_RE.source, FAILURE_PHRASES_RE.flags);
  while ((match = re.exec(content)) !== null) {
    results.push({
      phrase: match[0].trim(),
      line: content.slice(Math.max(0, match.index - 40), match.index + match[0].length + 40).trim(),
    });
  }
  return results;
}

function extractTimestamp(line: string): string | null {
  const tsMatch = line.match(/(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}(?::\d{2})?)/);
  return tsMatch ? tsMatch[1] : null;
}

// --- Main detection ---

export async function checkHelplessness(scriptName: string): Promise<HelplessnessResult> {
  const result: HelplessnessResult = {
    detected: false,
    scriptName,
    agentName: null,
    patterns: [],
    recommendation: null,
  };

  // 1. Read script content
  const scriptPath = join(BIN_DIR, scriptName);
  const { data: scriptContent } = await readTextFile(scriptPath);
  if (!scriptContent) return result;

  const agentName = extractAgentName(scriptContent);
  result.agentName = agentName;

  // 2. Read today's log
  const logContent = await getTodayLogContent(scriptName);
  if (!logContent) return result;

  // --- Pattern 1: Repeated failures ---
  const failures = findFailurePhrases(logContent);
  if (failures.length >= 3) {
    // Group by normalized phrase to find repeated ones
    const phraseCounts = new Map<string, { count: number; first: string | null; last: string | null; raw: string }>();
    for (const f of failures) {
      const normalized = f.phrase.toLowerCase().replace(/\s+/g, " ").slice(0, 80);
      const existing = phraseCounts.get(normalized);
      const ts = extractTimestamp(f.line);
      if (existing) {
        existing.count++;
        if (ts) existing.last = ts;
      } else {
        phraseCounts.set(normalized, { count: 1, first: ts, last: ts, raw: f.phrase });
      }
    }

    for (const [, info] of phraseCounts) {
      if (info.count >= 3) {
        result.patterns.push({
          type: "repeated-failure",
          claimedLimitation: info.raw,
          firstFailure: info.first ?? undefined,
          lastFailure: info.last ?? undefined,
          occurrences: info.count,
        });
      }
    }
  }

  // --- Pattern 2: Capability mismatch ---
  if (agentName) {
    const toolsPath = join(OC_HOME, `workspace-${agentName}`, "TOOLS.md");
    const { data: toolsContent } = await readTextFile(toolsPath);

    if (toolsContent) {
      const toolsStat = await fileStat(toolsPath);
      const toolsMtime = toolsStat?.mtime?.toISOString() ?? undefined;

      // Check if any failure phrase references something documented in TOOLS.md
      for (const f of failures) {
        // Extract the capability keyword from the failure phrase
        const capMatch = f.phrase.match(/(?:cannot|unable to|failed to|doesn't support|can't)\s+(.{5,60})/i);
        if (!capMatch) continue;

        const claimed = capMatch[1].toLowerCase().trim();
        // Check if TOOLS.md mentions this capability (loose match)
        const keywords = claimed.split(/\s+/).filter((w) => w.length > 3);
        const matchCount = keywords.filter((kw) => toolsContent.toLowerCase().includes(kw)).length;

        if (matchCount >= 2 || (keywords.length === 1 && matchCount === 1)) {
          result.patterns.push({
            type: "capability-mismatch",
            claimedLimitation: f.phrase,
            actualCapability: `Documented in TOOLS.md for ${agentName}`,
            toolsmdLastModified: toolsMtime,
            occurrences: 1,
          });
          break; // one mismatch is enough
        }
      }

      // --- Pattern 3: Stale session ---
      if (toolsStat && result.patterns.length > 0) {
        const toolsModified = toolsStat.mtime;

        // Find earliest failure timestamp from Pattern 1
        let earliestFailure: Date | null = null;
        for (const p of result.patterns) {
          if (p.firstFailure) {
            const d = new Date(p.firstFailure);
            if (!isNaN(d.getTime()) && (!earliestFailure || d < earliestFailure)) {
              earliestFailure = d;
            }
          }
        }

        // If TOOLS.md was modified after the first failure, the agent may have a stale session
        if (earliestFailure && toolsModified > earliestFailure) {
          const sessionPattern = extractSessionIdPattern(scriptContent);
          result.patterns.push({
            type: "stale-session",
            claimedLimitation: "Agent continues failing after TOOLS.md was updated",
            actualCapability: sessionPattern
              ? `Session "${sessionPattern}" may be cached with outdated capabilities`
              : "Session may be cached with outdated capabilities",
            toolsmdLastModified: toolsModified.toISOString(),
            firstFailure: earliestFailure.toISOString(),
            occurrences: 1,
          });
        }
      }
    }
  }

  // Set detected flag and recommendation
  if (result.patterns.length > 0) {
    result.detected = true;

    const hasStale = result.patterns.some((p) => p.type === "stale-session");
    const hasMismatch = result.patterns.some((p) => p.type === "capability-mismatch");

    if (hasStale) {
      result.recommendation = "Force a new session to clear cached limitations. The agent's TOOLS.md was updated after failures began.";
    } else if (hasMismatch) {
      result.recommendation = "The agent claims it cannot do something that TOOLS.md documents. Try forcing a new session.";
    } else {
      result.recommendation = "This script has repeated failure phrases. Consider reviewing the prompt or forcing a new session.";
    }
  }

  return result;
}

/**
 * Scan agent's MEMORY.md for lines matching the claimed limitations and
 * remove or annotate them so the agent doesn't carry stale beliefs.
 * Returns the phrases that were cleaned.
 */
export async function cleanAgentMemory(
  agentName: string,
  claimedLimitations: string[],
): Promise<{ cleaned: boolean; removedPhrases: string[] }> {
  const memoryPath = join(OC_HOME, `workspace-${agentName}`, "MEMORY.md");
  const { data: content } = await readTextFile(memoryPath);
  if (!content) return { cleaned: false, removedPhrases: [] };

  // Build keywords from the claimed limitations
  const keywords: string[] = [];
  for (const claim of claimedLimitations) {
    // Extract meaningful words (4+ chars) from each limitation
    const words = claim.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [];
    keywords.push(...words);
  }
  const uniqueKeywords = [...new Set(keywords)].filter(
    (w) => !["that", "this", "with", "from", "have", "been", "does", "will", "were", "they"].includes(w),
  );
  if (uniqueKeywords.length === 0) return { cleaned: false, removedPhrases: [] };

  // Find lines that reference the limitation (e.g., "cannot send", "TTY", "doesn't work")
  const lines = content.split("\n");
  const removedPhrases: string[] = [];
  const cleaned: string[] = [];
  let skipBlock = false;

  for (const line of lines) {
    const lower = line.toLowerCase();
    // Check if this line contains limitation-related language
    const matchCount = uniqueKeywords.filter((kw) => lower.includes(kw)).length;
    const isLimitationLine = matchCount >= 2 && (
      /\b(cannot|unable|limitation|doesn't work|can't|won't|not supported|not possible|failed|broken)\b/i.test(line) ||
      /~~.*~~/.test(line) // strikethrough text indicating old broken state
    );

    if (isLimitationLine) {
      removedPhrases.push(line.trim());
      // Skip this line — it encodes a stale belief
      continue;
    }

    cleaned.push(line);
  }

  if (removedPhrases.length === 0) return { cleaned: false, removedPhrases: [] };

  // Write cleaned memory back
  await writeFile(memoryPath, cleaned.join("\n"));
  return { cleaned: true, removedPhrases };
}
