import { useCallback, useState } from "react";
import { Badge } from "../shared/Badge.js";
import { usePolling } from "../../hooks/usePolling.js";
import { api } from "../../api/client.js";
import { getModelColor, formatTokens as fmtTokens } from "../../utils/modelColors.js";
import { WeeklyCostChart } from "../panels/WeeklyCostChart.js";
import { TokensByModel } from "../panels/TokensByModel.js";
import { DayDetail } from "./DayDetail.js";
import { CacheHistory } from "./CacheHistory.js";
import styles from "./CostDashboard.module.css";

// ── Types ───────────────────────────────────────────────

interface DailySpend {
  date: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
}

interface SpendResponse {
  daily: DailySpend[];
  totals: DailySpend | null;
  days: number;
  lastUpdated: string;
  error?: string;
}

interface ModelEntry {
  model: string;
  provider: string;
  invocations: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCost: number;
  isLocal: boolean;
  agents: string[];
}

interface ModelSpendResponse {
  models: ModelEntry[];
  totalEstimatedCost: number;
  localSavings: number;
  activeModelCount: number;
  mostActiveModel: string;
  daily: any[];
  lastUpdated: string;
  error?: string;
}

// ── Constants ───────────────────────────────────────────

const PROVIDER_VARIANTS: Record<string, "blue" | "green" | "purple" | "muted"> = {
  anthropic: "blue",
  ollama: "green",
  openai: "purple",
};

// ── Helpers ─────────────────────────────────────────────

