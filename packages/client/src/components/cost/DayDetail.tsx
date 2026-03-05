import { useState, useEffect } from "react";
import { api } from "../../api/client.js";
import { getModelColor, formatTokens } from "../../utils/modelColors.js";
import styles from "./DayDetail.module.css";

interface DayDetailProps {
  date: string | null;
  onClose: () => void;
}

interface DayDetailData {
  date: string;
  totalCost: number;
  totalInvocations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  hourly: { hour: number; cost: number; invocations: number; models: Record<string, number> }[];
  agents: {
    name: string; cost: number; invocations: number;
    sessions: {
      sessionId: string; cost: number; invocations: number;
      inputTokens: number; outputTokens: number;
      models: string[]; firstActivity: string; lastActivity: string;
    }[];
  }[];
  models: Record<string, { cost: number; invocations: number; inputTokens: number; outputTokens: number }>;
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return `${SHORT_DAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

function formatCost(n: number): string {
  if (n >= 10) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  if (n === 0) return "FREE";
  return `$${n.toFixed(4)}`;
}

const HOUR_LABELS = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"];

export function DayDetail({ date, onClose }: DayDetailProps) {
  const [data, setData] = useState<DayDetailData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!date) {
      setData(null);
      return;
    }
    setLoading(true);
    api.spendDayDetail(date).then((res) => {
      if (res.ok && res.data) {
        setData(res.data);
      }
      setLoading(false);
    });
  }, [date]);

  const isActive = date != null;

  if (!isActive) {
    return <div className={styles.wrapper} data-empty="true" />;
  }

  if (loading && !data) {
    return (
      <div className={`${styles.wrapper} ${styles.wrapperActive}`}>
        <div className={styles.empty}>Loading...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`${styles.wrapper} ${styles.wrapperActive}`}>
        <div className={styles.empty}>No data for this day</div>
      </div>
    );
  }

  const maxHourlyCost = Math.max(...data.hourly.map((h) => h.cost), 0.001);
  const allModels = Object.keys(data.models);
  const totalModelCost = Object.values(data.models).reduce((s, m) => s + m.cost, 0);

  return (
    <div className={`${styles.wrapper} ${styles.wrapperActive}`}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.title}>Day Detail: {formatDateLabel(data.date)}</span>
        <button className={styles.closeBtn} onClick={onClose} title="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Summary pills */}
      <div className={styles.statsPills}>
        <div className={styles.statPill}>
          <span className={styles.statPillValue}>{formatCost(data.totalCost)}</span> total
        </div>
        <div className={styles.statPill}>
          <span className={styles.statPillValue}>{data.totalInvocations}</span> calls
        </div>
        <div className={styles.statPill}>
          <span className={styles.statPillValue}>{formatTokens(data.totalInputTokens)}</span> input
        </div>
        <div className={styles.statPill}>
          <span className={styles.statPillValue}>{formatTokens(data.totalOutputTokens)}</span> output
        </div>
        {(data.totalCacheRead > 0 || data.totalCacheWrite > 0) && (
          <div className={styles.statPill}>
            <span className={styles.statPillValue}>{formatTokens(data.totalCacheRead)}</span> cache
          </div>
        )}
      </div>

      {/* Hourly activity */}
      <div className={styles.hourlySection}>
        <div className={styles.hourlyLabel}>Hourly Activity</div>
        <div className={styles.hourlyChart}>
          {data.hourly.map((h) => {
            const pct = (h.cost / maxHourlyCost) * 100;
            const modelEntries = Object.entries(h.models);
            return (
              <div
                key={h.hour}
                className={styles.hourlyBar}
                style={{ height: `${Math.max(pct, h.cost > 0 ? 8 : 2)}%` }}
                title={`${h.hour}:00 — ${formatCost(h.cost)} (${h.invocations} calls)`}
              >
                {modelEntries.map(([model, cost]) => {
                  const segPct = h.cost > 0 ? (cost / h.cost) * 100 : 0;
                  return (
                    <div
                      key={model}
                      className={styles.hourlySegment}
                      style={{
                        height: `${segPct}%`,
                        background: getModelColor(model),
                        opacity: 0.85,
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className={styles.hourlyTicks}>
          {HOUR_LABELS.map((l) => <span key={l}>{l}</span>)}
        </div>
      </div>

      {/* Columns: Agents + Models */}
      <div className={styles.columns}>
        {/* By Agent */}
        <div className={styles.column}>
          <div className={styles.columnTitle}>By Agent</div>
          {data.agents.map((agent) => (
            <div key={agent.name} className={styles.agentItem}>
              <div className={styles.agentRow}>
                <span>{agent.name}</span>
                <span className={styles.agentCost}>{formatCost(agent.cost)}</span>
              </div>
              {agent.sessions.map((s) => (
                <div key={s.sessionId} className={styles.sessionRow}>
                  <span className={styles.sessionId}>{s.sessionId.slice(0, 7)}</span>
                  <span className={styles.sessionMeta}>
                    <span>{formatCost(s.cost)}</span>
                    <span>{s.invocations} calls</span>
                  </span>
                </div>
              ))}
            </div>
          ))}
          {data.agents.length === 0 && (
            <div style={{ color: "var(--text-muted)", fontSize: "var(--font-size-xs)" }}>No agent activity</div>
          )}
        </div>

        {/* By Model */}
        <div className={styles.column}>
          <div className={styles.columnTitle}>By Model</div>
          {allModels
            .sort((a, b) => (data.models[b]?.cost ?? 0) - (data.models[a]?.cost ?? 0))
            .map((model) => {
              const m = data.models[model];
              const pct = totalModelCost > 0 ? (m.cost / totalModelCost) * 100 : 0;
              const color = getModelColor(model);
              return (
                <div key={model} className={styles.modelRow}>
                  <span className={styles.modelDot} style={{ background: color }} />
                  <span className={styles.modelName}>{model}</span>
                  <span className={styles.modelCost}>
                    {m.cost === 0 ? "FREE" : formatCost(m.cost)}
                  </span>
                  <span className={styles.modelPct}>{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          {allModels.length === 0 && (
            <div style={{ color: "var(--text-muted)", fontSize: "var(--font-size-xs)" }}>No model data</div>
          )}
        </div>
      </div>
    </div>
  );
}
