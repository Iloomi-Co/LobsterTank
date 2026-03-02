import { useCallback, useState } from "react";
import { Panel } from "../shared/Panel.js";
import { StatusDot } from "../shared/StatusDot.js";
import { Badge } from "../shared/Badge.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.js";
import { usePolling } from "../../hooks/usePolling.js";
import { api } from "../../api/client.js";
import styles from "./InstanceHealth.module.css";

export function InstanceHealth() {
  const fetcher = useCallback(() => api.health(), []);
  const { data, error, loading, refresh } = usePolling({ fetcher, delay: 0 });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartResult, setRestartResult] = useState<string | null>(null);

  const handleRestart = useCallback(async () => {
    setConfirmOpen(false);
    setRestarting(true);
    setRestartResult(null);
    try {
      const result = await api.gatewayRestart();
      if (result.ok && result.data) {
        setRestartResult(`Restarted: PID ${result.data.oldPid ?? "?"} → ${result.data.newPid ?? "?"}`);
      } else {
        setRestartResult(`Failed: ${result.error ?? "Unknown error"}`);
      }
      refresh();
    } catch (e: any) {
      setRestartResult(`Error: ${e.message}`);
    } finally {
      setRestarting(false);
      setTimeout(() => setRestartResult(null), 5000);
    }
  }, [refresh]);

  return (
    <Panel title="Instance Health" icon="[H]" loading={loading || restarting} error={error}>
      {data && (
        <div className={styles.content}>
          <div className={styles.gatewayCard}>
            <div className={styles.gatewayHeader}>
              <StatusDot
                status={data.gateway.running ? "online" : "offline"}
                label={data.gateway.running ? "Gateway Running" : "Gateway Offline"}
                pulse={data.gateway.running}
              />
              <span className={styles.port}>:{data.gateway.port}</span>
            </div>
            <div className={styles.gatewayActions}>
              {data.gateway.pid && (
                <span className={styles.pid}>PID {data.gateway.pid}</span>
              )}
              <button
                className={styles.restartBtn}
                onClick={() => setConfirmOpen(true)}
                disabled={restarting}
              >
                {restarting ? "Restarting..." : "Restart"}
              </button>
            </div>
          </div>

          {restartResult && (
            <div className={styles.restartToast}>{restartResult}</div>
          )}

          <div className={styles.agentsSection}>
            <h4 className={styles.sectionTitle}>Agents ({data.agents.length})</h4>
            <div className={styles.agentGrid}>
              {data.agents.map((agent: any) => (
                <div key={agent.id} className={styles.agentCard}>
                  <div className={styles.agentName}>{agent.name ?? agent.id}</div>
                  <Badge
                    label={agent.model?.primary?.split("/").pop() ?? "unknown"}
                    variant="blue"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Restart Gateway"
        message="This will restart the OpenClaw gateway process. Active agent sessions may be interrupted. Proceed?"
        onConfirm={handleRestart}
        onCancel={() => setConfirmOpen(false)}
        confirmLabel="Restart"
        danger
      />
    </Panel>
  );
}
