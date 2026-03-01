import { useCallback } from "react";
import { Panel } from "../shared/Panel.js";
import { Badge } from "../shared/Badge.js";
import { EmptyState } from "../shared/EmptyState.js";
import { usePolling } from "../../hooks/usePolling.js";
import { api } from "../../api/client.js";
import styles from "./AgentConfig.module.css";

export function AgentConfig() {
  const fetcher = useCallback(() => api.agents(), []);
  const { data, error, loading } = usePolling({ fetcher, delay: 1200 });

  return (
    <Panel title="Agent Config" icon="[A]" loading={loading} error={error}>
      {data?.agents && data.agents.length > 0 ? (
        <div className={styles.list}>
          {data.agents.map((agent: any) => (
            <div key={agent.id} className={styles.agentCard}>
              <div className={styles.cardHeader}>
                <span className={styles.agentName}>{agent.name ?? agent.id}</span>
                <Badge label={agent.id} variant="purple" />
              </div>
              <div className={styles.modelInfo}>
                <div className={styles.modelRow}>
                  <span className={styles.modelLabel}>Primary</span>
                  <span className={styles.modelValue}>{agent.model?.primary ?? "default"}</span>
                </div>
                {agent.model?.fallbacks?.length > 0 && (
                  <div className={styles.modelRow}>
                    <span className={styles.modelLabel}>Fallbacks</span>
                    <span className={styles.modelValue}>
                      {agent.model.fallbacks.map((f: string) => f.split("/").pop()).join(", ")}
                    </span>
                  </div>
                )}
              </div>
              {agent.workspace && (
                <div className={styles.workspace}>
                  {agent.workspace.replace(/.*\.openclaw\//, "~/.openclaw/")}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No agents configured" />
      )}
    </Panel>
  );
}
