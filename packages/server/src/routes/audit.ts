import { Router } from "express";
import { homedir } from "os";
import { join } from "path";
import { readFile, copyFile, mkdir, chmod } from "fs/promises";
import type { ApiResponse } from "../types/index.js";
import { safeExec } from "../lib/exec.js";
import { readJsonFile, readTextFile, fileStat, listDir } from "../lib/file-reader.js";
import { logAction } from "../lib/action-logger.js";
import {
  OC_HOME, OC_GATEWAY_PORT, DEPLOY_SCRIPTS, DEPLOY_CONFIG,
  BIN_DIR, DEPLOYED_CONFIG_DIR, OC_LOGS_DIR,
  REGISTRY_FILE, getCrontabPathLine,
} from "../config.js";
import { ensureGitRepo, isGitRepo, isClean, snapshot, getLastCommit } from "../lib/git.js";
import { checkWrapperConvention } from "../lib/wrapper-convention-checker.js";
import type { WrapperConventionReport } from "../lib/wrapper-convention-checker.js";

export const auditRoutes = Router();

// ─── Types ──────────────────────────────────────────────────

interface DiscoveredTask {
  report: WrapperConventionReport;
  inBin: boolean;
  inDeploy: boolean;
  deployStatus: "ok" | "update" | "new" | "not-in-deploy";
}

interface CrontabHealth {
  raw: string;
  hasPath: boolean;
  pathLine: string | null;
  orphanedEntries: { schedule: string; command: string }[];
  fixes: string[];
}

// ─── Sub-check: Config sync ────────────────────────────────
async function checkConfigSync(): Promise<any> {
  const syncScript = join(DEPLOY_SCRIPTS, "sync-rules.sh");
  const stat = await fileStat(syncScript);
  if (!stat) {
    return { summary: { totalChecks: 0, ok: 0, missing: 0, outdated: 0 }, aligned: false, results: [], error: "sync-rules.sh not found" };
  }

  const result = await safeExec("bash", [syncScript, "--check", "--json"], { timeout: 15000 });
  if (result.exitCode !== 0 && result.exitCode !== 1) {
    return { summary: { totalChecks: 0, ok: 0, missing: 0, outdated: 0 }, aligned: false, results: [], error: result.stderr || "Script failed" };
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    return { summary: { totalChecks: 0, ok: 0, missing: 0, outdated: 0 }, aligned: false, results: [], error: "Failed to parse script output" };
  }
}

// ─── Discovery: replaces checkScripts + checkCrontab ────────

