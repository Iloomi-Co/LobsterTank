import { Router } from "express";
import { join } from "path";
import { writeFile, unlink, mkdir } from "fs/promises";
import type { ApiResponse } from "../types/index.js";
import { safeExec } from "../lib/exec.js";
import { logAction } from "../lib/action-logger.js";
import { OC_HOME, EXPECTED_CRON_ENTRIES, CRONTAB_PATH_LINE } from "../config.js";

export const crontabRoutes = Router();

function humanSchedule(schedule: string): string {
  if (schedule === "@reboot") return "On reboot";
  const [min, hour, dom, mon, dow] = schedule.split(" ");
  if (min.startsWith("*/")) return `Every ${min.slice(2)} minutes`;
  const days = dow === "*" ? "daily" : dow === "1" ? "Mondays" : dow === "1-5" ? "weekdays" : `day ${dow}`;
  const time = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  if (dom === "*" && mon === "*") return `${days} at ${time}`;
  return `${schedule}`;
}

crontabRoutes.get("/", async (_req, res) => {
  try {
    const result = await safeExec("crontab", ["-l"]);
    const raw = result.exitCode === 0 ? result.stdout : "";
    const lines = raw.split("\n");

    const pathLine = lines.find((l) => l.startsWith("PATH=")) ?? null;
    const hasPath = pathLine !== null;

    const entries = lines
      .filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("PATH=") && !l.startsWith("SHELL="))
      .map((l) => {
        const parts = l.trim().split(/\s+/);
        const isReboot = parts[0] === "@reboot";
        const schedule = isReboot ? "@reboot" : parts.slice(0, 5).join(" ");
        const command = isReboot ? parts.slice(1).join(" ") : parts.slice(5).join(" ");
        const scriptMatch = command.match(/([a-zA-Z0-9_-]+\.sh)/);
        return {
          schedule,
          scheduleHuman: humanSchedule(schedule),
          command,
          scriptName: scriptMatch?.[1] ?? "",
          type: isReboot ? "reboot" : "scheduled",
        };
      });

    const rebootEntries = entries.filter((e) => e.type === "reboot");
    const hasReboot = rebootEntries.length > 0;

    res.json({
      ok: true,
      data: { raw, pathLine, hasPath, entries, hasReboot, rebootEntries: rebootEntries.map((e) => e.command) },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

crontabRoutes.post("/install", async (req, res) => {
  const { entries: newEntries } = req.body as { entries?: string[] };

  try {
    await logAction("CRONTAB_INSTALL", `Adding ${(newEntries ?? EXPECTED_CRON_ENTRIES).length} entries`);

    const cronResult = await safeExec("crontab", ["-l"]);
    let currentCrontab = cronResult.exitCode === 0 ? cronResult.stdout.trimEnd() : "";

    // Ensure PATH line
    if (!currentCrontab.includes("PATH=")) {
      currentCrontab = CRONTAB_PATH_LINE + "\n" + currentCrontab;
    }

    // Add expected entries that are missing
    if (newEntries) {
      for (const entry of newEntries) {
        const scriptMatch = entry.match(/([a-zA-Z0-9_-]+\.sh)/);
        const scriptName = scriptMatch?.[1] ?? entry;
        if (!currentCrontab.includes(scriptName)) {
          currentCrontab += `\n${entry}`;
        }
      }
    } else {
      for (const expected of EXPECTED_CRON_ENTRIES) {
        if (!currentCrontab.includes(expected.match)) {
          currentCrontab += `\n${expected.schedule} ${expected.command}`;
        }
      }
    }

    // Fix keepalive
    currentCrontab = currentCrontab.replace(/--keepalive -1(?!s)/g, "--keepalive -1s");

    // Install
    const tmpFile = join(OC_HOME, "dashboard", ".crontab-tmp");
    await mkdir(join(OC_HOME, "dashboard"), { recursive: true });
    await writeFile(tmpFile, currentCrontab + "\n");
    const installResult = await safeExec("crontab", [tmpFile]);
    await unlink(tmpFile).catch(() => {});

    if (installResult.exitCode !== 0) {
      res.json({ ok: false, error: installResult.stderr, timestamp: new Date().toISOString() });
      return;
    }

    // Return updated crontab
    const updated = await safeExec("crontab", ["-l"]);
    res.json({ ok: true, data: { raw: updated.stdout, installed: true }, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});
