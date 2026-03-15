/**
 * script-patcher.ts — Auto-fix failing wrapper convention checks.
 *
 * Given a script's content and its check results, patches the script
 * to pass all applicable checks. Returns the patched content and a
 * list of fixes applied.
 */

import type { CheckResult, ScriptClassification } from "./wrapper-convention-checker.js";

export interface PatchResult {
  patched: boolean;
  content: string;
  fixes: string[];
}

/**
 * Derive a pause-file name from the script name.
 * e.g. "bridge-ingest-cowork.sh" → ".pause-bridge-ingest-cowork"
 */
function pauseName(scriptName: string): string {
  return `.pause-${scriptName.replace(/\.sh$/, "")}`;
}

/**
 * Derive a lockfile name from the script name.
 * e.g. "bridge-ingest-cowork.sh" → ".bridge-ingest-cowork.lock"
 */
function lockName(scriptName: string): string {
  return `.${scriptName.replace(/\.sh$/, "")}.lock`;
}

export function patchScript(
  scriptName: string,
  content: string,
  checks: CheckResult[],
  classification: ScriptClassification,
): PatchResult {
  const isAgent = classification === "agent-wrapper";
  const failing = checks.filter((c) => !c.passed && !c.exempt && (!c.agentOnly || isAgent));

  if (failing.length === 0) {
    return { patched: false, content, fixes: [] };
  }

  let result = content;
  const fixes: string[] = [];

  const failIds = new Set(failing.map((c) => c.id));

  // ── Global Pause ───────────────────────────────────────────────
  if (failIds.has("global-pause")) {
    const pauseBlock = [
      `if [[ -f "$HOME/.openclaw/.cron-paused" ]]; then`,
      `    log "SKIPPED: Global cron pause active"`,
      `    exit 0`,
      `fi`,
    ].join("\n");

    // Insert after log() function definition
    const logFnEnd = result.match(/^log\(\)\s*\{[^}]*\}\n/m);
    if (logFnEnd && logFnEnd.index != null) {
      const idx = result.indexOf(logFnEnd[0]) + logFnEnd[0].length;
      result = result.slice(0, idx) + "\n" + pauseBlock + "\n" + result.slice(idx);
    } else {
      // Fallback: insert after mkdir -p line
      const mkdirMatch = result.match(/^mkdir -p.*\n/m);
      if (mkdirMatch && mkdirMatch.index != null) {
        const idx = mkdirMatch.index + mkdirMatch[0].length;
        result = result.slice(0, idx) + "\n" + pauseBlock + "\n" + result.slice(idx);
      }
    }
    fixes.push("Added global pause guard");
  }

  // ── Per-Task Pause ────────────────────────────────────────────
  if (failIds.has("per-task-pause")) {
    const pName = pauseName(scriptName);
    const pauseBlock = [
      `PAUSEFILE="$HOME/.openclaw/${pName}"`,
      `if [[ -f "$PAUSEFILE" ]]; then`,
      `    log "SKIPPED: Task paused. Remove $PAUSEFILE to resume."`,
      `    exit 0`,
      `fi`,
    ].join("\n");

    // Insert after global-pause block or after log() function
    const globalPauseEnd = result.match(/if \[[\[ ]*-f.*\.cron-paused.*\n.*exit 0\n.*fi\n/);
    if (globalPauseEnd) {
      const idx = result.indexOf(globalPauseEnd[0]) + globalPauseEnd[0].length;
      result = result.slice(0, idx) + "\n" + pauseBlock + "\n" + result.slice(idx);
    } else {
      // Insert after log() function definition
      const logFnEnd = result.match(/^log\(\)\s*\{[^}]*\}\n/m);
      if (logFnEnd) {
        const idx = result.indexOf(logFnEnd[0]) + logFnEnd[0].length;
        result = result.slice(0, idx) + "\n" + pauseBlock + "\n" + result.slice(idx);
      }
    }
    fixes.push("Added per-task pause guard");
  }

  // ── Lockfile ──────────────────────────────────────────────────
  if (failIds.has("lockfile")) {
    const lName = lockName(scriptName);
    const hasExistingTrap = /^trap\s+/m.test(result);

    // Add LOCKFILE variable after other variable declarations
    const lockVar = `LOCKFILE="$HOME/.openclaw/${lName}"`;

    // Find the right place to insert — after last variable declaration block
    // Look for the line before the log() function or first function
    const logFnMatch = result.match(/\n(log\(\))/);
    if (logFnMatch && logFnMatch.index != null) {
      result = result.slice(0, logFnMatch.index) + "\n" + lockVar + result.slice(logFnMatch.index);
    }

    // Add or update trap
    if (hasExistingTrap) {
      // Extend existing trap to include LOCKFILE
      result = result.replace(
        /^(trap\s+")([^"]*)("\s+EXIT)/m,
        `$1rm -f $LOCKFILE; $2$3`,
      );
    } else {
      // Add trap after mkdir -p or after variable block
      const mkdirMatch = result.match(/^mkdir -p.*\n/m);
      if (mkdirMatch && mkdirMatch.index != null) {
        const idx = mkdirMatch.index + mkdirMatch[0].length;
        result = result.slice(0, idx) + `\ntrap "rm -f $LOCKFILE" EXIT\n` + result.slice(idx);
      }
    }

    // Add lockfile check before main logic (after guards)
    const lockCheck = [
      `if [[ -f "$LOCKFILE" ]]; then`,
      `    LOCK_AGE=$(( $(date +%s) - $(stat -f %m "$LOCKFILE" 2>/dev/null || echo 0) ))`,
      `    if [[ $LOCK_AGE -lt 600 ]]; then`,
      `        log "SKIPPED: Already running (lockfile age=\${LOCK_AGE}s)"`,
      `        exit 0`,
      `    else`,
      `        log "WARNING: Stale lockfile (age=\${LOCK_AGE}s), removing"`,
      `        rm -f "$LOCKFILE"`,
      `    fi`,
      `fi`,
      `touch "$LOCKFILE"`,
    ].join("\n");

    // Insert after pause guards or after the last guard block
    const pauseEnd = result.match(/Remove \$PAUSEFILE to resume\."\n\s+exit 0\nfi\n/);
    const cronPauseEnd = result.match(/\.cron-paused.*\n.*exit 0\nfi\n/);
    const insertAfter = pauseEnd || cronPauseEnd;

    if (insertAfter && insertAfter.index != null) {
      const idx = result.indexOf(insertAfter[0]) + insertAfter[0].length;
      result = result.slice(0, idx) + "\n" + lockCheck + "\n" + result.slice(idx);
    }

    fixes.push("Added lockfile guard with stale-lock detection");
  }

  // ── Pre-check ─────────────────────────────────────────────────
  if (failIds.has("pre-check")) {
    // Add HAS_WORK check before the openclaw agent invocation
    const agentMatch = result.match(/(?:^|[|;&]\s*|`|\$\()(?:"\$OPENCLAW"|\$OPENCLAW|openclaw)\s+agent/m);
    if (agentMatch && agentMatch.index != null) {
      const preCheck = [
        `# ── Pre-check: only proceed if there is work to do ──`,
        `HAS_WORK=false`,
        `if [[ "$INGESTED" -gt 0 ]] 2>/dev/null; then`,
        `    HAS_WORK=true`,
        `fi`,
        ``,
        `if [[ "$HAS_WORK" == "false" ]]; then`,
        `    log "No work to do — skipping agent turn"`,
        `    exit 0`,
        `fi`,
        ``,
      ].join("\n");

      // Find the comment or section header before the agent invocation
      const beforeAgent = result.slice(0, agentMatch.index);
      // Look for the section comment (# ── Optional: or similar)
      const sectionComment = beforeAgent.lastIndexOf("\n# ──");
      if (sectionComment > 0) {
        const insertIdx = beforeAgent.lastIndexOf("\n", sectionComment - 1) + 1;
        result = result.slice(0, insertIdx) + preCheck + result.slice(insertIdx);
      } else {
        result = result.slice(0, agentMatch.index) + preCheck + result.slice(agentMatch.index);
      }
    }
    fixes.push("Added pre-check gate before agent invocation");
  }

  // ── Heredoc Prompt ────────────────────────────────────────────
  if (failIds.has("heredoc-prompt")) {
    // Convert --message "..." to heredoc
    const msgMatch = result.match(/--message\s+"([^]*?)"\s*\n/);
    if (msgMatch && msgMatch.index != null) {
      // Already has --message, convert to heredoc
      const msgContent = msgMatch[1];
      const heredoc = `--message "$(cat <<'EOFPROMPT'\n${msgContent}\nEOFPROMPT\n)"\n`;
      result = result.slice(0, msgMatch.index) + heredoc + result.slice(msgMatch.index + msgMatch[0].length);
      fixes.push("Converted --message to heredoc prompt");
    } else {
      // Check for MSG= variable passed to --message "$MSG"
      const msgVarMatch = result.match(/--message\s+"\$MSG"/);
      if (msgVarMatch) {
        // The MSG variable is already defined, convert to heredoc by wrapping the variable assignment
        const msgAssign = result.match(/MSG="([^]*?)"\n/);
        if (msgAssign && msgAssign.index != null) {
          const msgContent = msgAssign[1];
          const heredocAssign = `MSG="$(cat <<'EOFPROMPT'\n${msgContent}\nEOFPROMPT\n)"\n`;
          result = result.slice(0, msgAssign.index) + heredocAssign + result.slice(msgAssign.index + msgAssign[0].length);
          fixes.push("Converted MSG variable to heredoc");
        }
      }
    }
  }

  return {
    patched: fixes.length > 0,
    content: result,
    fixes,
  };
}
