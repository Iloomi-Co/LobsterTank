import { Router } from "express";
import { healthRoutes } from "./health.js";
import { processRoutes } from "./processes.js";
import { spendRoutes } from "./spend.js";
import { launchdRoutes } from "./launchd.js";
import { sessionRoutes } from "./sessions.js";
import { cronRoutes } from "./cron.js";
import { agentRoutes } from "./agents.js";
import { ollamaRoutes } from "./ollama.js";
import { actionRoutes } from "./actions.js";
import { configRoutes } from "./config.js";
import { instanceRoutes } from "./instances.js";
import { auditRoutes } from "./audit.js";
import { configSyncRoutes } from "./config-sync.js";
import { scriptRoutes } from "./scripts.js";
import { crontabRoutes } from "./crontab.js";
import { registryRoutes } from "./registry.js";
import { gitRoutes } from "./git.js";
import { schedulerRoutes } from "./scheduler.js";
import type { ApiResponse } from "../types/index.js";

export const routes = Router();

routes.get("/ping", (_req, res) => {
  const response: ApiResponse<{ message: string }> = {
    ok: true,
    data: { message: "pong" },
    timestamp: new Date().toISOString(),
  };
  res.json(response);
});

// Step 1 routes
routes.use("/health", healthRoutes);
routes.use("/processes", processRoutes);
routes.use("/spend", spendRoutes);
routes.use("/launchd", launchdRoutes);
routes.use("/sessions", sessionRoutes);
routes.use("/cron", cronRoutes);
routes.use("/agents", agentRoutes);
routes.use("/ollama", ollamaRoutes);
routes.use("/actions", actionRoutes);
routes.use("/config", configRoutes);
routes.use("/instances", instanceRoutes);

// Step 2 routes
routes.use("/audit", auditRoutes);
routes.use("/config-sync", configSyncRoutes);
routes.use("/scripts", scriptRoutes);
routes.use("/crontab", crontabRoutes);
routes.use("/registry", registryRoutes);
routes.use("/git", gitRoutes);

// Step 4 routes
routes.use("/scheduler", schedulerRoutes);
