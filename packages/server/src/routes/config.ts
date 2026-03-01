import { Router } from "express";
import { writeFile } from "fs/promises";
import type { ApiResponse, DashboardConfig } from "../types/index.js";
import { readJsonFile, ensureDir } from "../lib/file-reader.js";
import { DASHBOARD_CONFIG_FILE, DASHBOARD_STATE_DIR } from "../config.js";

export const configRoutes = Router();

const DEFAULT_CONFIG: DashboardConfig = {
  refreshInterval: 30000,
  theme: "dark",
  pinnedPanels: [],
};

configRoutes.get("/", async (_req, res) => {
  const { data, error } = await readJsonFile<DashboardConfig>(DASHBOARD_CONFIG_FILE);
  const config = data ?? DEFAULT_CONFIG;

  const response: ApiResponse<DashboardConfig> = {
    ok: true,
    data: config,
    timestamp: new Date().toISOString(),
  };
  res.json(response);
});

configRoutes.put("/", async (req, res) => {
  try {
    await ensureDir(DASHBOARD_STATE_DIR);
    const config: DashboardConfig = { ...DEFAULT_CONFIG, ...req.body };
    await writeFile(DASHBOARD_CONFIG_FILE, JSON.stringify(config, null, 2));

    const response: ApiResponse<DashboardConfig> = {
      ok: true,
      data: config,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});
