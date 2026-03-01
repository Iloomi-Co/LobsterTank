import { Router } from "express";
import type { ApiResponse, HealthStatus } from "../types/index.js";
import { safeExec } from "../lib/exec.js";
import { readJsonFile } from "../lib/file-reader.js";
import { OC_CONFIG, OC_GATEWAY_PORT } from "../config.js";

export const healthRoutes = Router();

healthRoutes.get("/", async (_req, res) => {
  try {
    // Check if gateway is running via lsof
    const lsofResult = await safeExec("lsof", ["-i", `:${OC_GATEWAY_PORT}`, "-t"]);
    const gatewayPid = lsofResult.stdout.trim()
      ? parseInt(lsofResult.stdout.trim().split("\n")[0], 10)
      : null;

    // Read agent config
    const { data: ocConfig } = await readJsonFile<any>(OC_CONFIG);
    const agents = ocConfig?.agents?.list ?? [];

    const health: HealthStatus = {
      gateway: {
        running: gatewayPid !== null,
        pid: gatewayPid ?? undefined,
        port: OC_GATEWAY_PORT,
      },
      agents: agents.map((a: any) => ({
        id: a.id,
        name: a.name ?? a.id,
        workspace: a.workspace,
        model: a.model,
      })),
      timestamp: new Date().toISOString(),
    };

    const response: ApiResponse<HealthStatus> = {
      ok: true,
      data: health,
      timestamp: health.timestamp,
    };
    res.json(response);
  } catch (e: any) {
    res.json({
      ok: false,
      error: e.message,
      timestamp: new Date().toISOString(),
    });
  }
});
