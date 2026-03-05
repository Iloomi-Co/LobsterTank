import { Router } from "express";
import { join } from "path";
import { copyFile, mkdir, chmod } from "fs/promises";
import type { ApiResponse } from "../types/index.js";
import { safeExec } from "../lib/exec.js";
import { fileStat, listDir } from "../lib/file-reader.js";
import { logAction } from "../lib/action-logger.js";
import { ensureGitRepo, snapshot } from "../lib/git.js";
import {
  OC_HOME, BIN_DIR, DEPLOY_SCRIPTS, DEPLOY_CONFIG,
  DEPLOYED_CONFIG_DIR, OC_LOGS_DIR,
} from "../config.js";

export const scriptRoutes = Router();

scriptRoutes.get("/status", async (_req, res) => {
  try {
    // Primary: discover from ~/bin/
    const { entries: binEntries } = await listDir(BIN_DIR);
    const binScripts = new Set(binEntries.filter((f) => f.endsWith(".sh")));

    // Secondary: discover from deploy/
    const { entries: deployEntries } = await listDir(DEPLOY_SCRIPTS);
    const deployScripts = new Set(deployEntries.filter((f) => f.endsWith(".sh")));

    // Cross-reference crontab directly
    const cronResult = await safeExec("crontab", ["-l"]);
    const currentCrontab = cronResult.exitCode === 0 ? cronResult.stdout : "";

    // Union of all script names
    const allScripts = new Set([...binScripts, ...deployScripts]);

    const scripts = [];
    for (const file of allScripts) {
      const inBin = binScripts.has(file);
      const inDeploy = deployScripts.has(file);

      let executable = false;
      let deployStatus: "ok" | "update" | "new" | "not-in-deploy" = "new";

      if (inBin) {
        const deployedPath = join(BIN_DIR, file);
        const deployedStat = await fileStat(deployedPath);
        if (deployedStat) {
          executable = (deployedStat.mode & 0o111) !== 0;
        }

        if (inDeploy) {
          const srcHash = await safeExec("shasum", [join(DEPLOY_SCRIPTS, file)]);
          const dstHash = await safeExec("shasum", [join(BIN_DIR, file)]);
          if (srcHash.exitCode === 0 && dstHash.exitCode === 0) {
            deployStatus = srcHash.stdout.split(/\s/)[0] === dstHash.stdout.split(/\s/)[0] ? "ok" : "update";
          } else {
            deployStatus = "update";
          }
        } else {
          deployStatus = "not-in-deploy";
        }
      }

      // Find schedule from crontab
      let hasCrontabEntry = false;
      let schedule: string | null = null;
      for (const line of currentCrontab.split("\n")) {
        if (!line.includes(file)) continue;
        const trimmed = line.trim();
        if (trimmed.startsWith("#") || trimmed.startsWith("PATH=") || trimmed.startsWith("SHELL=")) continue;
        hasCrontabEntry = true;
        if (trimmed.startsWith("@reboot")) {
          schedule = "@reboot";
        } else {
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 6) schedule = parts.slice(0, 5).join(" ");
        }
        break;
      }

      scripts.push({
        name: file,
        inBin,
        inDeploy,
        deployStatus,
        executable,
        hasCrontabEntry,
        schedule,
      });
    }

    res.json({ ok: true, data: { scripts }, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

scriptRoutes.post("/deploy", async (_req, res) => {
  try {
    await logAction("SCRIPT_DEPLOY_ALL", "Deploying all scripts from deploy/");

    await mkdir(BIN_DIR, { recursive: true });
    await mkdir(DEPLOYED_CONFIG_DIR, { recursive: true });
    await mkdir(OC_LOGS_DIR, { recursive: true });

    const deployed: string[] = [];

    const { entries: sourceScripts } = await listDir(DEPLOY_SCRIPTS);
    for (const file of sourceScripts) {
      if (!file.endsWith(".sh")) continue;
      await copyFile(join(DEPLOY_SCRIPTS, file), join(BIN_DIR, file));
      await chmod(join(BIN_DIR, file), 0o755);
      deployed.push(file);
    }

    const { entries: sourceConfigs } = await listDir(DEPLOY_CONFIG);
    for (const file of sourceConfigs) {
      if (file.endsWith(".template")) continue;
      await copyFile(join(DEPLOY_CONFIG, file), join(DEPLOYED_CONFIG_DIR, file));
      deployed.push(`config/${file}`);
    }

    res.json({ ok: true, data: { deployed }, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

scriptRoutes.post("/deploy/:scriptName", async (req, res) => {
  const { scriptName } = req.params;
  if (!scriptName.endsWith(".sh")) {
    res.status(400).json({ ok: false, error: "Invalid script name", timestamp: new Date().toISOString() });
    return;
  }

  try {
    const sourcePath = join(DEPLOY_SCRIPTS, scriptName);
    const stat = await fileStat(sourcePath);
    if (!stat) {
      res.status(404).json({ ok: false, error: "Script not found in deploy/", timestamp: new Date().toISOString() });
      return;
    }

    await logAction("SCRIPT_DEPLOY", `Deploying ${scriptName}`);
    await mkdir(BIN_DIR, { recursive: true });
    await copyFile(sourcePath, join(BIN_DIR, scriptName));
    await chmod(join(BIN_DIR, scriptName), 0o755);

    res.json({ ok: true, data: { deployed: scriptName }, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});
