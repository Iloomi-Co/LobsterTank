import { Router } from "express";
import type { ApiResponse, OllamaModel } from "../types/index.js";
import { safeExec } from "../lib/exec.js";

export const ollamaRoutes = Router();

ollamaRoutes.get("/", async (_req, res) => {
  try {
    // Get installed models
    const listResult = await safeExec("ollama", ["list"]);
    const models: OllamaModel[] = [];

    if (listResult.exitCode === 0) {
      const lines = listResult.stdout.split("\n").slice(1).filter(Boolean);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          // Format: NAME  ID  SIZE(+unit)  MODIFIED
          // e.g. "qwen3:14b  bdbd181c33f2  9.3 GB  12 hours ago"
          const name = parts[0];
          const sizeVal = parts[2];
          const sizeUnit = parts[3];
          const size = sizeVal === "-" ? "cloud" : `${sizeVal} ${sizeUnit}`;
          const modified = parts.slice(sizeVal === "-" ? 3 : 4).join(" ");
          models.push({ name, size, modified, isRunning: false });
        }
      }
    }

    // Get running models
    const psResult = await safeExec("ollama", ["ps"]);
    if (psResult.exitCode === 0) {
      const runningLines = psResult.stdout.split("\n").slice(1).filter(Boolean);
      for (const line of runningLines) {
        const name = line.trim().split(/\s+/)[0];
        const model = models.find((m) => m.name === name);
        if (model) {
          model.isRunning = true;
        }
      }
    }

    const response: ApiResponse<OllamaModel[]> = {
      ok: true,
      data: models,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (e: any) {
    res.json({ ok: false, error: e.message, timestamp: new Date().toISOString() });
  }
});
