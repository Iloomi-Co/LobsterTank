import { Router } from "express";
import type { ApiResponse, AgentInfo } from "../types/index.js";
import { readJsonFile } from "../lib/file-reader.js";
import { OC_CONFIG } from "../config.js";

export const agentRoutes = Router();

agentRoutes.get("/", async (_req, res) => {
  try {
    const { data: ocConfig, error } = await readJsonFile<any>(OC_CONFIG);
    if (error || !ocConfig) {
      res.json({ ok: false, error: error ?? "No config found", timestamp: new Date().toISOString() });
      return;
    }

    const agentList = ocConfig.agents?.list ?? [];
    const defaults = ocConfig.agents?.defaults ?? {};

    const agents: AgentInfo[] = agentList.map((a: any) => ({
      id: a.id,
      name: a.name ?? a.id,
      workspace: a.workspace ?? defaults.workspace,
      model: {
        primary: a.model?.primary ?? defaults.model?.primary,
        fallbacks: a.model?.fallbacks ?? defaults.model?.fallbacks ?? [],
      },
    }));

    const response: ApiResponse<{ agents: AgentInfo[]; defaults: any }> = {
      ok: true,
      data: { agents, defaults },
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});
