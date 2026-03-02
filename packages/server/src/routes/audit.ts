import { Router } from "express";
import { homedir } from "os";
import { join } from "path";
import { readFile, copyFile, mkdir, chmod } from "fs/promises";
import type { ApiResponse } from "../types/index.js";
import { safeExec } from "../lib/exec.js";
import { readJsonFile, fileStat, listDir } from "../lib/file-reader.js";
import { logAction } from "../lib/action-logger.js";
import {
  OC_HOME, OC_GATEWAY_PORT, DEPLOY_SCRIPTS, DEPLOY_CONFIG,
  BIN_DIR, DEPLOYED_CONFIG_DIR, OC_LOGS_DIR,
  REGISTRY_FILE, CRONTAB_PATH_LINE, getExpectedCronEntries,
} from "../config.js";
import { ensureGitRepo, isGitRepo, isClean, snapshot, getLastCommit } from "../lib/git.js";

export const auditRoutes = Router();

// ─── Sub-check: Config sync ────────────────────────────────
async function checkConfigSync(): Promise<any> {
  const syncScript = join(DEPLOY_SCRIPTS, "sync-rules.sh");
  const stat = await fileStat(syncScript);
  if (!stat) {
    return { summary: { totalChecks: 0, ok: 0, missing: 0, outdated: 0 }, aligned: false, results: [], error: "sync-rules.sh not found" };
  }

  const result = await safeExec("bash", [syncScript, "--check", "--json"], { timeout: 15000 });
  // Exit code 0 = all aligned, 1 = drift detected (both produce valid JSON)
  if (result.exitCode !== 0 && result.exitCode !== 1) {
    return { summary: { totalChecks: 0, ok: 0, missing: 0, outdated: 0 }, aligned: false, results: [], error: result.stderr || "Script failed" };
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    return { summary: { totalChecks: 0, ok: 0, missing: 0, outdated: 0 }, aligned: false, results: [], error: "Failed to parse script output" };
  }
}

// ─── Sub-check: Script deployment ───────────────────────────
interface ScriptStatus {
  name: string;
  deployed: boolean;
  executable: boolean;
  upToDate: boolean;
  cronInstalled: boolean;
  cronEntry: string | null;
  status: "ok" | "new" | "update";
}

async function checkScripts(): Promise<{ scripts: ScriptStatus[]; configFiles: any[] }> {
  const { entries: sourceScripts } = await listDir(DEPLOY_SCRIPTS);
  const scripts: ScriptStatus[] = [];
  const allExpectedEntries = await getExpectedCronEntries();

  // Get current crontab
  const cronResult = await safeExec("crontab", ["-l"]);
  const currentCrontab = cronResult.exitCode === 0 ? cronResult.stdout : "";

  for (const file of sourceScripts) {
    if (!file.endsWith(".sh")) continue;

    const sourcePath = join(DEPLOY_SCRIPTS, file);
    const deployedPath = join(BIN_DIR, file);

    const deployedStat = await fileStat(deployedPath);
    const deployed = deployedStat !== null;

    let executable = false;
    let upToDate = false;

    if (deployed) {
      // Check executable
      try {
        const mode = deployedStat!.mode;
        executable = (mode & 0o111) !== 0;
      } catch { /* */ }

      // Compare checksums
      const srcHash = await safeExec("shasum", [sourcePath]);
      const dstHash = await safeExec("shasum", [deployedPath]);
      if (srcHash.exitCode === 0 && dstHash.exitCode === 0) {
        upToDate = srcHash.stdout.split(/\s/)[0] === dstHash.stdout.split(/\s/)[0];
      }
    }

    // Check cron entries (a script may have multiple cron entries)
    const expectedCrons = allExpectedEntries.filter((e) => e.script === file);
    const cronInstalled = expectedCrons.length > 0
      ? expectedCrons.every((e) => currentCrontab.includes(e.match))
      : true;

    let status: "ok" | "new" | "update" = "new";
    if (deployed && upToDate && executable) status = "ok";
    else if (deployed) status = "update";

    scripts.push({
      name: file,
      deployed,
      executable,
      upToDate,
      cronInstalled,
      cronEntry: expectedCrons.length > 0 ? expectedCrons.map((e) => `${e.schedule} ${e.command}`).join("\n") : null,
      status,
    });
  }

  // Check config files
  const { entries: sourceConfigs } = await listDir(DEPLOY_CONFIG);
  const configFiles = [];
  for (const file of sourceConfigs) {
    if (file.endsWith(".template")) continue;
    const deployedPath = join(DEPLOYED_CONFIG_DIR, file);
    const exists = (await fileStat(deployedPath)) !== null;
    configFiles.push({ name: file, deployed: exists, status: exists ? "ok" : "new" });
  }

  return { scripts, configFiles };
}

