import { Router } from "express";
import type { ApiResponse } from "../types/index.js";
import { discoverProfiles, profileNameToSlug } from "../config.js";

export const profileRoutes = Router();

/* GET /api/profiles — list all discovered profiles with their URL slugs */
profileRoutes.get("/", (_req, res) => {
  try {
    const profiles = discoverProfiles().map((p) => ({
      ...p,
      slug: profileNameToSlug(p.name),
    }));
    const response: ApiResponse = {
      ok: true,
      data: { profiles },
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});
