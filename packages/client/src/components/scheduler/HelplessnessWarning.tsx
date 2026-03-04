import { useState } from "react";
import styles from "./HelplessnessWarning.module.css";

interface HelplessnessPattern {
  type: "repeated-failure" | "capability-mismatch" | "stale-session";
  claimedLimitation: string;
  actualCapability?: string;
  toolsmdLastModified?: string;
  firstFailure?: string;
  lastFailure?: string;
  occurrences: number;
}

interface HelplessnessWarningProps {
  scriptName: string;
  agentName: string | null;
  patterns: HelplessnessPattern[];
  recommendation: string | null;
  onForceNewSession: (scriptName: string) => Promise<void>;
  onDismiss: (scriptName: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  "repeated-failure": "Repeated Failure",
  "capability-mismatch": "Capability Mismatch",
  "stale-session": "Stale Session",
};

export function HelplessnessWarning({
  scriptName,
  agentName,
  patterns,
  recommendation,
  onForceNewSession,
  onDismiss,
}: HelplessnessWarningProps) {
  const [forcing, setForcing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleForce = async () => {
    setForcing(true);
    setStatus("Bumping session & clearing memory...");
    try {
      await onForceNewSession(scriptName);
      setStatus("Done — session bumped, memory cleaned, script re-run.");
    } catch {
      setStatus("Error during reset.");
    } finally {
      setForcing(false);
    }
  };

  return (
    <div className={styles.warning}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.icon}>&#9888;</span>
          <span className={styles.title}>
            Learned Helplessness Detected
            <span className={styles.scriptLabel}>{scriptName}{agentName ? ` (${agentName})` : ""}</span>
          </span>
        </div>
        <button className={styles.dismissBtn} onClick={() => onDismiss(scriptName)} title="Dismiss">
          &#10005;
        </button>
      </div>

      <div className={styles.patterns}>
        {patterns.map((p, i) => (
          <div key={i} className={styles.pattern}>
            <span className={styles.patternType}>{TYPE_LABELS[p.type] ?? p.type}</span>
            {p.occurrences > 1 && <>({p.occurrences}x)</>}
            <span className={styles.claimed}>&ldquo;{p.claimedLimitation}&rdquo;</span>
            {p.actualCapability && (
              <span className={styles.actual}>{p.actualCapability}</span>
            )}
          </div>
        ))}
      </div>

      {recommendation && !status && (
        <div className={styles.recommendation}>{recommendation}</div>
      )}

      {status && (
        <div className={styles.status}>{status}</div>
      )}

      <div className={styles.actions}>
        <button
          className={styles.forceSessionBtn}
          onClick={handleForce}
          disabled={forcing}
        >
          {forcing ? "Resetting..." : "Force New Session"}
        </button>
      </div>
    </div>
  );
}
