import { useCallback, useState } from "react";
import { Badge } from "../shared/Badge.js";
import { usePolling } from "../../hooks/usePolling.js";
import { api } from "../../api/client.js";
import { getModelColor, formatTokens as fmtTokens } from "../../utils/modelColors.js";
import { WeeklyCostChart } from "../panels/WeeklyCostChart.js";
import { TokensByModel } from "../panels/TokensByModel.js";
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

interface DailyModelSpend {
  date: string;
  models: Record<string, number>;
  total: number;
}

interface ModelSpendResponse {
  models: ModelEntry[];
  totalEstimatedCost: number;
  localSavings: number;
  activeModelCount: number;
  mostActiveModel: string;
  daily: DailyModelSpend[];
  lastUpdated: string;
  error?: string;
}

// ── Constants ───────────────────────────────────────────

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];


const PROVIDER_VARIANTS: Record<string, "blue" | "green" | "purple" | "muted"> = {
  anthropic: "blue",
  ollama: "green",
  openai: "purple",
};

// ── Helpers ─────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return `${SHORT_DAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

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
  const spendFetcher = useCallback(() => api.spend(), []);
  const modelFetcher = useCallback(() => api.spendByModel(), []);

  const { data: spendData, error: spendError, loading: spendLoading } = usePolling<SpendResponse>({ fetcher: spendFetcher });
  const { data: modelData, loading: modelLoading } = usePolling<ModelSpendResponse>({ fetcher: modelFetcher, delay: 200 });

  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const daily = spendData?.daily ?? [];
  const totals = spendData?.totals ?? null;
  const totalRatio = totals ? cacheHitRatio(totals) : 0;

  const models = modelData?.models ?? [];
  const modelDaily = modelData?.daily ?? [];

  const selectedDayData = daily.find((d) => d.date === selectedDay) ?? null;
  const selectedDayModel = modelDaily.find((d) => d.date === selectedDay) ?? null;

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

  // ── Render ────────────────────────────────────────────

  return (
    <div className={styles.container}>
      {/* Hero Row */}
      <div className={styles.heroRow}>
        <div className={styles.heroCard}>
          <span className={styles.heroLabel}>7-Day Total</span>
          <span className={styles.heroValue}>
            {modelData ? formatCost(modelData.totalEstimatedCost) : totals ? formatCost(totals.totalCost) : "--"}
          </span>
        </div>
        <div className={styles.heroCard}>
          <span className={styles.heroLabel}>Local Savings</span>
          <span className={styles.heroValueGreen}>
            {modelData ? formatCost(modelData.localSavings) : "--"}
          </span>
        </div>
        <div className={styles.heroCard}>
          <span className={styles.heroLabel}>Most Active Model</span>
          <span className={styles.heroValueSm}>
            {modelData?.mostActiveModel && modelData.mostActiveModel !== "none"
              ? modelData.mostActiveModel
              : "--"}
          </span>
        </div>
        <div className={styles.heroCard}>
          <span className={styles.heroLabel}>Active Models</span>
          <span className={styles.heroValue}>
            {modelData ? String(modelData.activeModelCount) : "--"}
          </span>
        </div>
      </div>

      {/* Model Cards */}
      {models.length > 0 ? (
        <div className={styles.modelGrid}>
          {models.map((m) => (
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

      {/* Daily Spend Chart (interactive) */}
      <WeeklyCostChart />

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

      {/* Day Detail */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Day Detail</h3>
        </div>
        {selectedDayData ? (
          <div className={styles.dayDetail}>
            <div className={styles.dayDetailHeader}>
              <span className={styles.dayDetailTitle}>{formatDate(selectedDayData.date)}</span>
              <Badge
                label={`${(cacheHitRatio(selectedDayData) * 100).toFixed(0)}% hit`}
                variant={ratioVariant(cacheHitRatio(selectedDayData))}
              />
            </div>
            <div className={styles.dayDetailGrid}>
              <div className={styles.dayDetailItem}>
                <span className={styles.dayDetailLabel}>Total Cost</span>
                <span className={styles.dayDetailValue}>{formatCost(selectedDayData.totalCost)}</span>
              </div>
              <div className={styles.dayDetailItem}>
                <span className={styles.dayDetailLabel}>Total Tokens</span>
                <span className={styles.dayDetailValue}>{formatTokens(selectedDayData.totalTokens)}</span>
              </div>
              <div className={styles.dayDetailItem}>
                <span className={styles.dayDetailLabel}>Input</span>
                <span className={styles.dayDetailValue}>{formatTokens(selectedDayData.input)} — {formatCost(selectedDayData.inputCost)}</span>
              </div>
              <div className={styles.dayDetailItem}>
                <span className={styles.dayDetailLabel}>Output</span>
                <span className={styles.dayDetailValue}>{formatTokens(selectedDayData.output)} — {formatCost(selectedDayData.outputCost)}</span>
              </div>
              <div className={styles.dayDetailItem}>
                <span className={styles.dayDetailLabel}>Cache Read</span>
                <span className={styles.dayDetailValue}>{formatTokens(selectedDayData.cacheRead)} — {formatCost(selectedDayData.cacheReadCost)}</span>
              </div>
              <div className={styles.dayDetailItem}>
                <span className={styles.dayDetailLabel}>Cache Write</span>
                <span className={styles.dayDetailValue}>{formatTokens(selectedDayData.cacheWrite)} — {formatCost(selectedDayData.cacheWriteCost)}</span>
              </div>
            </div>
            {/* Model cost estimates for selected day */}
            {selectedDayModel && Object.keys(selectedDayModel.models).length > 0 && (
              <>
                <div style={{ marginTop: 16, borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
                  <span className={styles.dayDetailLabel}>Model Costs</span>
                </div>
                <div className={styles.dayDetailGrid} style={{ marginTop: 8 }}>
                  {Object.entries(selectedDayModel.models).map(([model, cost]) => {
                    const m = models.find((x) => x.model === model);
                    return (
                      <div key={model} className={styles.dayDetailItem}>
                        <span className={styles.dayDetailLabel}>{model}</span>
                        <span className={styles.dayDetailValue}>
                          {m?.isLocal ? "FREE" : formatCost(cost)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className={styles.emptyDetail}>
            Click a bar in the chart to view daily breakdown
          </div>
        )}
      </div>
    </div>
  );
}