async function discoverTasks(): Promise<{
  tasks: DiscoveredTask[];
  crontab: CrontabHealth;
  deployOnlyScripts: string[];
}> {
  // 1. List ~/bin/*.sh
  const { entries: binEntries } = await listDir(BIN_DIR);
  const binScripts = binEntries.filter((f) => f.endsWith(".sh"));

  // 2. Read crontab
  const cronResult = await safeExec("crontab", ["-l"]);
  const crontabRaw = cronResult.exitCode === 0 ? cronResult.stdout : "";

  // 3. List deploy/scripts/core/*.sh
  const { entries: deployEntries } = await listDir(DEPLOY_SCRIPTS);
  const deployScripts = deployEntries.filter((f) => f.endsWith(".sh"));

  // 4. For each script in ~/bin/ — read content, check convention, compare hash
  const tasks: DiscoveredTask[] = [];
  for (const scriptName of binScripts) {
    const binPath = join(BIN_DIR, scriptName);
    const { data: content } = await readTextFile(binPath);
    if (!content) continue;

    const report = checkWrapperConvention(scriptName, content, crontabRaw);

    const inDeploy = deployScripts.includes(scriptName);
    let deployStatus: DiscoveredTask["deployStatus"] = "not-in-deploy";

    if (inDeploy) {
      const srcHash = await safeExec("shasum", [join(DEPLOY_SCRIPTS, scriptName)]);
      const dstHash = await safeExec("shasum", [binPath]);
      if (srcHash.exitCode === 0 && dstHash.exitCode === 0) {
        const match = srcHash.stdout.split(/\s/)[0] === dstHash.stdout.split(/\s/)[0];
        deployStatus = match ? "ok" : "update";
      } else {
        deployStatus = "update";
      }
    }

    tasks.push({
      report,
      inBin: true,
      inDeploy,
      deployStatus,
    });
  }

  // 5. Find orphaned crontab entries (reference scripts not in ~/bin/)
  const orphanedEntries: CrontabHealth["orphanedEntries"] = [];
  const crontabLines = crontabRaw.split("\n");
  for (const line of crontabLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("PATH=") || trimmed.startsWith("SHELL=")) continue;

    const scriptMatch = trimmed.match(/([a-zA-Z0-9_-]+\.sh)/);
    if (!scriptMatch) continue;

    const refScript = scriptMatch[1];
    if (!binScripts.includes(refScript)) {
      const isReboot = trimmed.startsWith("@reboot");
      const parts = trimmed.split(/\s+/);
      const schedule = isReboot ? "@reboot" : parts.slice(0, 5).join(" ");
      const command = isReboot ? parts.slice(1).join(" ") : parts.slice(5).join(" ");
      orphanedEntries.push({ schedule, command });
    }
  }

  // 6. Find deploy-only scripts (in deploy/ but not in ~/bin/)
  const deployOnlyScripts = deployScripts.filter((f) => !binScripts.includes(f));

  // 7. Build CrontabHealth
  const pathLine = crontabLines.find((l) => l.startsWith("PATH=")) ?? null;
  const fixes: string[] = [];
  if (!pathLine) fixes.push("PATH line missing");
  if (crontabRaw.includes("--keepalive -1") && !crontabRaw.includes("--keepalive -1s")) {
    fixes.push("Ollama --keepalive uses -1 instead of -1s");
  }

  const crontab: CrontabHealth = {
    raw: crontabRaw,
    hasPath: pathLine !== null,
    pathLine,
    orphanedEntries,
    fixes,
  };

  return { tasks, crontab, deployOnlyScripts };
}

// ─── Sub-check: Issues ─────────────────────────────────────
async function checkIssues(): Promise<{ severity: string; message: string }[]> {
  const issues: { severity: string; message: string }[] = [];

  // Rogue launchd
  const launchResult = await safeExec("launchctl", ["list"]);
  if (launchResult.exitCode === 0) {
    const rogueCount = launchResult.stdout
      .split("\n")
      .filter((l) => {
        const label = l.split("\t").pop()?.trim() ?? "";
        return (label.includes("claw") || label.includes("openclaw")) && label !== "ai.openclaw.gateway";
      }).length;
    if (rogueCount > 0) {
      issues.push({ severity: "warn", message: `Found ${rogueCount} rogue launchd service(s)` });
    }
  }

  // Registry check
  const regExists = (await fileStat(REGISTRY_FILE)) !== null;
  if (!regExists) {
    issues.push({ severity: "info", message: "Registry file does not exist (will create on bootstrap)" });
  }

  // Ollama keepalive check
  const cronResult = await safeExec("crontab", ["-l"]);
  if (cronResult.exitCode === 0) {
    const crontab = cronResult.stdout;
    if (crontab.includes("--keepalive -1") && !crontab.includes("--keepalive -1s")) {
      issues.push({ severity: "warn", message: "Ollama --keepalive uses -1 instead of -1s in crontab" });
    }
  }

  return issues;
}

// ─── Sub-check: Git status ─────────────────────────────────
async function checkGitStatus(dir: string): Promise<{ initialized: boolean; clean: boolean; lastCommit: any }> {
  const initialized = await isGitRepo(dir);
  if (!initialized) {
    return { initialized: false, clean: true, lastCommit: null };
  }
  const clean = await isClean(dir);
  const lastCommit = await getLastCommit(dir);
  return { initialized, clean, lastCommit };
}

