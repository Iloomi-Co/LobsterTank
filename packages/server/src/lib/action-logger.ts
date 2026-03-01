import { appendFile } from "fs/promises";
import { DASHBOARD_ACTIONS_LOG, DASHBOARD_STATE_DIR } from "../config.js";
import { ensureDir } from "./file-reader.js";

export async function logAction(action: string, details: string): Promise<void> {
  await ensureDir(DASHBOARD_STATE_DIR);
  const entry = `[${new Date().toISOString()}] ${action}: ${details}\n`;
  await appendFile(DASHBOARD_ACTIONS_LOG, entry);
}
