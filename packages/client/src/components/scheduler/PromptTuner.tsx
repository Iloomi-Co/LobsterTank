import { useState, useEffect } from "react";
import { api } from "../../api/client.js";
import { DiffViewer } from "./DiffViewer.js";
import styles from "./PromptTuner.module.css";

type TunerState = "idle" | "rewriting" | "reviewing" | "applying" | "done" | "error";

interface PromptTunerProps {
  scriptName: string;
  suggestion: string;
  heredocId?: string;
  feedbackId?: string;
  onDone: () => void;
  onClose: () => void;
}

export function PromptTuner({ scriptName, suggestion, heredocId, feedbackId, onDone, onClose }: PromptTunerProps) {
  const [state, setState] = useState<TunerState>("idle");
  const [rewriteData, setRewriteData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [commitHash, setCommitHash] = useState<string | null>(null);

  useEffect(() => {
    startRewrite();
  }, []);

  const startRewrite = async () => {
    setState("rewriting");
    setError(null);

    const res = await api.schedulerRewritePrompt(scriptName, suggestion, heredocId);
    if (res.ok && res.data) {
      setRewriteData(res.data);
      setState("reviewing");
    } else {
      setError(res.error ?? "Rewrite failed");
      setState("error");
    }
  };

  const handleAccept = async () => {
    if (!rewriteData) return;
    setState("applying");

    const res = await api.schedulerApplyRewrite(
      scriptName,
      rewriteData.heredocId,
      rewriteData.rewrittenContent,
      feedbackId,
    );

    if (res.ok && res.data) {
      setCommitHash(res.data.commitHash);
      setState("done");
      onDone();
    } else {
      setError(res.error ?? "Apply failed");
      setState("error");
    }
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
            <button className={styles.rejectBtn} onClick={onClose}>
              Reject
            </button>
          </div>
        </>
      )}

      {state === "applying" && (
        <div className={styles.loading}>Applying rewrite...</div>
      )}

      {state === "done" && (
        <>
          <div className={styles.successMsg}>
            Prompt updated successfully{commitHash ? ` (commit ${commitHash})` : ""}
          </div>
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
