import { useCallback, useState } from "react";
import { Panel } from "../shared/Panel.js";
import { Badge } from "../shared/Badge.js";
import { EmptyState } from "../shared/EmptyState.js";
import { LogViewer } from "../shared/LogViewer.js";
import { usePolling } from "../../hooks/usePolling.js";
import { api } from "../../api/client.js";
import styles from "./CronTasks.module.css";

export function CronTasks() {
  const fetcher = useCallback(() => api.cron(), []);
  const { data, error, loading } = usePolling({ fetcher, delay: 1000 });
  const [showLogs, setShowLogs] = useState(false);
  const [logContent, setLogContent] = useState<string | null>(null);

  const handleViewLogs = async () => {
    if (showLogs) {
      setShowLogs(false);
      return;
    }
    const result = await api.cronLogs();
    if (result.ok && result.data) {
      setLogContent(result.data.content);
      setShowLogs(true);
    }
  };

  return (
    <Panel
      title="Cron Tasks"
      icon="[C]"
      loading={loading}
      error={error}
      actions={
        <button className={styles.logBtn} onClick={handleViewLogs}>
          {showLogs ? "Hide Logs" : "View Logs"}
        </button>
      }
    >
      {data && data.length > 0 ? (
        <div className={styles.list}>
          {data.map((job: any, i: number) => (
            <div key={i} className={styles.jobCard}>
              <div className={styles.schedule}>{job.schedule}</div>
              <div className={styles.command}>{job.command}</div>
              <div className={styles.tags}>
                {job.isOcRelated && <Badge label="OC" variant="blue" />}
                {job.isPaused && <Badge label="paused" variant="yellow" />}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No cron jobs found" />
      )}

      {showLogs && logContent && (
        <div className={styles.logSection}>
          <LogViewer content={logContent} />
        </div>
      )}
    </Panel>
  );
}
