import { Router } from "express";
import { join, relative } from "path";
import { readFile, readdir, stat } from "fs/promises";
import type { ApiResponse } from "../types/index.js";
import { OC_HOME, OC_LOGS_DIR, OC_CONFIG } from "../config.js";

export const memoryRoutes = Router();

/* ── Bootstrap file names (injected into every conversation) ── */

const BOOTSTRAP_FILES = [
  "AGENTS.md",
  "SOUL.md",
  "TOOLS.md",
  "IDENTITY.md",
  "USER.md",
  "HEARTBEAT.md",
  "BOOT.md",
  "MEMORY.md",
];

const MEMORY_LINE_LIMIT = 200;
const STALE_DAYS = 7;

/* ── Helpers ── */

function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

function daysSince(iso: string | null): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

async function fileStat(path: string) {
  try {
    const content = await readFile(path, "utf-8");
    const s = await stat(path);
    return {
      exists: true,
      chars: content.length,
      lines: content.split("\n").length,
      tokens: estimateTokens(content.length),
      modifiedAt: s.mtime.toISOString(),
      content,
    };
  } catch {
    return { exists: false, chars: 0, lines: 0, tokens: 0, modifiedAt: null, content: "" };
  }
}

/** Recursively enumerate markdown/json files in a directory */
async function enumerateDir(
  dir: string,
  baseDir: string,
): Promise<{ path: string; name: string; chars: number; tokens: number; lines: number; modifiedAt: string }[]> {
  const results: { path: string; name: string; chars: number; tokens: number; lines: number; modifiedAt: string }[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        const sub = await enumerateDir(full, baseDir);
        results.push(...sub);
      } else if (e.isFile() && /\.(md|json|txt|jsonl)$/i.test(e.name)) {
        try {
          const content = await readFile(full, "utf-8");
          const s = await stat(full);
          results.push({
            path: relative(baseDir, full),
            name: e.name,
            chars: content.length,
            tokens: estimateTokens(content.length),
            lines: content.split("\n").length,
            modifiedAt: s.mtime.toISOString(),
          });
        } catch {}
      }
    }
  } catch {}
  return results;
}

/** Parse MEMORY.md into sections */
function parseMemorySections(content: string): { heading: string; lineStart: number; lineCount: number; tokens: number; preview: string }[] {
  const lines = content.split("\n");
  const sections: { heading: string; lineStart: number; lineCount: number; tokens: number; preview: string }[] = [];
  let currentHeading = "";
  let currentStart = 0;
  let currentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      // Flush previous section
      if (currentHeading) {
        const body = currentLines.join("\n");
        sections.push({
          heading: currentHeading,
          lineStart: currentStart,
          lineCount: currentLines.length,
          tokens: estimateTokens(body.length),
          preview: currentLines
            .filter((l) => l.trim() && !l.startsWith("#"))
            .slice(0, 2)
            .join(" ")
            .slice(0, 120),
        });
      }
      currentHeading = line.replace(/^#+\s*/, "");
      currentStart = i + 1;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  // Flush last section
  if (currentHeading) {
    const body = currentLines.join("\n");
    sections.push({
      heading: currentHeading,
      lineStart: currentStart,
      lineCount: currentLines.length,
      tokens: estimateTokens(body.length),
      preview: currentLines
        .filter((l) => l.trim() && !l.startsWith("#"))
        .slice(0, 2)
        .join(" ")
        .slice(0, 120),
    });
  }
  return sections;
}

async function getDailyNotes(memoryDir: string) {
  try {
    const entries = await readdir(memoryDir);
    const notes: { name: string; date: string | null; chars: number; tokens: number; modifiedAt: string }[] = [];
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      const full = join(memoryDir, name);
      const s = await stat(full);
      if (!s.isFile()) continue;
      const content = await readFile(full, "utf-8");
      const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})/);
      notes.push({
        name,
        date: dateMatch ? dateMatch[1] : null,
        chars: content.length,
        tokens: estimateTokens(content.length),
        modifiedAt: s.mtime.toISOString(),
      });
    }
    notes.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    return notes;
  } catch {
    return [];
  }
}

// Core files every agent should have. BOOT.md is optional (only main workspace uses it).
const REQUIRED_FILES = ["AGENTS.md", "SOUL.md", "IDENTITY.md", "MEMORY.md"];

