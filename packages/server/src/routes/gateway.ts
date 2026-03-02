import { Router } from "express";
import { safeExec } from "../lib/exec.js";
import { logAction } from "../lib/action-logger.js";
import { OC_GATEWAY_PORT } from "../config.js";

export const gatewayRoutes = Router();

async function getGatewayPid(): Promise<number | null> {
  const result = await safeExec("lsof", ["-i", `:${OC_GATEWAY_PORT}`, "-t"]);
  if (result.exitCode !== 0 || !result.stdout.trim()) return null;
  return parseInt(result.stdout.trim().split("\n")[0], 10) || null;
}

// POST /api/gateway/restart
gatewayRoutes.post("/restart", async (_req, res) => {
  try {
    const oldPid = await getGatewayPid();
    await logAction("GATEWAY_RESTART", `Initiating restart. Old PID: ${oldPid ?? "none"}`);

    const result = await safeExec("openclaw", ["gateway", "restart"], { timeout: 30000 });

    if (result.exitCode !== 0) {
      await logAction("GATEWAY_RESTART_FAILED", result.stderr || result.stdout);
      res.json({
        ok: false,
        error: `Gateway restart failed: ${result.stderr || result.stdout}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Wait briefly for new process to bind the port
    await new Promise((r) => setTimeout(r, 2000));

    const newPid = await getGatewayPid();
    await logAction("GATEWAY_RESTART_OK", `Old PID: ${oldPid ?? "none"} → New PID: ${newPid ?? "none"}`);

    res.json({
      ok: true,
      data: {
        oldPid: oldPid ?? null,
        newPid: newPid ?? null,
        running: newPid !== null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    await logAction("GATEWAY_RESTART_ERROR", e.message);
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});
