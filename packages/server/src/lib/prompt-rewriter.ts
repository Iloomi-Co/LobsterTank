import { safeExec } from "./exec.js";

export interface RewriteResult {
  originalContent: string;
  rewrittenContent: string;
  explanation: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Uses openclaw agent to rewrite a heredoc prompt based on user feedback.
 * Follows the same pattern as determinism deep-scan.
 */
export async function rewritePrompt(
  originalContent: string,
  suggestion: string,
  scriptName: string,
  containsVariables: boolean,
): Promise<RewriteResult> {
  const variableWarning = containsVariables
    ? "\nCRITICAL: The prompt contains shell variables like $VARIABLE_NAME. You MUST preserve ALL variable references exactly as they appear. Do not change, remove, or rename any $VARIABLE."
    : "";

  const prompt = `You are a prompt-tuning assistant. A user has a shell script "${scriptName}" containing an LLM prompt as a heredoc block. They want to improve it.

CURRENT PROMPT CONTENT:
---
${originalContent}
---

USER FEEDBACK / IMPROVEMENT REQUEST:
${suggestion}
${variableWarning}

Rewrite ONLY the prompt content (the text between the heredoc delimiters). Return your response as a JSON object:

{
  "rewrittenContent": "the improved prompt text",
  "explanation": "brief explanation of what you changed and why",
  "confidence": "high" | "medium" | "low"
}

Return ONLY the JSON object, no other text.`;

  const sessionId = `lt-rewrite-${Date.now()}`;
  const result = await safeExec(
    "openclaw",
    ["agent", "--agent", "main", "--session-id", sessionId, "--message", prompt],
    { timeout: 30000 },
  );

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return {
      originalContent,
      rewrittenContent: originalContent,
      explanation: "LLM did not return a response",
      confidence: "low",
    };
  }

  try {
    const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        originalContent,
        rewrittenContent: parsed.rewrittenContent ?? originalContent,
        explanation: parsed.explanation ?? "No explanation provided",
        confidence: parsed.confidence ?? "medium",
      };
    }
  } catch {
    // JSON parse failed — use raw text as best-effort rewrite
  }

  return {
    originalContent,
    rewrittenContent: originalContent,
    explanation: "Could not parse LLM response",
    confidence: "low",
  };
}
