import { useCallback } from "react";
import { Panel } from "../shared/Panel.js";
import { StatusDot } from "../shared/StatusDot.js";
import { Badge } from "../shared/Badge.js";
import { usePolling } from "../../hooks/usePolling.js";
import { api } from "../../api/client.js";
import styles from "./InstanceHealth.module.css";

export function InstanceHealth() {
  const fetcher = useCallback(() => api.health(), []);
  const { data, error, loading } = usePolling({ fetcher, delay: 0 });

  return (
    <Panel title="Instance Health" icon="[H]" loading={loading} error={error}>
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
            {data.gateway.pid && (
              <span className={styles.pid}>PID {data.gateway.pid}</span>
            )}
          </div>

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
    </Panel>
  );
}