// ─── Audit report text generator ───────────────────────────
function generateAuditReport(
  target: string,
  configSync: any,
  discoveredTasks: DiscoveredTask[],
  crontab: CrontabHealth,
  deployOnlyScripts: string[],
  issues: any[],
  gitStatus: any,
): { text: string; totalChanges: number } {
  const lines: string[] = [];
  let totalChanges = 0;

  const ts = new Date().toISOString();
  lines.push("═══════════════════════════════════════════════════");
  lines.push("  LobsterTank Audit Report");
  lines.push(`  Generated: ${ts}`);
  lines.push(`  Target: ${target}`);
  lines.push("═══════════════════════════════════════════════════");

  // Config Sync
  lines.push("");
  lines.push("── CONFIG SYNC ────────────────────────────────────");
  lines.push("");
  const cs = configSync.summary;
  lines.push(`  Rule Checks: ${cs.ok}/${cs.totalChecks} aligned${cs.totalChecks === cs.ok ? " ✅" : ""}`);
  if (configSync.results) {
    for (const r of configSync.results) {
      for (const ok of r.ok ?? []) {
        lines.push(`  ✅ ${r.workspace.padEnd(20)} / ${ok.padEnd(22)} — OK`);
      }
      for (const m of r.missing ?? []) {
        lines.push(`  ❌ ${r.workspace.padEnd(20)} / ${m.padEnd(22)} — MISSING (will add)`);
        totalChanges++;
      }
      for (const o of r.outdated ?? []) {
        lines.push(`  ⚠️  ${r.workspace.padEnd(20)} / ${o.padEnd(22)} — OUTDATED (will update)`);
        totalChanges++;
      }
    }
  }

  // Discovered Tasks
  lines.push("");
  lines.push("── DISCOVERED TASKS (~/bin/ + crontab) ─────────────");
  lines.push("");
  for (const task of discoveredTasks) {
    const r = task.report;
    const allPassed = r.passCount === r.totalApplicable;
    const icon = allPassed ? "✅" : "⚠️";
    lines.push(`${icon} ${r.scriptName}`);

    const schedulePart = r.schedule ? `Schedule: ${r.schedule}` : "Schedule: (none)";
    const agentPart = r.agentName ? `Agent: ${r.agentName}` : `Type: ${r.classification}`;
    lines.push(`   ${schedulePart}  |  ${agentPart}`);

    // Show check indicators for applicable checks
    const applicable = r.checks.filter((c) => !c.agentOnly || r.classification === "agent-wrapper");
    const indicators = applicable.map((c) => {
      const indicator = c.exempt ? "n/a" : (c.passed ? "✅" : "❌");
      return `${c.label}: ${indicator}`;
    }).join("  ");
    lines.push(`   ${indicators}`);

    if (task.deployStatus === "update") {
      lines.push(`   Deploy: ⚠️ deployed copy differs from source`);
      totalChanges++;
    } else if (task.deployStatus === "not-in-deploy") {
      lines.push(`   Deploy: (not in deploy/)`);
    }
  }

  // Deploy Available
  lines.push("");
  lines.push("── DEPLOY AVAILABLE ───────────────────────────────");
  lines.push("");
  if (deployOnlyScripts.length === 0) {
    lines.push("   (none)");
  } else {
    for (const s of deployOnlyScripts) {
      lines.push(`   ${s} (in deploy/, not in ~/bin/)`);
    }
  }

  // Orphaned Crontab Entries
  lines.push("");
  lines.push("── ORPHANED CRONTAB ENTRIES ───────────────────────");
  lines.push("");
  if (crontab.orphanedEntries.length === 0) {
    lines.push("   (none)");
  } else {
    for (const e of crontab.orphanedEntries) {
      lines.push(`   ${e.schedule} ${e.command}`);
      totalChanges++;
    }
  }

  // Crontab Fixes
  if (crontab.fixes.length > 0) {
    lines.push("");
    lines.push("── CRONTAB FIXES ──────────────────────────────────");
    lines.push("");
    for (const fix of crontab.fixes) {
      lines.push(`  FIX     ${fix}`);
      totalChanges++;
    }
  }

  // Agent Config Sync
  lines.push("");
  lines.push("── AGENT CONFIG SYNC ──────────────────────────────");
  lines.push("   (unchanged — still calls sync-rules.sh --check --json)");

  // Issues
  if (issues.length > 0) {
    lines.push("");
    lines.push("── ISSUES DETECTED ────────────────────────────────");
    lines.push("");
    for (const issue of issues) {
      const icon = issue.severity === "warn" ? "⚠️ " : "✅";
      lines.push(`  ${icon} ${issue.message}`);
    }
  }

  // Git
  lines.push(`  ${gitStatus.initialized ? "✅" : "❌"} Git ${gitStatus.initialized ? "initialized" : "NOT initialized"} in ${target}`);

  lines.push("");
  lines.push("═══════════════════════════════════════════════════");
  lines.push(`  Summary: ${totalChanges} change(s) detected`);
  lines.push("  Run \"Confirm\" to apply. Git snapshot will be created first.");
  lines.push("═══════════════════════════════════════════════════");

  return { text: lines.join("\n"), totalChanges };
}