/** Compute health diagnostics for an agent */
function computeHealth(
  bootstrapFiles: { name: string; exists: boolean; chars: number; modifiedAt: string | null }[],
  memoryLines: number,
  memoryModified: string | null,
  dailyNoteCount: number,
) {
  const issues: { level: "critical" | "warning" | "info"; message: string }[] = [];

  // Missing required bootstrap files (only flag core files, not optional ones like BOOT.md)
  for (const f of bootstrapFiles) {
    if (!f.exists && REQUIRED_FILES.includes(f.name)) {
      issues.push({ level: "warning", message: `${f.name} is missing` });
    }
  }

  // Empty required files (exists but < 20 chars)
  for (const f of bootstrapFiles) {
    if (f.exists && f.chars < 20 && REQUIRED_FILES.includes(f.name)) {
      issues.push({ level: "warning", message: `${f.name} is nearly empty (${f.chars} chars)` });
    }
  }

  // MEMORY.md over line limit
  if (memoryLines > MEMORY_LINE_LIMIT) {
    issues.push({
      level: "critical",
      message: `MEMORY.md exceeds ${MEMORY_LINE_LIMIT}-line limit (${memoryLines} lines) — compaction needed`,
    });
  } else if (memoryLines > MEMORY_LINE_LIMIT * 0.8) {
    issues.push({
      level: "warning",
      message: `MEMORY.md approaching limit (${memoryLines}/${MEMORY_LINE_LIMIT} lines)`,
    });
  }

  // Stale MEMORY.md — only flag if very stale (>14 days)
  const memDays = daysSince(memoryModified);
  if (memoryModified && memDays > 14) {
    issues.push({
      level: "info",
      message: `MEMORY.md not updated in ${memDays} days`,
    });
  }

  // No daily notes
  if (dailyNoteCount === 0) {
    issues.push({ level: "info", message: "No daily session notes found" });
  }

  // Oversized AGENTS.md — info, not warning (it works, just uses more context)
  const agentsMd = bootstrapFiles.find((f) => f.name === "AGENTS.md");
  if (agentsMd && agentsMd.chars > 12_000) {
    issues.push({
      level: "info",
      message: `AGENTS.md is ${(agentsMd.chars / 1000).toFixed(1)}k chars — could trim to save context`,
    });
  }

  const status: "healthy" | "warning" | "critical" =
    issues.some((i) => i.level === "critical")
      ? "critical"
      : issues.some((i) => i.level === "warning")
        ? "warning"
        : "healthy";

  return { status, issues };
}

/* ── Read agent display name from IDENTITY.md ── */

async function readAgentName(workspacePath: string): Promise<string | null> {
  try {
    const raw = await readFile(join(workspacePath, "IDENTITY.md"), "utf-8");
    const match = raw.match(/\*\*Name:\*\*\s*(.+)/);
    if (match) {
      const name = match[1].trim();
      // Skip template placeholders
      if (name && !name.startsWith("_(")) return name;
    }
  } catch {}
  return null;
}

/* ── Read memory system config ── */

async function readMemorySystem(): Promise<{ backend: string; details: Record<string, any> }> {
  try {
    const raw = await readFile(OC_CONFIG, "utf-8");
    const cfg = JSON.parse(raw);
    const backend = cfg?.memory?.backend ?? "default";
    return { backend, details: cfg?.memory ?? {} };
  } catch {
    return { backend: "default", details: {} };
  }
}

/* ── Discover agent workspaces ── */

async function discoverAgents(): Promise<{ name: string; displayName: string; workspace: string }[]> {
  const agents: { name: string; displayName: string; workspace: string }[] = [];
  const mainWs = join(OC_HOME, "workspace");
  const mainName = await readAgentName(mainWs);
  agents.push({ name: "main", displayName: mainName ?? "main", workspace: mainWs });
  try {
    const entries = await readdir(OC_HOME);
    for (const e of entries) {
      if (e.startsWith("workspace-")) {
        const agentId = e.replace("workspace-", "");
        const wsPath = join(OC_HOME, e);
        const displayName = await readAgentName(wsPath) ?? agentId;
        agents.push({ name: agentId, displayName, workspace: wsPath });
      }
    }
  } catch {}
  return agents;
}

/* ── GET /api/memory ── */

