import { Router } from "express";
import type { ApiResponse } from "../types/index.js";
import { OC_HOME } from "../config.js";
import { logAction } from "../lib/action-logger.js";
import {
  isGitRepo, ensureGitRepo, isClean, snapshot,
  getLog, getLastCommit, getDiff, revertLast,
} from "../lib/git.js";

export const gitRoutes = Router();

gitRoutes.get("/status", async (_req, res) => {
  try {
    const initialized = await isGitRepo(OC_HOME);
    if (!initialized) {
      res.json({ ok: true, data: { initialized: false }, timestamp: new Date().toISOString() });
      return;
    }

    const clean = await isClean(OC_HOME);
    const lastCommit = await getLastCommit(OC_HOME);

    res.json({
      ok: true,
      data: { initialized: true, clean, lastCommit, path: OC_HOME },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

gitRoutes.post("/init", async (_req, res) => {
  try {
    await logAction("GIT_INIT", `Initializing git in ${OC_HOME}`);
    const success = await ensureGitRepo(OC_HOME);
    res.json({ ok: success, data: { initialized: success }, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

gitRoutes.post("/snapshot", async (req, res) => {
  const { message } = req.body as { message?: string };
  try {
    const msg = message ?? `LobsterTank: manual snapshot ${new Date().toISOString()}`;
    await logAction("GIT_SNAPSHOT", msg);
    const result = await snapshot(OC_HOME, msg);
    res.json({ ok: true, data: result, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

gitRoutes.get("/log", async (_req, res) => {
  try {
    const entries = await getLog(OC_HOME);
    res.json({ ok: true, data: { entries }, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

gitRoutes.get("/diff", async (_req, res) => {
  try {
    const diff = await getDiff(OC_HOME);
    res.json({ ok: true, data: { diff: diff || "(no changes)" }, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

gitRoutes.post("/revert", async (_req, res) => {
  try {
    await logAction("GIT_REVERT", "Reverting last commit");
    const success = await revertLast(OC_HOME);
    res.json({ ok: success, data: { reverted: success }, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});
