import { Router } from "express";
import { writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import type { ApiResponse } from "../types/index.js";
import { readJsonFile, fileStat, listDir } from "../lib/file-reader.js";
import { logAction } from "../lib/action-logger.js";
import { REGISTRY_FILE, OC_GATEWAY_PORT } from "../config.js";

export const registryRoutes = Router();

registryRoutes.get("/", async (_req, res) => {
  try {
    const { data, error } = await readJsonFile<any>(REGISTRY_FILE);
    if (error) {
      res.json({ ok: true, data: { exists: false }, timestamp: new Date().toISOString() });
      return;
    }
    res.json({ ok: true, data: { exists: true, ...data }, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

registryRoutes.post("/bootstrap", async (_req, res) => {
  try {
    await logAction("REGISTRY_BOOTSTRAP", "Auto-discovering OC instances");
    const home = homedir();
    const { entries: homeEntries } = await listDir(home, 500);

    const instances = [];
    for (const entry of homeEntries) {
      if (!entry.startsWith(".openclaw")) continue;

      const instPath = join(home, entry);
      const instStat = await fileStat(instPath);
      if (!instStat?.isDirectory()) continue;

      // Check if it has an openclaw.json
      const configPath = join(instPath, "openclaw.json");
      const configStat = await fileStat(configPath);
      if (!configStat) continue;

      // Read config to get agent list
      const { data: config } = await readJsonFile<any>(configPath);
      const agents = config?.agents?.list?.map((a: any) => a.id) ?? [];

      // Determine name from directory
      const dirName = entry.replace(".openclaw-", "").replace(".openclaw", "chief");
      const isDefault = entry === ".openclaw";

      instances.push({
        id: dirName,
        name: dirName.charAt(0).toUpperCase() + dirName.slice(1),
        path: `~/${entry}`,
        gatewayPort: OC_GATEWAY_PORT,
        isDefault,
        agents,
      });
    }

    const registry = {
      version: "1.0.0",
      instances,
      lastUpdated: new Date().toISOString(),
    };

    await writeFile(REGISTRY_FILE, JSON.stringify(registry, null, 2));

    res.json({ ok: true, data: { exists: true, ...registry }, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});