memoryRoutes.get("/", async (_req, res) => {
  try {
    const agents = await discoverAgents();
    const memorySystem = await readMemorySystem();
    const agentData = await Promise.all(
      agents.map(async ({ name, displayName, workspace }) => {
        // Bootstrap files
        const bootstrapFiles = await Promise.all(
          BOOTSTRAP_FILES.map(async (fileName) => {
            const info = await fileStat(join(workspace, fileName));
            return { name: fileName, exists: info.exists, chars: info.chars, lines: info.lines, tokens: info.tokens, modifiedAt: info.modifiedAt };
          }),
        );
        const bootstrapTotal = bootstrapFiles.reduce((sum, f) => sum + f.tokens, 0);

        // Daily notes
        const dailyNotes = await getDailyNotes(join(workspace, "memory"));
        const dailyNotesTotal = dailyNotes.reduce((sum, n) => sum + n.tokens, 0);

        // MEMORY.md detail
        const memoryMd = bootstrapFiles.find((f) => f.name === "MEMORY.md");
        const memoryLines = memoryMd?.lines ?? 0;

        // Parse MEMORY.md sections
        const memoryContent = (await fileStat(join(workspace, "MEMORY.md"))).content;
        const memorySections = memoryContent ? parseMemorySections(memoryContent) : [];

        // Enumerate docs/ and config/
        const docsFiles = await enumerateDir(join(workspace, "docs"), workspace);
        const configFiles = await enumerateDir(join(workspace, "config"), workspace);

        // Health diagnostics
        const health = computeHealth(bootstrapFiles, memoryLines, memoryMd?.modifiedAt ?? null, dailyNotes.length);

        return {
          name,
          displayName,
          workspace,
          bootstrap: {
            files: bootstrapFiles,
            totalChars: bootstrapFiles.reduce((s, f) => s + f.chars, 0),
            totalTokens: bootstrapTotal,
            fileCount: bootstrapFiles.filter((f) => f.exists).length,
          },
          dailyNotes: {
            notes: dailyNotes,
            totalChars: dailyNotes.reduce((s, n) => s + n.chars, 0),
            totalTokens: dailyNotesTotal,
            count: dailyNotes.length,
          },
          memory: {
            lines: memoryLines,
            tokens: memoryMd?.tokens ?? 0,
            chars: memoryMd?.chars ?? 0,
            modifiedAt: memoryMd?.modifiedAt ?? null,
            sections: memorySections,
            lineLimit: MEMORY_LINE_LIMIT,
          },
          docs: {
            files: docsFiles,
            totalChars: docsFiles.reduce((s, f) => s + f.chars, 0),
            totalTokens: docsFiles.reduce((s, f) => s + f.tokens, 0),
            count: docsFiles.length,
          },
          config: {
            files: configFiles,
            totalChars: configFiles.reduce((s, f) => s + f.chars, 0),
            totalTokens: configFiles.reduce((s, f) => s + f.tokens, 0),
            count: configFiles.length,
          },
          health,
        };
      }),
    );

    // Cross-agent totals
    const totalBootstrapTokens = agentData.reduce((s, a) => s + a.bootstrap.totalTokens, 0);
    const totalDailyNoteTokens = agentData.reduce((s, a) => s + a.dailyNotes.totalTokens, 0);
    const totalAgents = agentData.length;
    const healthyCt = agentData.filter((a) => a.health.status === "healthy").length;
    const warningCt = agentData.filter((a) => a.health.status === "warning").length;
    const criticalCt = agentData.filter((a) => a.health.status === "critical").length;

    const response: ApiResponse = {
      ok: true,
      data: {
        agents: agentData,
        totals: {
          agents: totalAgents,
          bootstrapTokens: totalBootstrapTokens,
          dailyNoteTokens: totalDailyNoteTokens,
          totalMemoryTokens: totalBootstrapTokens + totalDailyNoteTokens,
          healthy: healthyCt,
          warning: warningCt,
          critical: criticalCt,
        },
        memorySystem,
        contextWindows: {
          "claude-sonnet-4-20250514": 200_000,
          "claude-opus-4-20250514": 200_000,
          "claude-haiku-3-5-20241022": 200_000,
          "gemini-2.0-flash": 1_000_000,
          "deepseek-r1:14b": 128_000,
        },
      },
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

/* ── GET /api/memory/:agent/file/:fileName ── */

memoryRoutes.get("/:agent/file/:fileName", async (req, res) => {
  try {
    const { agent, fileName } = req.params;
    if (!BOOTSTRAP_FILES.includes(fileName)) {
      res.json({ ok: false, error: "File not in bootstrap list", timestamp: new Date().toISOString() });
      return;
    }
    const workspace = agent === "main"
      ? join(OC_HOME, "workspace")
      : join(OC_HOME, `workspace-${agent}`);
    const content = await readFile(join(workspace, fileName), "utf-8");
    const response: ApiResponse = {
      ok: true,
      data: { content, chars: content.length, tokens: estimateTokens(content.length) },
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

/* ── POST /api/memory/:agent/query ── */
/* Sends a prompt to the agent via `openclaw agent` and returns the response */

memoryRoutes.post("/:agent/query", async (req, res) => {
  try {
    const { agent } = req.params;
    const { message } = req.body;
    if (!message || typeof message !== "string" || !message.trim()) {
      res.json({ ok: false, error: "Missing message in request body", timestamp: new Date().toISOString() });
      return;
    }

    const { safeExec } = await import("../lib/exec.js");

    // Build args for openclaw agent
    const ocAgent = agent === "main" ? "main" : agent;
    // Wrap the user's question with instructions to search memory files
    const wrappedMessage = `You are being queried from the Poseidon memory dashboard. The user wants to test what you know. Answer the following question using your bootstrap context AND by searching your workspace files (memory/, docs/, config/) if needed. Be thorough — search before saying you don't know.\n\nQuestion: ${message.trim()}`;
    const args = ["agent", "--agent", ocAgent, "--message", wrappedMessage, "--thinking", "off"];

    const result = await safeExec("openclaw", args, { timeout: 120_000 });

    if (result.exitCode !== 0) {
      res.json({
        ok: false,
        error: result.stderr || `openclaw agent exited with code ${result.exitCode}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.json({
      ok: true,
      data: { response: result.stdout.trim(), agent },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});
