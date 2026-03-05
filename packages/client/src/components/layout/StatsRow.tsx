import { useState, useEffect, useCallback } from "react";
import { api } from "../../api/client.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.js";
import styles from "./StatsRow.module.css";

function formatUptime(startedAt: string | undefined): string {
  if (!startedAt) return "--";
  const ms = Date.now() - new Date(startedAt).getTime();
  if (ms < 0) return "--";
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

export function StatsRow() {
  const [gatewayUp, setGatewayUp] = useState(false);
  const [gatewayPid, setGatewayPid] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<string | undefined>();
  const [agentCount, setAgentCount] = useState(0);
  const [todaySpend, setTodaySpend] = useState("--");
  const [modelCount, setModelCount] = useState(0);
  const [cacheRatio, setCacheRatio] = useState<number | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      api.health(),
      api.spend(),
      api.spendByModel(),
    ]).then(([health, spend, byModel]) => {
      setGatewayUp(health.data?.gateway?.running ?? false);
      setGatewayPid(health.data?.gateway?.pid ?? null);
      setStartedAt(health.data?.gateway?.startedAt);
      setAgentCount(health.data?.agents?.length ?? 0);

      if (spend.data?.daily?.length) {
        const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
        const todayEntry = spend.data.daily.find((d: any) => d.date === todayStr);
        const cost = todayEntry?.totalCost ?? 0;
        setTodaySpend(`$${Number(cost).toFixed(2)}`);
      }

      if (spend.data?.totals) {
        const t = spend.data.totals;
        const totalCache = (t.cacheRead ?? 0) + (t.cacheWrite ?? 0);
        if (totalCache > 0) {
          setCacheRatio(t.cacheRead / totalCache);
        }
      }

      if (byModel.data?.models) {
        const active = byModel.data.models.filter((m: any) => m.invocations > 0);
        setModelCount(active.length);
      }
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRestart = async () => {
    setConfirmOpen(false);
    setRestarting(true);
    try {
      await fetch("/api/gateway/restart", { method: "POST" });
      await new Promise((r) => setTimeout(r, 3000));
      load();
    } finally {
      setRestarting(false);
    }
  };

  return (
    <div className={styles.row}>
      <div className={styles.pills}>
        <div className={styles.pillGroup}>
          <span className={styles.pillLabel}>Gateway</span>
          <span className={`${styles.pill} ${restarting ? styles.pillYellow : gatewayUp ? styles.pillDark : styles.pillRed}`}>
            {restarting ? "Restarting..." : gatewayUp ? "Running" : "Offline"}
          </span>
        </div>
        <div className={styles.pillGroup}>
          <span className={styles.pillLabel}>Uptime</span>
          <span className={`${styles.pill} ${styles.pillYellow}`}>
            {formatUptime(startedAt)}
          </span>
        </div>
        <div className={styles.pillGroup}>
          <span className={styles.pillLabel}>PID</span>
          <span className={`${styles.pill} ${styles.pillYellow}`}>
            {gatewayPid ?? "--"}
          </span>
        </div>
        <button
          className={styles.restartBtn}
          onClick={() => setConfirmOpen(true)}
          disabled={restarting}
        >
          {restarting ? "Restarting..." : "Restart"}
        </button>
      </div>

      <div className={styles.bigNumbers}>
        <div className={styles.stat}>
          <div className={styles.statTop}>
            <span className={styles.statIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </span>
            <span className={styles.statNumber}>{agentCount}</span>
          </div>
          <span className={styles.statLabel}>Agents</span>
        </div>
        <div className={styles.stat}>
          <div className={styles.statTop}>
            <span className={styles.statIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </span>
            <span className={styles.statNumber}>{todaySpend}</span>
          </div>
          <span className={styles.statLabel}>Today</span>
        </div>
        <div className={styles.stat}>
          <div className={styles.statTop}>
            <span className={styles.statIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="9" cy="16" r="1" fill="currentColor"/><circle cx="15" cy="16" r="1" fill="currentColor"/></svg>
            </span>
            <span className={styles.statNumber}>{modelCount}</span>
          </div>
          <span className={styles.statLabel}>Models</span>
        </div>
        <div className={styles.stat}>
          <div className={styles.statTop}>
            <span className={styles.statIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="15" x2="23" y2="15"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="15" x2="4" y2="15"/></svg>
            </span>
            <span className={styles.statNumber}>
              {cacheRatio !== null ? `${(cacheRatio * 100).toFixed(0)}%` : "--"}
            </span>
          </div>
          <div className={styles.statBottom}>
            <span className={styles.statLabel}>Cache</span>
            {cacheRatio !== null && (
              <span className={`${styles.grade} ${cacheRatio >= 0.7 ? styles.gradeGood : cacheRatio >= 0.4 ? styles.gradeFair : styles.gradeCold}`}>
                {cacheRatio >= 0.7 ? "good" : cacheRatio >= 0.4 ? "fair" : "cold"}
              </span>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Restart Gateway"
        message="This will restart the OpenClaw gateway. Active sessions may be interrupted. Proceed?"
        onConfirm={handleRestart}
        onCancel={() => setConfirmOpen(false)}
        confirmLabel="Restart"
        danger={false}
      />
    </div>
  );
}
