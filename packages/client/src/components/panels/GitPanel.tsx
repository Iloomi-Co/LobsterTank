import { useState, useCallback } from "react";
import { Panel } from "../shared/Panel.js";
import { StatusDot } from "../shared/StatusDot.js";
import { Badge } from "../shared/Badge.js";
import { LogViewer } from "../shared/LogViewer.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.js";
import { usePolling } from "../../hooks/usePolling.js";
import { api } from "../../api/client.js";
import styles from "./GitPanel.module.css";

export function GitPanel() {
  const fetcher = useCallback(() => api.gitStatus(), []);
  const { data, error, loading, refresh } = usePolling({ fetcher, delay: 1600 });
  const [showLog, setShowLog] = useState(false);
  const [logEntries, setLogEntries] = useState<string[] | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [revertConfirm, setRevertConfirm] = useState(false);

  const handleViewLog = async () => {
    if (showLog) { setShowLog(false); return; }
    const result = await api.gitLog();
    if (result.ok && result.data?.entries) {
      setLogEntries(result.data.entries);
      setShowLog(true);
      setShowDiff(false);
    }
  };

  const handleViewDiff = async () => {
    if (showDiff) { setShowDiff(false); return; }
    const result = await api.gitDiff();
    if (result.ok && result.data?.diff) {
      setDiffContent(result.data.diff);
      setShowDiff(true);
      setShowLog(false);
    }
  };

  const handleRevert = async () => {
    setRevertConfirm(false);
    await api.gitRevert();
    refresh();
  };

  const handleInit = async () => {
    await api.gitInit();
    refresh();
  };

  const handleSnapshot = async () => {
    await api.gitSnapshot();
    refresh();
  };

  return (
    <Panel title="Git Safety Net" icon="[G]" loading={loading} error={error}>
      {data && !data.initialized ? (
        <div className={styles.initPrompt}>
          <p className={styles.initText}>Git is not initialized in ~/.openclaw</p>
          <button className={styles.initBtn} onClick={handleInit}>
            Initialize Git
          </button>
        </div>
      ) : data ? (
        <div className={styles.content}>
          <div className={styles.statusRow}>
            <StatusDot
              status={data.clean ? "online" : "warning"}
              label={data.clean ? "Working tree clean" : "Uncommitted changes"}
            />
          </div>

          {data.lastCommit && (
            <div className={styles.lastCommit}>
              <Badge label={data.lastCommit.hash} variant="blue" />
              <span className={styles.commitMsg}>{data.lastCommit.message}</span>
              <span className={styles.commitDate}>
                {new Date(data.lastCommit.date).toLocaleString()}
              </span>
            </div>
          )}

          <div className={styles.actions}>
            <button className={styles.actionBtn} onClick={handleSnapshot}>
              Take Snapshot
            </button>
            <button className={styles.actionBtn} onClick={handleViewLog}>
              {showLog ? "Hide Log" : "View History"}
            </button>
            <button className={styles.actionBtn} onClick={handleViewDiff}>
              {showDiff ? "Hide Diff" : "View Diff"}
            </button>
            <button
              className={`${styles.actionBtn} ${styles.revertBtn}`}
              onClick={() => setRevertConfirm(true)}
            >
              Revert Last
            </button>
          </div>

          {showLog && logEntries && (
            <div className={styles.logSection}>
              <LogViewer content={logEntries.join("\n")} />
            </div>
          )}

          {showDiff && diffContent && (
            <div className={styles.logSection}>
              <LogViewer content={diffContent} />
            </div>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={revertConfirm}
        title="Revert Last Change"
        message="This will revert the most recent commit in ~/.openclaw. This only undoes LobsterTank's own changes. Proceed?"
        onConfirm={handleRevert}
        onCancel={() => setRevertConfirm(false)}
        confirmLabel="Revert"
        danger
      />
    </Panel>
  );
}
