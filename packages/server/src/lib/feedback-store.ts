import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import { DASHBOARD_STATE_DIR } from "../config.js";
import { ensureDir } from "./file-reader.js";

const FEEDBACK_DIR = join(DASHBOARD_STATE_DIR, "feedback");

export interface FeedbackEntry {
  id: string;
  scriptName: string;
  timestamp: string;
  rating: "up" | "down";
  suggestion: string | null;
  promptHash: string;
  heredocId: string | null;
  applied: boolean;
  rewriteSnapshot: string | null;
}

function feedbackPath(scriptName: string): string {
  return join(FEEDBACK_DIR, `${scriptName}.json`);
}

export function hashPrompt(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

async function readFeedbackFile(scriptName: string): Promise<FeedbackEntry[]> {
  try {
    const raw = await readFile(feedbackPath(scriptName), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeFeedbackFile(scriptName: string, entries: FeedbackEntry[]): Promise<void> {
  await ensureDir(FEEDBACK_DIR);
  await writeFile(feedbackPath(scriptName), JSON.stringify(entries, null, 2));
}

export async function saveFeedback(entry: FeedbackEntry): Promise<void> {
  const entries = await readFeedbackFile(entry.scriptName);
  entries.push(entry);
  await writeFeedbackFile(entry.scriptName, entries);
}

export async function getFeedback(scriptName: string): Promise<FeedbackEntry[]> {
  return readFeedbackFile(scriptName);
}

export async function markFeedbackApplied(
  scriptName: string,
  feedbackId: string,
  snapshotHash: string | null,
): Promise<void> {
  const entries = await readFeedbackFile(scriptName);
  const entry = entries.find((e) => e.id === feedbackId);
  if (entry) {
    entry.applied = true;
    entry.rewriteSnapshot = snapshotHash;
    await writeFeedbackFile(scriptName, entries);
  }
}

export async function getLatestFeedback(scriptName: string): Promise<FeedbackEntry | null> {
  const entries = await readFeedbackFile(scriptName);
  return entries.length > 0 ? entries[entries.length - 1] : null;
}
