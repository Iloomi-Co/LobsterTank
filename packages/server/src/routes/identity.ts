import { Router } from "express";
import { join } from "path";
import { readFile } from "fs/promises";
import type { ApiResponse } from "../types/index.js";
import { OC_HOME } from "../config.js";

export const identityRoutes = Router();

const WORKSPACE = join(OC_HOME, "workspace");

identityRoutes.get("/", async (_req, res) => {
  try {
    const raw = await readFile(join(WORKSPACE, "IDENTITY.md"), "utf-8");
    const lines = raw.split("\n");

    let name = "Unknown";
    let title = "";
    let avatar: string | null = null;

    for (const line of lines) {
      const nameMatch = line.match(/\*\*Name:\*\*\s*(.+)/);
      if (nameMatch) name = nameMatch[1].trim();

      const creatureMatch = line.match(/\*\*Creature:\*\*\s*(.+)/);
      if (creatureMatch) title = creatureMatch[1].trim();

      const avatarMatch = line.match(/\*\*Avatar:\*\*\s*(.+)/);
      if (avatarMatch) avatar = avatarMatch[1].trim();
    }

    // Also try SOUL.md for the one-liner title
    try {
      const soul = await readFile(join(WORKSPACE, "SOUL.md"), "utf-8");
      const soulMatch = soul.match(/You are \*\*[^*]+\*\*\s*—\s*(.+?)\.?\s*$/m);
      if (soulMatch) title = soulMatch[1].trim();
    } catch {}

    const response: ApiResponse<{ name: string; title: string; avatar: string | null }> = {
      ok: true,
      data: { name, title, avatar },
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

identityRoutes.get("/avatar", async (_req, res) => {
  try {
    const raw = await readFile(join(WORKSPACE, "IDENTITY.md"), "utf-8");
    const match = raw.match(/\*\*Avatar:\*\*\s*(.+)/);
    if (!match) { res.status(404).send("No avatar"); return; }

    const avatarPath = join(WORKSPACE, match[1].trim());
    const data = await readFile(avatarPath);
    res.type("png").send(data);
  } catch {
    res.status(404).send("Avatar not found");
  }
});
