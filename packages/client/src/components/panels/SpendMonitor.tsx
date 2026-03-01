import { useCallback } from "react";
import { Panel } from "../shared/Panel.js";
import { EmptyState } from "../shared/EmptyState.js";
import { usePolling } from "../../hooks/usePolling.js";
import { api } from "../../api/client.js";
import styles from "./SpendMonitor.module.css";

export function SpendMonitor() {
  const fetcher = useCallback(() => api.spend(), []);
  const { data, error, loading } = usePolling({ fetcher, delay: 400 });

  const formatCost = (n: number | undefined) => {
    if (n === undefined || n === null) return "--";
    return `$${n.toFixed(4)}`;
  };

  return (
    <Panel title="Spend Monitor" icon="[$]" loading={loading} error={error}>
      {data ? (
        <div className={styles.content}>
          {data.error ? (
            <div className={styles.offlineNotice}>{data.error}</div>
          ) : (
            <>
              <div className={styles.totalCard}>
                <span className={styles.totalLabel}>Total Spend</span>
                <span className={styles.totalValue}>{formatCost(data.total)}</span>
              </div>

              {data.balance !== undefined && (
                <div className={styles.balanceCard}>
                  <span className={styles.balanceLabel}>Balance</span>
                  <span className={styles.balanceValue}>{formatCost(data.balance)}</span>
                </div>
              )}

              {data.byModel && Object.keys(data.byModel).length > 0 && (
                <div className={styles.modelBreakdown}>
                  <h4 className={styles.sectionTitle}>By Model</h4>
                  {Object.entries(data.byModel).map(([model, cost]) => (
                    <div key={model} className={styles.modelRow}>
                      <span className={styles.modelName}>{model.split("/").pop()}</span>
                      <span className={styles.modelCost}>{formatCost(cost as number)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <EmptyState message="No spend data available" />
      )}
    </Panel>
  );
}
