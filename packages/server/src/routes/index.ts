import { Router } from "express";
import { homedir } from "os";
import { join } from "path";
import { statSync } from "fs";
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
import { determinismRoutes } from "./determinism.js";
import { gatewayRoutes } from "./gateway.js";
import { spendByModelRoutes } from "./spend-by-model.js";
import { identityRoutes } from "./identity.js";
import { memoryRoutes } from "./memory.js";
import { profileRoutes } from "./profiles.js";
import { recomputePaths, profileSlugToName } from "../config.js";
import type { ApiResponse } from "../types/index.js";

export const routes = Router();

/* ── Global (profile-independent) routes ── */

routes.get("/ping", (_req, res) => {
  const response: ApiResponse<{ message: string }> = {
    ok: true,
    data: { message: "pong" },
    timestamp: new Date().toISOString(),
  };
  res.json(response);
});

routes.use("/profiles", profileRoutes);

/* ── Profile resolution middleware ── */

function resolveProfileSlug(slug: string): { name: string; dir: string } | null {
  const home = homedir();
  if (slug === "openclaw") {
    const dir = join(home, ".openclaw");
    try { if (statSync(dir).isDirectory()) return { name: "default", dir }; } catch {}
    return null;
  }
  if (slug.startsWith("openclaw-")) {
    const name = profileSlugToName(slug);
    const dir = join(home, `.openclaw-${name}`);
    try { if (statSync(dir).isDirectory()) return { name, dir }; } catch {}
    return null;
  }
  return null;
}

/* ── Profile-scoped routes ── */

const profileRouter = Router({ mergeParams: true });

profileRouter.use("/health", healthRoutes);
profileRouter.use("/processes", processRoutes);
profileRouter.use("/spend/by-model", spendByModelRoutes);
profileRouter.use("/spend", spendRoutes);
profileRouter.use("/launchd", launchdRoutes);
profileRouter.use("/sessions", sessionRoutes);
profileRouter.use("/cron", cronRoutes);
profileRouter.use("/agents", agentRoutes);
profileRouter.use("/ollama", ollamaRoutes);
profileRouter.use("/actions", actionRoutes);
profileRouter.use("/config", configRoutes);
profileRouter.use("/instances", instanceRoutes);
profileRouter.use("/audit", auditRoutes);
profileRouter.use("/config-sync", configSyncRoutes);
profileRouter.use("/scripts", scriptRoutes);
profileRouter.use("/crontab", crontabRoutes);
profileRouter.use("/registry", registryRoutes);
profileRouter.use("/git", gitRoutes);
profileRouter.use("/scheduler", schedulerRoutes);
profileRouter.use("/determinism", determinismRoutes);
profileRouter.use("/gateway", gatewayRoutes);
profileRouter.use("/identity", identityRoutes);
profileRouter.use("/memory", memoryRoutes);

routes.use("/:profile", (req, res, next) => {
  const slug = req.params.profile as string;
  const resolved = resolveProfileSlug(slug);
  if (!resolved) {
    res.status(404).json({ ok: false, error: `Unknown profile: ${slug}`, timestamp: new Date().toISOString() });
    return;
  }
  recomputePaths(resolved.dir);
  // Store profile name on request for downstream handlers if needed
  (req as any).profileName = resolved.name;
  next();
}, profileRouter);
