import { Router } from "express";
import type { ApiResponse, ActionResult } from "../types/index.js";
import { safeExec } from "../lib/exec.js";
import { logAction } from "../lib/action-logger.js";

export const actionRoutes = Router();

actionRoutes.post("/emergency-stop", async (_req, res) => {
  try {
    await logAction("EMERGENCY_STOP", "Killing all openclaw processes");

    // Kill all openclaw processes
    const pgrep = await safeExec("pgrep", ["-f", "openclaw"]);
    const pids = pgrep.stdout.trim().split("\n").filter(Boolean);

    let killed = 0;
    for (const pid of pids) {
      const pidNum = parseInt(pid, 10);
      if (isNaN(pidNum)) continue;
      // Don't kill the gateway or this dashboard
      const result = await safeExec("kill", ["-15", String(pidNum)]);
      if (result.exitCode === 0) killed++;
    }

    const actionResult: ActionResult = {
      success: true,
      action: "emergency-stop",
      details: `Sent SIGTERM to ${killed} processes`,
      timestamp: new Date().toISOString(),
    };

    res.json({ ok: true, data: actionResult, timestamp: actionResult.timestamp });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

actionRoutes.get("/log", async (_req, res) => {
  try {
    const { readTextFile } = await import("../lib/file-reader.js");
    const { DASHBOARD_ACTIONS_LOG } = await import("../config.js");
    const { data: content } = await readTextFile(DASHBOARD_ACTIONS_LOG);
    res.json({
      ok: true,
      data: { content: content ?? "No actions logged yet" },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});
