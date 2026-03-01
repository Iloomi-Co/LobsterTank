import { Router } from "express";
import { writeFile } from "fs/promises";
import type { ApiResponse, InstanceRegistry, OcInstance } from "../types/index.js";
import { readJsonFile, ensureDir, fileStat } from "../lib/file-reader.js";
import { DASHBOARD_REGISTRY_FILE, DASHBOARD_STATE_DIR, OC_HOME, OC_GATEWAY_PORT } from "../config.js";

export const instanceRoutes = Router();

async function getOrCreateRegistry(): Promise<InstanceRegistry> {
  const { data } = await readJsonFile<InstanceRegistry>(DASHBOARD_REGISTRY_FILE);
  if (data) return data;

  // Auto-discover default instance
  const ocExists = await fileStat(OC_HOME);
  const defaultInstance: OcInstance = {
    id: "default",
    name: "Default",
    path: OC_HOME,
    gatewayPort: OC_GATEWAY_PORT,
    isDefault: true,
  };

  const registry: InstanceRegistry = {
    instances: ocExists ? [defaultInstance] : [],
    lastUpdated: new Date().toISOString(),
  };

  await ensureDir(DASHBOARD_STATE_DIR);
  await writeFile(DASHBOARD_REGISTRY_FILE, JSON.stringify(registry, null, 2));
  return registry;
}

instanceRoutes.get("/", async (_req, res) => {
  try {
    const registry = await getOrCreateRegistry();
    const response: ApiResponse<InstanceRegistry> = {
      ok: true,
      data: registry,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

instanceRoutes.post("/", async (req, res) => {
  try {
    const registry = await getOrCreateRegistry();
    const newInstance: OcInstance = {
      id: req.body.id ?? `inst-${Date.now()}`,
      name: req.body.name ?? "New Instance",
      path: req.body.path,
      gatewayPort: req.body.gatewayPort ?? OC_GATEWAY_PORT,
      isDefault: false,
    };

    registry.instances.push(newInstance);
    registry.lastUpdated = new Date().toISOString();
    await writeFile(DASHBOARD_REGISTRY_FILE, JSON.stringify(registry, null, 2));

    res.json({ ok: true, data: registry, timestamp: registry.lastUpdated });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});
