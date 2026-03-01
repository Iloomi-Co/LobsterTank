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
  DEPLOYED_CONFIG_DIR, OC_LOGS_DIR, EXPECTED_CRON_ENTRIES,
} from "../config.js";

export const scriptRoutes = Router();

scriptRoutes.get("/status", async (_req, res) => {
  try {
    const { entries: sourceScripts } = await listDir(DEPLOY_SCRIPTS);
    const cronResult = await safeExec("crontab", ["-l"]);
    const currentCrontab = cronResult.exitCode === 0 ? cronResult.stdout : "";

    const scripts = [];
    for (const file of sourceScripts) {
      if (!file.endsWith(".sh")) continue;

      const deployedPath = join(BIN_DIR, file);
      const deployedStat = await fileStat(deployedPath);
      const deployed = deployedStat !== null;

      let executable = false;
      let upToDate = false;

      if (deployed) {
        executable = (deployedStat!.mode & 0o111) !== 0;
        const srcHash = await safeExec("shasum", [join(DEPLOY_SCRIPTS, file)]);
        const dstHash = await safeExec("shasum", [deployedPath]);
        if (srcHash.exitCode === 0 && dstHash.exitCode === 0) {
          upToDate = srcHash.stdout.split(/\s/)[0] === dstHash.stdout.split(/\s/)[0];
        }
      }

      const expectedCrons = EXPECTED_CRON_ENTRIES.filter((e) => e.script === file);
      const cronInstalled = expectedCrons.length > 0
        ? expectedCrons.every((e) => currentCrontab.includes(e.match))
        : true;

      scripts.push({
        name: file,
        deployed,
        executable,
        upToDate,
        cronInstalled,
        cronEntry: expectedCrons.length > 0 ? expectedCrons.map((e) => `${e.schedule} ${e.command}`).join("\n") : null,
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
