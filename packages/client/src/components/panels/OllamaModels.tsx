import { useCallback } from "react";
import { Panel } from "../shared/Panel.js";
import { StatusDot } from "../shared/StatusDot.js";
import { Badge } from "../shared/Badge.js";
import { EmptyState } from "../shared/EmptyState.js";
import { usePolling } from "../../hooks/usePolling.js";
import { api } from "../../api/client.js";
import styles from "./OllamaModels.module.css";

export function OllamaModels() {
  const fetcher = useCallback(() => api.ollama(), []);
  const { data, error, loading } = usePolling({ fetcher, delay: 1400 });

  return (
    <Panel title="Ollama Models" icon="[O]" loading={loading} error={error}>
      {data && data.length > 0 ? (
        <div className={styles.list}>
          {data.map((model: any) => (
            <div key={model.name} className={styles.modelCard}>
              <div className={styles.modelHeader}>
                <StatusDot
                  status={model.isRunning ? "online" : "unknown"}
                  pulse={model.isRunning}
                />
                <span className={styles.modelName}>{model.name}</span>
              </div>
              <div className={styles.modelMeta}>
                <Badge label={model.size} variant="default" />
                {model.isRunning && <Badge label="running" variant="green" />}
                {model.usedByAgent && <Badge label={model.usedByAgent} variant="purple" />}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No Ollama models found (is Ollama running?)" />
      )}
    </Panel>
  );
}
