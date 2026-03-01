import { Router } from "express";
import { join } from "path";
import type { ApiResponse, SessionInfo } from "../types/index.js";
import { listDir, fileStat } from "../lib/file-reader.js";
import { OC_HOME } from "../config.js";
import { logAction } from "../lib/action-logger.js";
import { rm } from "fs/promises";

export const sessionRoutes = Router();

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

sessionRoutes.get("/", async (_req, res) => {
  try {
    const workspaceDirs = ["workspace", "workspace-beehive", "workspace-bee-email-poller", "workspace-bee-email-processor"];
    const sessions: SessionInfo[] = [];

    for (const wsDir of workspaceDirs) {
      const wsPath = join(OC_HOME, wsDir);
      const sessionsPath = join(wsPath, "sessions");
      const { entries } = await listDir(sessionsPath);

      for (const entry of entries) {
        if (entry.startsWith(".")) continue;
        const sessionPath = join(sessionsPath, entry);
        const stats = await fileStat(sessionPath);
        if (!stats?.isDirectory()) continue;

        const now = Date.now();
        const lastActivity = stats.mtime.getTime();
        const isStale = now - lastActivity > STALE_THRESHOLD_MS;

        sessions.push({
          id: entry,
          agent: wsDir.replace("workspace-", "").replace("workspace", "main"),
          startedAt: stats.birthtime.toISOString(),
          lastActivity: stats.mtime.toISOString(),
          isStale,
        });
      }
    }

    const response: ApiResponse<SessionInfo[]> = {
      ok: true,
      data: sessions,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

sessionRoutes.post("/cleanup", async (req, res) => {
  const { sessionId, agent } = req.body;
  if (!sessionId || !agent) {
    res.status(400).json({ ok: false, error: "Missing sessionId or agent", timestamp: new Date().toISOString() });
    return;
  }

  try {
    const wsDir = agent === "main" ? "workspace" : `workspace-${agent}`;
    const sessionPath = join(OC_HOME, wsDir, "sessions", sessionId);

    const stats = await fileStat(sessionPath);
    if (!stats) {
      res.json({ ok: false, error: "Session not found", timestamp: new Date().toISOString() });
      return;
    }

    await logAction("CLEANUP_SESSION", `Agent: ${agent}, Session: ${sessionId}`);
    await rm(sessionPath, { recursive: true });
    res.json({
      ok: true,
      data: { sessionId, agent, cleaned: true },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});
