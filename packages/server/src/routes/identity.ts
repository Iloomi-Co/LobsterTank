import { Router } from "express";
import { join } from "path";
import { readFile, stat } from "fs/promises";
import type { ApiResponse } from "../types/index.js";
import { OC_HOME } from "../config.js";

export const identityRoutes = Router();

const getWorkspace = () => join(OC_HOME, "workspace");

/** Check if a parsed field is a real value vs a template placeholder */
function isFilledIn(value: string): boolean {
  if (!value) return false;
  if (value.startsWith("_(")) return false;
  return true;
}

/** Check if an avatar value looks like a file path (not a sentence) */
function isAvatarPath(value: string): boolean {
  if (!value || !isFilledIn(value)) return false;
  // Reject if it contains spaces suggesting prose, unless it looks like a path with extension
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(value)) return true;
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:")) return true;
  return false;
}

identityRoutes.get("/", async (req, res) => {
  try {
    const raw = await readFile(join(getWorkspace(), "IDENTITY.md"), "utf-8");
    const lines = raw.split("\n");

    // Fall back to profile name if IDENTITY.md fields are empty/template
    const profileName = (req as any).profileName ?? "default";
    const profileLabel = profileName === "default" ? "OpenClaw" : profileName;
    let name = profileLabel;
    let title = "";
    let avatar: string | null = null;

    for (const line of lines) {
      const nameMatch = line.match(/\*\*Name:\*\*\s*(.+)/);
      if (nameMatch && isFilledIn(nameMatch[1].trim())) name = nameMatch[1].trim();

      const creatureMatch = line.match(/\*\*Creature:\*\*\s*(.+)/);
      if (creatureMatch && isFilledIn(creatureMatch[1].trim())) title = creatureMatch[1].trim();

      const avatarMatch = line.match(/\*\*Avatar:\*\*\s*(.+)/);
      if (avatarMatch && isAvatarPath(avatarMatch[1].trim())) avatar = avatarMatch[1].trim();
    }

    // Verify avatar file actually exists on disk
    if (avatar && !avatar.startsWith("http") && !avatar.startsWith("data:")) {
      try { await stat(join(getWorkspace(), avatar)); } catch { avatar = null; }
    }

    // Also try SOUL.md for the one-liner title
    try {
      const soul = await readFile(join(getWorkspace(), "SOUL.md"), "utf-8");
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
    const raw = await readFile(join(getWorkspace(), "IDENTITY.md"), "utf-8");
    const match = raw.match(/\*\*Avatar:\*\*\s*(.+)/);
    if (!match || !isAvatarPath(match[1].trim())) { res.status(404).send("No avatar"); return; }

    const avatarPath = join(getWorkspace(), match[1].trim());
    const data = await readFile(avatarPath);
    res.type("png").send(data);
  } catch {
    res.status(404).send("Avatar not found");
  }
});
