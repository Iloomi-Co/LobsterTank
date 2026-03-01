import { Router } from "express";
import { join } from "path";
import type { ApiResponse } from "../types/index.js";
import { safeExec } from "../lib/exec.js";
import { readJsonFile, fileStat } from "../lib/file-reader.js";
import { logAction } from "../lib/action-logger.js";
import { ensureGitRepo, snapshot } from "../lib/git.js";
import { OC_HOME, DEPLOY_SCRIPTS, DEPLOY_CONFIG } from "../config.js";

export const configSyncRoutes = Router();

configSyncRoutes.get("/check", async (_req, res) => {
  try {
    const syncScript = join(DEPLOY_SCRIPTS, "sync-rules.sh");
    const stat = await fileStat(syncScript);
    if (!stat) {
      res.json({ ok: false, error: "sync-rules.sh not found in deploy/scripts/", timestamp: new Date().toISOString() });
      return;
    }

    const result = await safeExec("bash", [syncScript, "--check", "--json"], { timeout: 15000 });
    if (result.exitCode !== 0) {
      res.json({ ok: false, error: result.stderr || "Script failed", timestamp: new Date().toISOString() });
      return;
    }

    const data = JSON.parse(result.stdout);
    res.json({ ok: true, data, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

configSyncRoutes.post("/apply", async (_req, res) => {
  try {
    await ensureGitRepo(OC_HOME);
    await snapshot(OC_HOME, `LobsterTank: pre-sync snapshot ${new Date().toISOString()}`);
    await logAction("CONFIG_SYNC_APPLY", "Applying canonical rules to AGENTS.md files");

    const syncScript = join(DEPLOY_SCRIPTS, "sync-rules.sh");
    const result = await safeExec("bash", [syncScript, "--apply", "--json"], { timeout: 15000 });

    await snapshot(OC_HOME, "LobsterTank: synced AGENTS.md rules");

    if (result.exitCode !== 0) {
      res.json({ ok: false, error: result.stderr || "Script failed", timestamp: new Date().toISOString() });
      return;
    }

    const data = JSON.parse(result.stdout);
    res.json({ ok: true, data, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

configSyncRoutes.get("/rules", async (_req, res) => {
  try {
    const rulesPath = join(DEPLOY_CONFIG, "agents-rules.json");
    const { data, error } = await readJsonFile<any>(rulesPath);
    if (error) {
      res.json({ ok: false, error, timestamp: new Date().toISOString() });
      return;
    }
    res.json({ ok: true, data, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});
