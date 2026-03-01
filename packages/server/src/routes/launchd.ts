import { Router } from "express";
import { join } from "path";
import { homedir } from "os";
import type { ApiResponse, LaunchdJob } from "../types/index.js";
import { safeExec } from "../lib/exec.js";
import { listDir } from "../lib/file-reader.js";
import { parsePlistFile } from "../lib/parse-plist.js";
import { logAction } from "../lib/action-logger.js";

export const launchdRoutes = Router();

const LAUNCH_AGENTS_DIR = join(homedir(), "Library/LaunchAgents");

function classifyJob(label: string, plistArgs?: string[]): "safe" | "rogue" | "unknown" {
  const combined = `${label} ${(plistArgs ?? []).join(" ")}`.toLowerCase();
  if (combined.includes("openclaw") || combined.includes("oc-gateway") || combined.includes("ai.openclaw")) {
    return "safe";
  }
  if (combined.includes("claw") || combined.includes("oc-")) {
    return "unknown";
  }
  return "unknown";
}

launchdRoutes.get("/", async (_req, res) => {
  try {
    // Get running launchd jobs
    const result = await safeExec("launchctl", ["list"]);
    const lines = result.stdout.split("\n").slice(1).filter(Boolean);

    // Scan plist files
    const { entries: plistFiles } = await listDir(LAUNCH_AGENTS_DIR);
    const ocPlistFiles = plistFiles.filter(
      (f) => f.endsWith(".plist") && (f.includes("claw") || f.includes("oc"))
    );

    const jobs: LaunchdJob[] = [];

    // Parse running jobs that look OC-related
    for (const line of lines) {
      const parts = line.trim().split(/\t+/);
      if (parts.length < 3) continue;
      const label = parts[2];
      if (!label.toLowerCase().includes("claw") && !label.toLowerCase().includes("openclaw")) continue;

      jobs.push({
        label,
        pid: parts[0] === "-" ? null : parseInt(parts[0], 10),
        status: parseInt(parts[1], 10) || 0,
        isOcRelated: true,
        classification: classifyJob(label),
      });
    }

    // Parse plist files for more detail
    for (const file of ocPlistFiles) {
      const fullPath = join(LAUNCH_AGENTS_DIR, file);
      const { data: plistData } = await parsePlistFile(fullPath);
      const label = plistData?.Label ?? file.replace(".plist", "");

      const existing = jobs.find((j) => j.label === label);
      if (existing) {
        existing.plistPath = fullPath;
        existing.classification = classifyJob(label, plistData?.ProgramArguments);
      } else {
        jobs.push({
          label,
          pid: null,
          status: 0,
          plistPath: fullPath,
          isOcRelated: true,
          classification: classifyJob(label, plistData?.ProgramArguments),
        });
      }
    }

    const response: ApiResponse<LaunchdJob[]> = {
      ok: true,
      data: jobs,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

launchdRoutes.post("/remove", async (req, res) => {
  const { label } = req.body;
  if (!label || typeof label !== "string") {
    res.status(400).json({ ok: false, error: "Invalid label", timestamp: new Date().toISOString() });
    return;
  }

  try {
    await logAction("REMOVE_LAUNCHD", `Label: ${label}`);
    const result = await safeExec("launchctl", ["remove", label]);
    res.json({
      ok: result.exitCode === 0,
      data: { label, removed: result.exitCode === 0 },
      error: result.exitCode !== 0 ? result.stderr : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});
