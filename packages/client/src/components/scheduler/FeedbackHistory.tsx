import { useState } from "react";
import { api } from "../../api/client.js";
import { DiffViewer } from "./DiffViewer.js";
import styles from "./FeedbackHistory.module.css";

interface FeedbackEntry {
  id: string;
  scriptName: string;
  timestamp: string;
  rating: "up" | "down";
  suggestion: string | null;
  applied: boolean;
  rewriteSnapshot: string | null;
  changeDescription: string | null;
}

interface FeedbackHistoryProps {
  scriptName: string;
  entries: FeedbackEntry[];
  onReverted: () => void;
}

export function FeedbackHistory({ scriptName, entries, onReverted }: FeedbackHistoryProps) {
  const [open, setOpen] = useState(false);
  const [diffData, setDiffData] = useState<{ entryId: string; diff: string } | null>(null);
  const [loadingDiff, setLoadingDiff] = useState<string | null>(null);

  if (entries.length === 0) return null;

  const lastApplied = [...entries].reverse().find((e) => e.applied);

  const handleRevert = async () => {
    const res = await api.schedulerRevertRewrite(scriptName);
    if (res.ok) {
      onReverted();
    }
  };

  const handleViewDiff = async (entry: FeedbackEntry) => {
    if (diffData?.entryId === entry.id) {
      setDiffData(null);
      return;
    }
    if (!entry.rewriteSnapshot) return;

    setLoadingDiff(entry.id);
    const res = await api.schedulerFeedbackDiff(entry.rewriteSnapshot);
    setLoadingDiff(null);

    if (res.ok && res.data) {
      setDiffData({ entryId: entry.id, diff: (res.data as any).diff });
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
            <div key={entry.id}>
              <div className={styles.entry}>
                <span className={styles.timestamp}>{formatTime(entry.timestamp)}</span>
                <span className={entry.rating === "up" ? styles.ratingUp : styles.ratingDown}>
                  {entry.rating === "up" ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8.834 1.4a.5.5 0 0 0-.486-.4h-.166a1.5 1.5 0 0 0-1.466 1.184L6.2 4.8H3.5A1.5 1.5 0 0 0 2 6.3v5.2A1.5 1.5 0 0 0 3.5 13h9a1.5 1.5 0 0 0 1.46-1.155l1-4.346A1.5 1.5 0 0 0 13.5 5.8H9.6l.734-2.932a1.5 1.5 0 0 0-.5-1.468L8.834 1.4z"/></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M7.166 14.6a.5.5 0 0 0 .486.4h.166a1.5 1.5 0 0 0 1.466-1.184L9.8 11.2h2.7a1.5 1.5 0 0 0 1.5-1.5V4.5A1.5 1.5 0 0 0 12.5 3h-9a1.5 1.5 0 0 0-1.46 1.155l-1 4.346A1.5 1.5 0 0 0 2.5 10.2h3.9l-.734 2.932a1.5 1.5 0 0 0 .5 1.468l1 .868z"/></svg>
                  )}
                </span>
                {entry.suggestion && (
                  <span className={styles.suggestion} title={entry.suggestion}>
                    {entry.suggestion}
                  </span>
                )}
                {entry.changeDescription && (
                  <span className={styles.changeDesc} title={entry.changeDescription}>
                    {entry.changeDescription}
                  </span>
                )}
                {entry.applied && (
                  <span className={styles.appliedBadge}>applied</span>
                )}
                {entry.applied && entry.rewriteSnapshot && (
                  <button
                    className={styles.diffBtn}
                    onClick={() => handleViewDiff(entry)}
                    disabled={loadingDiff === entry.id}
                  >
                    {loadingDiff === entry.id ? "..." : diffData?.entryId === entry.id ? "Hide Diff" : "View Diff"}
                  </button>
                )}
                {entry === lastApplied && (
                  <button className={styles.revertBtn} onClick={handleRevert}>
                    Revert
                  </button>
                )}
              </div>
              {diffData?.entryId === entry.id && (
                <div className={styles.diffContainer}>
                  <pre className={styles.diffPre}>{diffData.diff}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
