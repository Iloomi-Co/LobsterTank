import { safeExec } from "./exec.js";
import { fileStat } from "./file-reader.js";
import { join } from "path";

async function git(dir: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return safeExec("git", ["-C", dir, ...args], { timeout: 10000 });
}

export async function isGitRepo(dir: string): Promise<boolean> {
  const stat = await fileStat(join(dir, ".git"));
  return stat !== null;
}

export async function gitInit(dir: string): Promise<boolean> {
  const result = await git(dir, ["init"]);
  return result.exitCode === 0;
}

export async function gitAddGitignore(dir: string, lines: string[]): Promise<void> {
  const { writeFile, readFile } = await import("fs/promises");
  const gitignorePath = join(dir, ".gitignore");
  let existing = "";
  try {
    existing = await readFile(gitignorePath, "utf-8");
  } catch {}
  const existingLines = new Set(existing.split("\n").map((l) => l.trim()));
  const newLines = lines.filter((l) => !existingLines.has(l));
  if (newLines.length > 0) {
    const content = existing.trimEnd() + "\n" + newLines.join("\n") + "\n";
    await writeFile(gitignorePath, content);
  }
}

export async function isClean(dir: string): Promise<boolean> {
  const result = await git(dir, ["status", "--porcelain"]);
  return result.stdout.trim() === "";
}

export async function snapshot(dir: string, message: string): Promise<{ committed: boolean; hash?: string }> {
  // Stage all changes
  await git(dir, ["add", "-A"]);

  // Check if there's anything to commit
  const clean = await isClean(dir);
  if (clean) {
    return { committed: false };
  }

  const result = await git(dir, ["commit", "-m", message]);
  if (result.exitCode !== 0) {
    return { committed: false };
  }

  const hashResult = await git(dir, ["rev-parse", "--short", "HEAD"]);
  return { committed: true, hash: hashResult.stdout.trim() };
}

export async function getLog(dir: string, count = 20): Promise<string[]> {
  const result = await git(dir, ["log", "--oneline", `-${count}`]);
  if (result.exitCode !== 0) return [];
  return result.stdout.trim().split("\n").filter(Boolean);
}

export async function getLastCommit(dir: string): Promise<{ hash: string; message: string; date: string } | null> {
  const hashResult = await git(dir, ["log", "-1", "--format=%h"]);
  const msgResult = await git(dir, ["log", "-1", "--format=%s"]);
  const dateResult = await git(dir, ["log", "-1", "--format=%ai"]);
  if (hashResult.exitCode !== 0 || !hashResult.stdout.trim()) return null;
  return {
    hash: hashResult.stdout.trim(),
    message: msgResult.stdout.trim(),
    date: dateResult.stdout.trim(),
  };
}

export async function getDiff(dir: string, ref = "HEAD~1"): Promise<string> {
  const result = await git(dir, ["diff", ref]);
  return result.stdout;
}

export async function revertLast(dir: string): Promise<boolean> {
  const result = await git(dir, ["revert", "HEAD", "--no-edit"]);
  return result.exitCode === 0;
}

export async function ensureGitRepo(dir: string): Promise<boolean> {
  if (await isGitRepo(dir)) return true;

  const inited = await gitInit(dir);
  if (!inited) return false;

  await gitAddGitignore(dir, [
    ".env",
    "*.key",
    "auth-profiles.json",
    "**/sessions/",
    "**/node_modules/",
    "**/.DS_Store",
  ]);

  await snapshot(dir, "LobsterTank: baseline snapshot before config sync");
  return true;
}
