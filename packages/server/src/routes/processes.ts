import { Router } from "express";
import type { ApiResponse, ProcessInfo } from "../types/index.js";
import { safeExec } from "../lib/exec.js";
import { logAction } from "../lib/action-logger.js";

export const processRoutes = Router();

const OC_PROCESS_PATTERNS = ["openclaw", "oc-gateway", "oc-agent"];

processRoutes.get("/", async (_req, res) => {
  try {
    const result = await safeExec("ps", ["aux"]);
    const lines = result.stdout.split("\n").slice(1).filter(Boolean);

    const processes: ProcessInfo[] = lines
      .filter((line) =>
        OC_PROCESS_PATTERNS.some((p) => line.toLowerCase().includes(p))
      )
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        return {
          pid: parseInt(parts[1], 10),
          user: parts[0],
          cpu: parseFloat(parts[2]) || 0,
          mem: parseFloat(parts[3]) || 0,
          command: parts.slice(10).join(" "),
          isRogue: false,
        };
      })
      .filter((p) => !isNaN(p.pid));

    // Mark processes not tied to known agents as potentially rogue
    for (const proc of processes) {
      if (
        !proc.command.includes("gateway") &&
        !proc.command.includes("dashboard")
      ) {
        // Could be rogue if not recognized - leave as false for now
      }
    }

    const response: ApiResponse<ProcessInfo[]> = {
      ok: true,
      data: processes,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

processRoutes.post("/kill", async (req, res) => {
  const { pid } = req.body;
  if (!pid || typeof pid !== "number") {
    res.status(400).json({ ok: false, error: "Invalid PID", timestamp: new Date().toISOString() });
    return;
  }

  try {
    await logAction("KILL_PROCESS", `PID ${pid}`);
    const result = await safeExec("kill", ["-15", String(pid)]);
    res.json({
      ok: result.exitCode === 0,
      data: { pid, signal: "SIGTERM" },
      error: result.exitCode !== 0 ? result.stderr : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});