function formatCost(n: number): string {
  if (n >= 10) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

const formatTokens = fmtTokens;

function cacheHitRatio(day: DailySpend): number {
  const totalCache = day.cacheRead + day.cacheWrite;
  if (totalCache === 0) return 0;
  return day.cacheRead / totalCache;
}

function ratioVariant(ratio: number): "green" | "yellow" | "red" {
  if (ratio >= 0.7) return "green";
  if (ratio >= 0.4) return "yellow";
  return "red";
}

function ratioLabel(ratio: number): string {
  if (ratio >= 0.7) return "good";
  if (ratio >= 0.4) return "fair";
  return "cold";
}



// ── Component ───────────────────────────────────────────

export function CostDashboard() {
  const spendFetcher = useCallback(() => api.spend(30), []);
  const modelFetcher = useCallback(() => api.spendByModel(), []);

  const { data: spendData, error: spendError, loading: spendLoading } = usePolling<SpendResponse>({ fetcher: spendFetcher });
  const { data: modelData, loading: modelLoading } = usePolling<ModelSpendResponse>({ fetcher: modelFetcher, delay: 200 });

  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const totals = spendData?.totals ?? null;
  const totalRatio = totals ? cacheHitRatio(totals) : 0;

  // Today's (most recent day) cache ratio
  const dailyDays = spendData?.daily ?? [];
  const latestDay = dailyDays.length > 0 ? dailyDays[dailyDays.length - 1] : null;
  const todayRatio = latestDay ? cacheHitRatio(latestDay) : null;

  const models = modelData?.models ?? [];

  // Total cost by model for horizontal bar chart
  const modelCostTotal = models.reduce((s, m) => s + m.estimatedCost, 0);

  // ── Loading / Error states ────────────────────────────

  if (spendLoading && !spendData && modelLoading && !modelData) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading spend data...</div>
      </div>
    );
  }

  if (spendError && !spendData) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{spendError}</div>
      </div>
    );
  }

  if (spendData?.error && !modelData) {
    return (
      <div className={styles.container}>
        <div className={styles.offlineNotice}>{spendData.error}</div>
      </div>
    );
  }

  const localModelCount = models.filter((m) => m.isLocal).length;

  // ── Render ────────────────────────────────────────────

  return (
    <div className={styles.container}>
      {/* Page title */}
      <h1 className={styles.pageHeading}>Model Usage & Cost</h1>

      {/* Stats Row */}
      <div className={styles.statsRow}>
        <div className={styles.pills}>
          <div className={styles.pillGroup}>
            <span className={styles.pillLabel}>7-Day Total</span>
            <span className={`${styles.pill} ${styles.pillDark}`}>
              {modelData ? formatCost(modelData.totalEstimatedCost) : totals ? formatCost(totals.totalCost) : "--"}
            </span>
          </div>
          <div className={styles.pillGroup}>
            <span className={styles.pillLabel}>Local Savings</span>
            <span className={`${styles.pill} ${styles.pillGreen}`}>
              {modelData ? formatCost(modelData.localSavings) : "--"}
            </span>
          </div>
          <div className={styles.pillGroup}>
            <span className={styles.pillLabel}>Most Active</span>
            <span className={`${styles.pill} ${styles.pillYellow}`}>
              {modelData?.mostActiveModel && modelData.mostActiveModel !== "none"
                ? modelData.mostActiveModel
                : "--"}
            </span>
          </div>
        </div>

        <div className={styles.bigNumbers}>
          <div className={styles.stat}>
            <div className={styles.statTop}>
              <span className={styles.statIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="9" cy="16" r="1" fill="currentColor"/><circle cx="15" cy="16" r="1" fill="currentColor"/></svg>
              </span>
              <span className={styles.statNumber}>{modelData ? modelData.activeModelCount : "--"}</span>
            </div>
            <span className={styles.statLabel}>Active Models</span>
          </div>
          <div className={styles.stat}>
            <div className={styles.statTop}>
              <span className={styles.statIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </span>
              <span className={styles.statNumber}>{localModelCount}</span>
            </div>
            <span className={styles.statLabel}>Local</span>
          </div>
          <div className={styles.stat}>
            <div className={styles.statTop}>
              <span className={styles.statIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="15" x2="23" y2="15"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="15" x2="4" y2="15"/></svg>
              </span>
              <span className={styles.statNumber}>
                {todayRatio !== null ? `${(todayRatio * 100).toFixed(0)}%` : "--"}
              </span>
            </div>
            <div className={styles.statBottom}>
              <span className={styles.statLabel}>Cache</span>
              {todayRatio !== null && (
                <span className={`${styles.grade} ${todayRatio >= 0.7 ? styles.gradeGood : todayRatio >= 0.4 ? styles.gradeFair : styles.gradeCold}`}>
                  {ratioLabel(todayRatio)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 30-Day Cost Chart */}
      <WeeklyCostChart days={30} selectedDay={selectedDay} onSelectDay={setSelectedDay} />

      {/* Day Detail */}
      <DayDetail date={selectedDay} onClose={() => setSelectedDay(null)} />

      {/* Two-column: Token Donut + Cache Efficiency */}
      <div className={styles.twoCol}>
        {/* Token Distribution by Model (interactive donut) */}
        <TokensByModel />

        {/* Cache Efficiency */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Cache Efficiency</h3>
          </div>
          {totals ? (
            <div className={styles.cacheContent}>
              <div className={styles.cacheBar}>
                <div className={styles.cacheBarRead} style={{ width: `${totalRatio * 100}%` }} />
                <div className={styles.cacheBarWrite} style={{ width: `${(1 - totalRatio) * 100}%` }} />
              </div>
              <div className={styles.cacheLabels}>
                <span>
                  Reads: {formatTokens(totals.cacheRead)} ({(totalRatio * 100).toFixed(1)}%)
                  {" — "}{formatCost(totals.cacheReadCost)}
                </span>
                <span>
                  Writes: {formatTokens(totals.cacheWrite)} ({((1 - totalRatio) * 100).toFixed(1)}%)
                  {" — "}{formatCost(totals.cacheWriteCost)}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <Badge label={ratioLabel(totalRatio)} variant={ratioVariant(totalRatio)} />
              </div>
              <p className={styles.cacheNote}>
                {totalRatio >= 0.7
                  ? "Cache is working well — most tokens are served from cache at 1/10th the cost of fresh writes."
                  : totalRatio >= 0.4
                    ? "Cache hit ratio is moderate. Many sessions are creating new context rather than reusing cached prompts."
                    : "Cache hit ratio is low — most tokens are fresh writes at full price. Short or unique sessions prevent cache reuse."
                }
              </p>
            </div>
          ) : (
            <div className={styles.emptyDetail}>Waiting for gateway data...</div>
          )}
        </div>
      </div>

      {/* Cache Efficiency Trend */}
      {spendData?.daily && spendData.daily.length > 0 && (
        <CacheHistory
          daily={spendData.daily
            .filter((d) => d.cacheRead + d.cacheWrite > 0)
            .map((d) => ({
              date: d.date,
              ratio: d.cacheRead / (d.cacheRead + d.cacheWrite),
              cacheRead: d.cacheRead,
              cacheWrite: d.cacheWrite,
            }))}
          avgRatio={totalRatio}
        />
      )}

      {/* Section Header */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionHeading}>Model Usage Details</h2>
      </div>

      {/* Model Cards */}
      {models.filter((m) => m.invocations > 0).length > 0 ? (
        <div className={styles.modelGrid}>
          {models.filter((m) => m.invocations > 0).map((m) => (
            <div key={m.model} className={styles.modelCard}>
              <div className={styles.modelCardHeader}>
                <div className={styles.modelCardTitle}>
                  <span className={styles.modelName}>{m.model}</span>
                  <div className={styles.modelSource}>
                    <span className={styles.modelHostIcon} title={m.isLocal ? "Local" : "Remote"}>
                      {m.isLocal ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
                      )}
                    </span>
                    <Badge
                      label={m.provider}
                      variant={PROVIDER_VARIANTS[m.provider] ?? "muted"}
                    />
                    {m.isLocal && <span className={styles.freeBadge}>FREE</span>}
                  </div>
                </div>
              </div>
              <div className={styles.modelStats}>
                <div className={styles.modelStat}>
                  <span className={styles.modelStatLabel}>Cost</span>
                  <span className={styles.modelStatValue}>
                    {m.isLocal ? "FREE" : formatCost(m.estimatedCost)}
                  </span>
                </div>
                <div className={styles.modelStat}>
                  <span className={styles.modelStatLabel}>Messages</span>
                  <span className={styles.modelStatValue}>{m.invocations}</span>
                </div>
                <div className={styles.modelStat}>
                  <span className={styles.modelStatLabel}>Input Tokens</span>
                  <span className={styles.modelStatValue}>
                    {formatTokens(m.estimatedInputTokens)}
                  </span>
                </div>
                <div className={styles.modelStat}>
                  <span className={styles.modelStatLabel}>Output Tokens</span>
                  <span className={styles.modelStatValue}>
                    {formatTokens(m.estimatedOutputTokens)}
                  </span>
                </div>
              </div>
              {m.agents.length > 0 && (
                <div className={styles.agentChips}>
                  {m.agents.map((a) => (
                    <span key={a} className={styles.agentChip}>{a}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        !modelLoading && (
          <div className={styles.card}>
            <div className={styles.emptyDetail}>
              No agent invocations detected in the last 7 days
            </div>
          </div>
        )
      )}

      {/* Cost by Model (horizontal bar chart) */}
      {models.filter((m) => m.invocations > 0).length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Cost by Model</h3>
          </div>
          <div className={styles.barChartList}>
            {models
              .filter((m) => m.invocations > 0)
              .map((m) => {
                const pct = modelCostTotal > 0 ? (m.estimatedCost / modelCostTotal) * 100 : 0;
                const color = getModelColor(m.model, m.isLocal);
                return (
                  <div key={m.model} className={styles.barChartRow}>
                    <div className={styles.barChartRowHeader}>
                      <span className={styles.barChartDot} style={{ background: color }} />
                      <span className={styles.barChartLabel}>{m.model}</span>
                      <span className={styles.barChartValue}>
                        {m.isLocal ? "FREE" : formatCost(m.estimatedCost)}
                      </span>
                      <span className={styles.barChartPct}>
                        {m.isLocal ? "--" : `${pct.toFixed(1)}%`}
                      </span>
                    </div>
                    <div className={styles.barChartTrack}>
                      <div
                        className={styles.barChartFill}
                        style={{ width: `${m.isLocal ? 0 : pct}%`, background: color }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}


    </div>
  );
}
