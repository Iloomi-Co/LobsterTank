import { useCallback, useState } from "react";
import { Panel } from "../shared/Panel.js";
import { Badge } from "../shared/Badge.js";
import { EmptyState } from "../shared/EmptyState.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.js";
import { usePolling } from "../../hooks/usePolling.js";
import { api } from "../../api/client.js";
import styles from "./LaunchdRogue.module.css";

export function LaunchdRogue() {
  const fetcher = useCallback(() => api.launchd(), []);
  const { data, error, loading, refresh } = usePolling({ fetcher, delay: 600 });
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  const handleRemove = async () => {
    if (!removeTarget) return;
    await api.removeLaunchd(removeTarget);
    setRemoveTarget(null);
    refresh();
  };

  const classificationVariant = (c: string) => {
    switch (c) {
      case "safe": return "green" as const;
      case "rogue": return "red" as const;
      default: return "yellow" as const;
    }
  };

  return (
    <Panel title="LaunchD Services" icon="[L]" loading={loading} error={error}>
      {data && data.length > 0 ? (
        <div className={styles.list}>
          {data.map((job: any) => (
            <div key={job.label} className={styles.jobCard}>
              <div className={styles.jobInfo}>
                <div className={styles.jobLabel}>{job.label}</div>
                <div className={styles.jobMeta}>
                  <Badge label={job.classification} variant={classificationVariant(job.classification)} />
                  {job.pid && <span className={styles.pid}>PID {job.pid}</span>}
                </div>
              </div>
              {job.classification !== "safe" && (
                <button className={styles.removeBtn} onClick={() => setRemoveTarget(job.label)}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No OC-related LaunchD services found" />
      )}

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove LaunchD Service"
        message={`Remove launchd service "${removeTarget}"? This will unload it from launchd.`}
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
        confirmLabel="Remove"
        danger
      />
    </Panel>
  );
}
