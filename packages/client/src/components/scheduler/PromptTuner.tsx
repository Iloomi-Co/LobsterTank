import { useState, useEffect } from "react";
import { api } from "../../api/client.js";
import { DiffViewer } from "./DiffViewer.js";
import styles from "./PromptTuner.module.css";

type TunerState = "idle" | "rewriting" | "reviewing" | "applying" | "running" | "done" | "error";

interface PromptTunerProps {
  scriptName: string;
  suggestion: string;
  heredocId?: string;
  feedbackId?: string;
  lastOutput?: string;
  onDone: () => void;
  onClose: () => void;
}

export function PromptTuner({ scriptName, suggestion, heredocId, feedbackId, lastOutput, onDone, onClose }: PromptTunerProps) {
  const [state, setState] = useState<TunerState>("idle");
  const [rewriteData, setRewriteData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [commitHash, setCommitHash] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<string | null>(null);

  useEffect(() => {
    startRewrite();
  }, []);

  const startRewrite = async () => {
    setState("rewriting");
    setError(null);

    const res = await api.schedulerRewritePrompt(scriptName, suggestion, heredocId, lastOutput);
    if (res.ok && res.data) {
      setRewriteData(res.data);
      setState("reviewing");
    } else {
      setError(res.error ?? "Rewrite failed");
      setState("error");
    }
  };

  const applyRewrite = async () => {
    if (!rewriteData) return;
    setState("applying");

    const res = await api.schedulerApplyRewrite(
      scriptName,
      rewriteData.heredocId,
      rewriteData.rewrittenContent,
      feedbackId,
      rewriteData.explanation,
    );

    if (res.ok && res.data) {
      setCommitHash(res.data.commitHash);
      return true;
    } else {
      setError(res.error ?? "Apply failed");
      setState("error");
      return false;
    }
  };

  const handleAccept = async () => {
    const ok = await applyRewrite();
    if (ok) {
      setState("done");
      onDone();
    }
  };

  const handleAcceptAndRun = async () => {
    const ok = await applyRewrite();
    if (!ok) return;

    setState("running");
    const runRes = await api.schedulerRunScript(scriptName);
    if (runRes.ok && runRes.data) {
      const d = runRes.data as { exitCode: number; output: string };
      setRunResult(d.exitCode === 0 ? "Script completed successfully" : `Script exited with code ${d.exitCode}`);
    } else {
      setRunResult("Failed to run script");
    }
    setState("done");
    onDone();
  };

  const handleRevert = async () => {
    const res = await api.schedulerRevertRewrite(scriptName);
    if (res.ok) {
      setCommitHash(null);
      setState("idle");
      onDone();
    } else {
      setError(res.error ?? "Revert failed");
    }
  };

  if (state === "idle") return null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Prompt Tuner</span>
      </div>

      {state === "rewriting" && (
        <div className={styles.loading}>Rewriting prompt via LLM...</div>
      )}

      {state === "reviewing" && rewriteData && (
        <>
          <div className={styles.explanation}>{rewriteData.explanation}</div>
          <div className={styles.confidence}>
            Confidence:{" "}
            <span
              className={
                rewriteData.confidence === "high" ? styles.confidenceHigh :
                rewriteData.confidence === "medium" ? styles.confidenceMedium :
                styles.confidenceLow
              }
            >
              {rewriteData.confidence}
            </span>
          </div>
          <div className={styles.diffSection}>
            <DiffViewer
              originalContent={rewriteData.originalContent}
              rewrittenContent={rewriteData.rewrittenContent}
            />
          </div>
          <div className={styles.actions}>
            <button className={styles.acceptBtn} onClick={handleAccept}>
              Accept & Apply
            </button>
            <button className={styles.acceptRunBtn} onClick={handleAcceptAndRun}>
              Apply & Run Now
            </button>
            <button className={styles.rejectBtn} onClick={onClose}>
              Reject
            </button>
          </div>
        </>
      )}

      {state === "applying" && (
        <div className={styles.loading}>Applying rewrite...</div>
      )}

      {state === "running" && (
        <div className={styles.loading}>Running script...</div>
      )}

      {state === "done" && (
        <>
          <div className={styles.successMsg}>
            Prompt updated successfully{commitHash ? ` (commit ${commitHash})` : ""}
          </div>
          {runResult && (
            <div className={styles.runResult}>{runResult}</div>
          )}
          <button className={styles.revertBtn} onClick={handleRevert}>
            Revert
          </button>
        </>
      )}

      {state === "error" && (
        <>
          <div className={styles.error}>{error}</div>
          <div className={styles.actions}>
            <button className={styles.rejectBtn} onClick={startRewrite}>
              Retry
            </button>
            <button className={styles.rejectBtn} onClick={onClose}>
              Close
            </button>
          </div>
        </>
      )}
    </div>
  );
}
