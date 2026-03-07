import { Router } from "express";
import type { ApiResponse } from "../types/index.js";
import { safeExec } from "../lib/exec.js";

export const spendRoutes = Router();

spendRoutes.get("/", async (req, res) => {
  try {
    const days = String(Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 90));
    const result = await safeExec("openclaw", ["gateway", "usage-cost", "--days", days, "--json"], { timeout: 10000 });

    if (result.exitCode !== 0) {
      res.json({
        ok: true,
        data: { error: "Gateway offline or command failed", lastUpdated: new Date().toISOString() },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    }

    if (!parsed) {
      res.json({
        ok: true,
        data: { error: "Failed to parse spend data", lastUpdated: new Date().toISOString() },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.json({
      ok: true,
      data: {
        daily: parsed.daily ?? [],
        totals: parsed.totals ?? null,
        days: parsed.days ?? parseInt(days),
        lastUpdated: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({
      ok: true,
      data: { error: e.message, lastUpdated: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    });
  }
});
