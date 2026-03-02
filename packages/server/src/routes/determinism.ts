import { Router } from "express";
import type { ApiResponse } from "../types/index.js";
import { safeExec } from "../lib/exec.js";
import { logAction } from "../lib/action-logger.js";
import { ensureGitRepo, snapshot } from "../lib/git.js";
import { OC_HOME } from "../config.js";
import {
  runDeterminismScan,
  formatExport,
  buildDeepScanPrompt,
  type ScanResult,
  type Finding,
} from "../lib/determinism-scanner.js";

export const determinismRoutes = Router();

// Cache the last scan result so deep-scan and export can reference it
let lastScan: ScanResult | null = null;

// --- GET / (scan) — Layer 1 only ---

determinismRoutes.get("/scan", async (_req, res) => {
  try {
    const scan = await runDeterminismScan();
    lastScan = scan;

    const response: ApiResponse<ScanResult> = {
      ok: true,
      data: scan,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- POST /deep-scan — Layer 2 via openclaw agent ---

determinismRoutes.post("/deep-scan", async (req, res) => {
  const { findingIds } = req.body as { findingIds?: string[] };

  if (!lastScan) {
    res.status(400).json({
      ok: false,
      error: "No scan results available. Run a scan first.",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const targetFindings = findingIds
      ? lastScan.findings.filter((f) => findingIds.includes(f.id))
      : lastScan.findings.filter((f) => f.severity !== "info");

    if (targetFindings.length === 0) {
      res.json({
        ok: true,
        data: { findings: [], reviewed: 0 },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    await logAction("DETERMINISM_DEEP_SCAN", `Reviewing ${targetFindings.length} findings via OC`);

    const reviewed: Finding[] = [];

    for (const finding of targetFindings) {
      const prompt = buildDeepScanPrompt(finding);
      const sessionId = `lt-deepscan-${Date.now()}-${finding.id}`;

      const result = await safeExec(
        "openclaw",
        ["agent", "--agent", "main", "--session-id", sessionId, "--message", prompt],
        { timeout: 30000 },
      );

      if (result.exitCode === 0 && result.stdout.trim()) {
        try {
          // Try to parse JSON from the response
          const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const review = JSON.parse(jsonMatch[0]);
            finding.llmReview = {
              isNonDeterministic: review.isNonDeterministic ?? "maybe",
              reasoning: review.reasoning ?? "No reasoning provided",
              suggestedRewrite: review.suggestedRewrite ?? null,
              confidence: review.confidence ?? "low",
            };
          } else {
            finding.llmReview = {
              isNonDeterministic: "maybe",
              reasoning: result.stdout.trim().slice(0, 300),
              suggestedRewrite: null,
              confidence: "low",
            };
          }
        } catch {
          finding.llmReview = {
            isNonDeterministic: "maybe",
            reasoning: result.stdout.trim().slice(0, 300),
            suggestedRewrite: null,
            confidence: "low",
          };
        }
      } else {
        finding.llmReview = {
          isNonDeterministic: "maybe",
          reasoning: "OC agent did not return a response",
          suggestedRewrite: null,
          confidence: "low",
        };
      }

      reviewed.push(finding);
    }

    // Update lastScan with enriched findings
    for (const r of reviewed) {
      const idx = lastScan.findings.findIndex((f) => f.id === r.id);
      if (idx >= 0) lastScan.findings[idx] = r;
    }

    res.json({
      ok: true,
      data: { findings: reviewed, reviewed: reviewed.length },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- POST /dispatch — Send fix instruction to OC ---

determinismRoutes.post("/dispatch", async (req, res) => {
  const { findingId, instruction } = req.body as {
    findingId: string;
    instruction: string;
  };

  if (!instruction || typeof instruction !== "string") {
    res.status(400).json({
      ok: false,
      error: "Missing instruction",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    // Git snapshot before dispatch
    await ensureGitRepo(OC_HOME);
    const snap = await snapshot(
      OC_HOME,
      `LobsterTank: pre-dispatch snapshot for ${findingId ?? "fix"}`,
    );

    await logAction(
      "DETERMINISM_DISPATCH",
      `Finding: ${findingId ?? "manual"} | Instruction: ${instruction.slice(0, 200)}`,
    );

    const sessionId = `lt-dispatch-${Date.now()}`;
    const result = await safeExec(
      "openclaw",
      ["agent", "--agent", "main", "--session-id", sessionId, "--message", instruction],
      { timeout: 60000 },
    );

    res.json({
      ok: true,
      data: {
        dispatched: true,
        sessionId,
        ocResponse: result.stdout.trim().slice(0, 1000),
        exitCode: result.exitCode,
        snapshotHash: snap?.hash ?? null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// --- GET /export — Formatted text for clipboard ---

determinismRoutes.get("/export", async (_req, res) => {
  if (!lastScan) {
    res.status(400).json({
      ok: false,
      error: "No scan results available. Run a scan first.",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const text = formatExport(lastScan);
    res.json({
      ok: true,
      data: { text, findingsCount: lastScan.findings.length },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});