// ─── Sub-check: Crontab ────────────────────────────────────
interface CrontabAudit {
  raw: string;
  hasPath: boolean;
  pathLine: string | null;
  entries: { schedule: string; command: string; scriptName: string }[];
  expected: { script: string; match: string; schedule: string; command: string }[];
  toAdd: string[];
  toFix: string[];
}

async function checkCrontab(): Promise<CrontabAudit> {
  const allExpectedEntries = await getExpectedCronEntries();
  const result = await safeExec("crontab", ["-l"]);
  const raw = result.exitCode === 0 ? result.stdout : "";
  const lines = raw.split("\n");

  const pathLine = lines.find((l) => l.startsWith("PATH=")) ?? null;
  const hasPath = pathLine !== null;

  const entries = lines
    .filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("PATH=") && !l.startsWith("SHELL="))
    .map((l) => {
      const parts = l.trim().split(/\s+/);
      const isReboot = parts[0] === "@reboot";
      const schedule = isReboot ? "@reboot" : parts.slice(0, 5).join(" ");
      const command = isReboot ? parts.slice(1).join(" ") : parts.slice(5).join(" ");
      const scriptMatch = command.match(/([a-zA-Z0-9_-]+\.sh)/);
      return { schedule, command, scriptName: scriptMatch?.[1] ?? "" };
    });

  const toAdd: string[] = [];
  const toFix: string[] = [];

  if (!hasPath) toFix.push("PATH line missing");

  for (const expected of allExpectedEntries) {
    const found = raw.includes(expected.match);
    if (!found) {
      toAdd.push(`${expected.schedule} ${expected.command}`);
    }
  }

  // Check for --keepalive -1 (missing unit)
  if (raw.includes("--keepalive -1") && !raw.includes("--keepalive -1s")) {
    toFix.push("Ollama --keepalive uses -1 instead of -1s");
  }

  return { raw, hasPath, pathLine, entries, expected: allExpectedEntries, toAdd, toFix };
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

// ─── Change plan text generator ────────────────────────────
function generateChangePlan(
  target: string,
  configSync: any,
  scriptDeploy: any,
  crontab: CrontabAudit,
  issues: any[],
  gitStatus: any,
): { text: string; totalChanges: number } {
  const lines: string[] = [];
  let totalChanges = 0;

  const ts = new Date().toISOString();
  lines.push("═══════════════════════════════════════════════════");
  lines.push("  LobsterTank Change Plan");
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

  // Script Deployment
  lines.push("");
  lines.push("── SCRIPT DEPLOYMENT ──────────────────────────────");
  lines.push("");
  if (scriptDeploy.scripts) {
    lines.push("  Scripts to deploy to ~/bin/:");
    for (const s of scriptDeploy.scripts) {
      const tag = s.status === "ok" ? "OK" : s.status === "new" ? "NEW" : "UPDATE";
      const detail = s.status === "ok" ? "(up to date)" : s.status === "new" ? "(not currently deployed)" : "(deployed copy differs from source)";
      lines.push(`    ${tag.padEnd(8)} ${s.name.padEnd(32)} ${detail}`);
      if (s.status !== "ok") totalChanges++;
    }
  }
  if (scriptDeploy.configFiles?.length > 0) {
    lines.push("");
    lines.push("  Config files:");
    for (const c of scriptDeploy.configFiles) {
      const tag = c.status === "ok" ? "OK" : "NEW";
      lines.push(`    ${tag.padEnd(8)} ${c.name}`);
      if (c.status !== "ok") totalChanges++;
    }
  }

  // Crontab
  lines.push("");
  lines.push("── CRONTAB CHANGES ────────────────────────────────");
  lines.push("");
  lines.push(`  Current entries: ${crontab.entries.length}`);
  lines.push(`  Expected entries: ${crontab.expected.length}`);
  lines.push("");
  for (const entry of crontab.toAdd) {
    lines.push(`  ADD     ${entry}`);
    totalChanges++;
  }
  for (const entry of crontab.entries) {
    lines.push(`  OK      ${entry.schedule} ${entry.command.slice(0, 60)}`);
  }
  for (const fix of crontab.toFix) {
    lines.push(`  FIX     ${fix}`);
    totalChanges++;
  }

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
  lines.push(`  Summary: ${totalChanges} change(s) planned`);
  lines.push("  Run \"Confirm\" to apply. Git snapshot will be created first.");
  lines.push("═══════════════════════════════════════════════════");

  return { text: lines.join("\n"), totalChanges };
}

