import { Router } from "express";
import { join } from "path";
import type { ApiResponse, CronJob } from "../types/index.js";
import { safeExec } from "../lib/exec.js";
import { readTextFile } from "../lib/file-reader.js";
import { OC_HOME } from "../config.js";

export const cronRoutes = Router();

cronRoutes.get("/", async (_req, res) => {
  try {
    const result = await safeExec("crontab", ["-l"]);

    if (result.exitCode !== 0 && result.stderr.includes("no crontab")) {
      const response: ApiResponse<CronJob[]> = {
        ok: true,
        data: [],
        timestamp: new Date().toISOString(),
      };
      res.json(response);
      return;
    }

    const lines = result.stdout.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    const jobs: CronJob[] = lines.map((line) => {
      const parts = line.trim().split(/\s+/);
      const schedule = parts.slice(0, 5).join(" ");
      const command = parts.slice(5).join(" ");
      const isOcRelated = command.toLowerCase().includes("openclaw") || command.toLowerCase().includes("claw");

      return {
        schedule,
        command,
        isOcRelated,
        isPaused: false,
      };
    });

    const response: ApiResponse<CronJob[]> = {
      ok: true,
      data: jobs,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

cronRoutes.get("/logs", async (_req, res) => {
  try {
    const cronLogPath = join(OC_HOME, "cron");
    const { data: logContent } = await readTextFile(join(cronLogPath, "cron.log"));

    const response: ApiResponse<{ content: string }> = {
      ok: true,
      data: { content: logContent ?? "No cron logs found" },
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});
