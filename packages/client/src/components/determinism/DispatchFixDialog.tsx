import { useState } from "react";
import { api } from "../../api/client.js";
import styles from "./DispatchFixDialog.module.css";

interface Finding {
  id: string;
  category: string;
  severity: string;
  file: string | null;
  line: number | null;
  excerpt: string;
  context: string;
  suggestedAction: string;
  llmReview?: {
    isNonDeterministic: string;
    reasoning: string;
    suggestedRewrite: string | null;
    confidence: string;
  };
}

interface DispatchFixDialogProps {
  finding: Finding;
  onClose: () => void;
}

function buildDefaultInstruction(finding: Finding): string {
  const lines: string[] = [];
  lines.push(`Fix the following non-deterministic pattern in the OC workspace:`);
  lines.push(``);
  if (finding.file) {
    lines.push(`File: ${finding.file}${finding.line ? `:${finding.line}` : ""}`);
  }
  lines.push(`Category: ${finding.category}`);
  lines.push(`Excerpt: ${finding.excerpt}`);
  lines.push(``);
  lines.push(`Suggested action: ${finding.suggestedAction}`);
  if (finding.llmReview?.suggestedRewrite) {
    lines.push(``);
    lines.push(`Suggested rewrite:`);
    lines.push(finding.llmReview.suggestedRewrite);
  }
  lines.push(``);
  lines.push(`Important: Make the minimum change needed. Do not alter unrelated code.`);
  return lines.join("\n");
}

export function DispatchFixDialog({ finding, onClose }: DispatchFixDialogProps) {
  const [instruction, setInstruction] = useState(() => buildDefaultInstruction(finding));
  const [dispatching, setDispatching] = useState(false);
  const [result, setResult] = useState<{
    dispatched: boolean;
    sessionId: string;
    ocResponse: string;
    exitCode: number;
    snapshotHash: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDispatch = async () => {
    setDispatching(true);
    setError(null);
    try {
      const res = await api.determinismDispatch(finding.id, instruction);
      if (res.ok && res.data) {
        setResult(res.data);
      } else {
        setError(res.error ?? "Dispatch failed");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>Dispatch Fix to OC</h3>
        <div className={styles.findingInfo}>
          <span className={styles.findingId}>{finding.id}</span>
          <span className={styles.findingExcerpt}>{finding.excerpt}</span>
        </div>

        {!result ? (
          <>
            <label className={styles.label}>Instruction for OC agent:</label>
            <textarea
              className={styles.textarea}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={12}
              disabled={dispatching}
            />

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.actions}>
              <button className={styles.cancelBtn} onClick={onClose} disabled={dispatching}>
                Cancel
              </button>
              <button
                className={styles.dispatchBtn}
                onClick={handleDispatch}
                disabled={dispatching || !instruction.trim()}
              >
                {dispatching ? "Dispatching..." : "Dispatch"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.resultSection}>
              <div className={styles.resultHeader}>
                {result.exitCode === 0 ? "Dispatched successfully" : "Dispatch completed with errors"}
              </div>
              <div className={styles.resultDetail}>
                <label>Session:</label>
                <span>{result.sessionId}</span>
              </div>
              {result.snapshotHash && (
                <div className={styles.resultDetail}>
                  <label>Snapshot:</label>
                  <span className={styles.mono}>{result.snapshotHash}</span>
                </div>
              )}
              {result.ocResponse && (
                <pre className={styles.ocResponse}>{result.ocResponse}</pre>
              )}
            </div>
            <div className={styles.actions}>
              <button className={styles.cancelBtn} onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
