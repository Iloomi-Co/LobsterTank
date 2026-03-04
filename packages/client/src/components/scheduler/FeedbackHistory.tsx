import { useState } from "react";
import { api } from "../../api/client.js";
import styles from "./FeedbackHistory.module.css";

interface FeedbackEntry {
  id: string;
  scriptName: string;
  timestamp: string;
  rating: "up" | "down";
  suggestion: string | null;
  applied: boolean;
  rewriteSnapshot: string | null;
}

interface FeedbackHistoryProps {
  scriptName: string;
  entries: FeedbackEntry[];
  onReverted: () => void;
}

export function FeedbackHistory({ scriptName, entries, onReverted }: FeedbackHistoryProps) {
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  const lastApplied = [...entries].reverse().find((e) => e.applied);

  const handleRevert = async () => {
    const res = await api.schedulerRevertRewrite(scriptName);
    if (res.ok) {
      onReverted();
    }
  };

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
        " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch {
      return ts;
    }
  };

  return (
    <div className={styles.container}>
      <button className={styles.toggle} onClick={() => setOpen(!open)}>
        <span className={styles.arrow} data-open={open}>&#9654;</span>
        Feedback History ({entries.length})
      </button>

      {open && (
        <div className={styles.list}>
          {entries.slice().reverse().map((entry) => (
            <div key={entry.id} className={styles.entry}>
              <span className={styles.timestamp}>{formatTime(entry.timestamp)}</span>
              <span className={entry.rating === "up" ? styles.ratingUp : styles.ratingDown}>
                {entry.rating === "up" ? "+1" : "-1"}
              </span>
              {entry.suggestion && (
                <span className={styles.suggestion} title={entry.suggestion}>
                  {entry.suggestion}
                </span>
              )}
              {entry.applied && (
                <span className={styles.appliedBadge}>applied</span>
              )}
              {entry === lastApplied && (
                <button className={styles.revertBtn} onClick={handleRevert}>
                  Revert
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