// ─── GET /api/audit — Master audit endpoint ────────────────
auditRoutes.get("/", async (_req, res) => {
  try {
    const [configSync, scriptDeploy, crontab, issues, gitStatus] = await Promise.all([
      checkConfigSync(),
      checkScripts(),
      checkCrontab(),
      checkIssues(),
      checkGitStatus(OC_HOME),
    ]);

    const { text: changePlanText, totalChanges } = generateChangePlan(
      "~/.openclaw", configSync, scriptDeploy, crontab, issues, gitStatus
    );

    const response: ApiResponse<any> = {
      ok: true,
      data: {
        timestamp: new Date().toISOString(),
        target: "~/.openclaw",
        configSync,
        scriptDeployment: scriptDeploy,
        crontab,
        issues,
        gitStatus,
        changePlanText,
        totalChanges,
        categories: ["configSync", "scriptDeployment", "crontab"],
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
      // Exit 0 = all aligned after apply, exit 1 = some outdated rules remain (skipped by design).
      // Both mean the apply itself ran successfully. Only exit >= 2 is a real failure.
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

    // Apply crontab changes
    if (apply.crontab) {
      const cronResult = await safeExec("crontab", ["-l"]);
      let currentCrontab = cronResult.exitCode === 0 ? cronResult.stdout.trimEnd() : "";

      // Ensure PATH line
      if (!currentCrontab.includes("PATH=")) {
        currentCrontab = CRONTAB_PATH_LINE + "\n" + currentCrontab;
      }

      // Add missing entries
      const allExpectedEntries = await getExpectedCronEntries();
      for (const entry of allExpectedEntries) {
        if (!currentCrontab.includes(entry.match)) {
          currentCrontab += `\n${entry.schedule} ${entry.command}`;
        }
      }

      // Fix --keepalive -1 → -1s
      currentCrontab = currentCrontab.replace(/--keepalive -1(?!s)/g, "--keepalive -1s");

      // Install new crontab via stdin
      const { writeFile } = await import("fs/promises");
      const tmpFile = join(OC_HOME, "dashboard", ".crontab-tmp");
      await mkdir(join(OC_HOME, "dashboard"), { recursive: true });
      await writeFile(tmpFile, currentCrontab + "\n");
      const installResult = await safeExec("crontab", [tmpFile]);
      const { unlink } = await import("fs/promises");
      await unlink(tmpFile).catch(() => {});
      results.push(`Crontab: ${installResult.exitCode === 0 ? "installed" : "failed"}`);
    }

    // Auto-restart gateway if config sync was applied (agents pick up new rules)
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
    const [configSync, scriptDeploy, crontab, issues, gitStatus] = await Promise.all([
      checkConfigSync(),
      checkScripts(),
      checkCrontab(),
      checkIssues(),
      checkGitStatus(OC_HOME),
    ]);

    const { text: changePlanText, totalChanges } = generateChangePlan(
      "~/.openclaw", configSync, scriptDeploy, crontab, issues, gitStatus
    );

    res.json({
      ok: true,
      data: {
        applied: results,
        gatewayRestart,
        timestamp: new Date().toISOString(),
        target: "~/.openclaw",
        configSync,
        scriptDeployment: scriptDeploy,
        crontab,
        issues,
        gitStatus,
        changePlanText,
        totalChanges,
        categories: ["configSync", "scriptDeployment", "crontab"],
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// Expose the sub-checks for direct use
export { checkConfigSync, checkScripts, checkCrontab };
