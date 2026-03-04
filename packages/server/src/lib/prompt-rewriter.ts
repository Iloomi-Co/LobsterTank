import { safeExec } from "./exec.js";

export interface RewriteResult {
  originalContent: string;
  rewrittenContent: string;
  explanation: string;
  confidence: "high" | "medium" | "low";
}

interface FeedbackHistoryEntry {
  rating: string;
  suggestion: string | null;
  timestamp: string;
}

/**
 * Uses openclaw agent to rewrite a heredoc prompt based on user feedback.
 * Includes last run output and feedback history for better context.
 */
export async function rewritePrompt(
  originalContent: string,
  suggestion: string,
  scriptName: string,
  containsVariables: boolean,
  lastOutput?: string | null,
  feedbackHistory?: FeedbackHistoryEntry[],
): Promise<RewriteResult> {
  const variableWarning = containsVariables
    ? "\nCRITICAL: The prompt contains shell variables like $VARIABLE_NAME. You MUST preserve ALL variable references exactly as they appear. Do not change, remove, or rename any $VARIABLE."
    : "";

  const lastOutputSection = lastOutput
    ? `\n## Last Output This Prompt Produced\n<output>\n${lastOutput.slice(0, 3000)}\n</output>\n`
    : "";

  const historySection = feedbackHistory && feedbackHistory.length > 0
    ? `\n## Feedback History (last ${feedbackHistory.length} entries)\n<history>\n${feedbackHistory.map((h) => `${h.timestamp} — ${h.rating}${h.suggestion ? `: ${h.suggestion}` : ""}`).join("\n")}\n</history>\n`
    : "";

  const prompt = `You are editing an LLM agent prompt that lives inside a bash wrapper script. Your job is to modify the prompt based on user feedback.

Rules:
- Modify ONLY what the feedback asks for. Do not rewrite sections the user didn't mention.
- Preserve ALL template variables exactly as they appear (e.g., $EMAIL_DATA, $GITHUB_DATA, $TODAY, $TIME). These are injected by the bash script at runtime.
- Preserve the overall structure and section headers unless the feedback specifically asks to reorganize.
- Preserve all tool/API references (himalaya, MCPorter, GitHub repo names, etc.) — these are real integrations the agent depends on.
- Preserve all "Rules" or "Do not" sections at the bottom unless the feedback contradicts them.
- Do not add commentary or explanations. Return ONLY the JSON response.
${variableWarning}

## Current Prompt
<prompt>
${originalContent}
</prompt>
${lastOutputSection}${historySection}
## Current Feedback
Rating: thumbs_down
Note: "${suggestion}"

## Task
Revise the prompt to address the feedback. Return as JSON:

{
  "rewrittenContent": "the complete revised prompt text",
  "explanation": "brief description of what changed",
  "confidence": "high" | "medium" | "low"
}

Return ONLY the JSON object.`;

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
    // JSON parse failed
  }

  return {
    originalContent,
    rewrittenContent: originalContent,
    explanation: "Could not parse LLM response",
    confidence: "low",
  };
}