// ─── GET /api/audit — Master audit endpoint ────────────────
auditRoutes.get("/", async (_req, res) => {
  try {
    const [configSync, discovered, issues, gitStatus] = await Promise.all([
      checkConfigSync(),
      discoverTasks(),
      checkIssues(),
      checkGitStatus(OC_HOME),
    ]);

    const { text: changePlanText, totalChanges } = generateAuditReport(
      "~/.openclaw", configSync, discovered.tasks, discovered.crontab, discovered.deployOnlyScripts, issues, gitStatus
    );

    const response: ApiResponse<any> = {
      ok: true,
      data: {
        timestamp: new Date().toISOString(),
        target: "~/.openclaw",
        configSync,
        discoveredTasks: discovered.tasks,
        crontab: discovered.crontab,
        deployOnlyScripts: discovered.deployOnlyScripts,
        issues,
        gitStatus,
        changePlanText,
        totalChanges,
        categories: ["configSync", "scriptDeployment", "crontabFixes"],
      },
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// ─── POST /api/audit/apply — Apply selected categories ─────
auditRoutes.post("/apply", async (req, res) => {
  const { apply } = req.body as { apply: Record<string, boolean> };
  if (!apply) {
    res.status(400).json({ ok: false, error: "Missing apply object", timestamp: new Date().toISOString() });
    return;
  }

  try {
    // Ensure git repo and take pre-apply snapshot
    await ensureGitRepo(OC_HOME);
    await snapshot(OC_HOME, `LobsterTank: pre-apply snapshot ${new Date().toISOString()}`);
    await logAction("AUDIT_APPLY", `Categories: ${Object.entries(apply).filter(([,v]) => v).map(([k]) => k).join(", ")}`);

    const results: string[] = [];

    // Apply config sync
    if (apply.configSync) {
      const syncScript = join(DEPLOY_SCRIPTS, "sync-rules.sh");
      const syncResult = await safeExec("bash", [syncScript, "--apply", "--json"], { timeout: 15000 });
      results.push(`Config sync: ${syncResult.exitCode <= 1 ? "applied" : "failed"}`);
    }

    // Apply script deployment
    if (apply.scriptDeployment) {
      await mkdir(BIN_DIR, { recursive: true });
      await mkdir(DEPLOYED_CONFIG_DIR, { recursive: true });
      await mkdir(OC_LOGS_DIR, { recursive: true });

      const { entries: sourceScripts } = await listDir(DEPLOY_SCRIPTS);
      for (const file of sourceScripts) {
        if (!file.endsWith(".sh")) continue;
        const src = join(DEPLOY_SCRIPTS, file);
        const dst = join(BIN_DIR, file);
        await copyFile(src, dst);
        await chmod(dst, 0o755);
      }

      // Copy config files
      const { entries: sourceConfigs } = await listDir(DEPLOY_CONFIG);
      for (const file of sourceConfigs) {
        if (file.endsWith(".template")) continue;
        const src = join(DEPLOY_CONFIG, file);
        const dst = join(DEPLOYED_CONFIG_DIR, file);
        await copyFile(src, dst);
      }

      results.push("Script deployment: completed");
    }

    // Apply crontab fixes (structural only — no ADD from manifest)
    if (apply.crontabFixes || apply.crontab) {
      const cronResult = await safeExec("crontab", ["-l"]);
      let currentCrontab = cronResult.exitCode === 0 ? cronResult.stdout.trimEnd() : "";
      let changed = false;

      // Ensure PATH line
      if (!currentCrontab.includes("PATH=")) {
        const pathLine = await getCrontabPathLine();
        currentCrontab = pathLine + "\n" + currentCrontab;
        changed = true;
      }

      // Fix --keepalive -1 → -1s
      const fixed = currentCrontab.replace(/--keepalive -1(?!s)/g, "--keepalive -1s");
      if (fixed !== currentCrontab) {
        currentCrontab = fixed;
        changed = true;
      }

      if (changed) {
        const { writeFile } = await import("fs/promises");
        const tmpFile = join(OC_HOME, "dashboard", ".crontab-tmp");
        await mkdir(join(OC_HOME, "dashboard"), { recursive: true });
        await writeFile(tmpFile, currentCrontab + "\n");
        const installResult = await safeExec("crontab", [tmpFile]);
        const { unlink } = await import("fs/promises");
        await unlink(tmpFile).catch(() => {});
        results.push(`Crontab fixes: ${installResult.exitCode === 0 ? "applied" : "failed"}`);
      } else {
        results.push("Crontab fixes: no changes needed");
      }
    }

    // Auto-restart gateway if config sync was applied
    let gatewayRestart: { oldPid: number | null; newPid: number | null } | null = null;
    if (apply.configSync) {
      const oldPidResult = await safeExec("lsof", ["-i", `:${OC_GATEWAY_PORT}`, "-t"]);
      const oldPid = oldPidResult.stdout.trim() ? parseInt(oldPidResult.stdout.trim().split("\n")[0], 10) : null;

      await logAction("GATEWAY_RESTART", `Auto-restart after config sync apply. Old PID: ${oldPid ?? "none"}`);
      const restartResult = await safeExec("openclaw", ["gateway", "restart"], { timeout: 30000 });

      if (restartResult.exitCode === 0) {
        await new Promise((r) => setTimeout(r, 2000));
        const newPidResult = await safeExec("lsof", ["-i", `:${OC_GATEWAY_PORT}`, "-t"]);
        const newPid = newPidResult.stdout.trim() ? parseInt(newPidResult.stdout.trim().split("\n")[0], 10) : null;
        gatewayRestart = { oldPid, newPid };
        results.push(`Gateway restart: PID ${oldPid ?? "none"} → ${newPid ?? "none"}`);
        await logAction("GATEWAY_RESTART_OK", `Old PID: ${oldPid ?? "none"} → New PID: ${newPid ?? "none"}`);
      } else {
        results.push("Gateway restart: failed");
        await logAction("GATEWAY_RESTART_FAILED", restartResult.stderr || restartResult.stdout);
      }
    }

    // Post-apply git snapshot
    await snapshot(OC_HOME, `LobsterTank: applied ${Object.entries(apply).filter(([,v]) => v).map(([k]) => k).join(", ")}`);

    // Re-run audit to get updated state
    const [configSync, discovered, issues, gitStatus] = await Promise.all([
      checkConfigSync(),
      discoverTasks(),
      checkIssues(),
      checkGitStatus(OC_HOME),
    ]);

    const { text: changePlanText, totalChanges } = generateAuditReport(
      "~/.openclaw", configSync, discovered.tasks, discovered.crontab, discovered.deployOnlyScripts, issues, gitStatus
    );

    res.json({
      ok: true,
      data: {
        applied: results,
        gatewayRestart,
        timestamp: new Date().toISOString(),
        target: "~/.openclaw",
        configSync,
        discoveredTasks: discovered.tasks,
        crontab: discovered.crontab,
        deployOnlyScripts: discovered.deployOnlyScripts,
        issues,
        gitStatus,
        changePlanText,
        totalChanges,
        categories: ["configSync", "scriptDeployment", "crontabFixes"],
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

export { checkConfigSync, discoverTasks };
