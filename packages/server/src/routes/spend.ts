import { Router } from "express";
import type { ApiResponse, SpendData } from "../types/index.js";
import { safeExec } from "../lib/exec.js";

export const spendRoutes = Router();

spendRoutes.get("/", async (_req, res) => {
  try {
    const result = await safeExec("openclaw", ["gateway", "usage-cost", "--json"], { timeout: 10000 });

    if (result.exitCode !== 0) {
      const spend: SpendData = {
        lastUpdated: new Date().toISOString(),
        error: "Gateway offline or command failed",
      };
      const response: ApiResponse<SpendData> = {
        ok: true,
        data: spend,
        timestamp: spend.lastUpdated,
      };
      res.json(response);
      return;
    }

    // Parse the JSON output
    let parsed: any;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      // Try to find JSON in the output
      const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    }

    const spend: SpendData = {
      total: parsed?.total ?? parsed?.totalCost ?? undefined,
      byModel: parsed?.byModel ?? parsed?.models ?? undefined,
      balance: parsed?.balance ?? undefined,
      lastUpdated: new Date().toISOString(),
    };

    const response: ApiResponse<SpendData> = {
      ok: true,
      data: spend,
      timestamp: spend.lastUpdated,
    };
    res.json(response);
  } catch (e: any) {
    res.json({
      ok: true,
      data: { lastUpdated: new Date().toISOString(), error: e.message } as SpendData,
      timestamp: new Date().toISOString(),
    });
  }
});
