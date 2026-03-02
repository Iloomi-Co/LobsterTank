import { useCallback, useState } from "react";
import { Panel } from "../shared/Panel.js";
import { Badge } from "../shared/Badge.js";
import { EmptyState } from "../shared/EmptyState.js";
import { usePolling } from "../../hooks/usePolling.js";
import { api } from "../../api/client.js";
import styles from "./SpendMonitor.module.css";

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

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

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

export function SpendMonitor() {
  const fetcher = useCallback(() => api.spend(), []);
  const { data, error, loading } = usePolling<SpendResponse>({ fetcher, delay: 400 });
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  if (!data && !loading) {
    return (
      <Panel title="Spend Monitor" icon="[$]" loading={loading} error={error} span={2}>
        <EmptyState message="No spend data available" />
      </Panel>
    );
  }

  if (data?.error) {
    return (
      <Panel title="Spend Monitor" icon="[$]" loading={loading} error={error} span={2}>
        <div className={styles.offlineNotice}>{data.error}</div>
      </Panel>
    );
  }

  const daily = data?.daily ?? [];
  const totals = data?.totals;
  const maxCost = Math.max(...daily.map((d) => d.totalCost), 0.01);
  const totalRatio = totals ? cacheHitRatio(totals) : 0;

  return (
    <Panel title="Spend Monitor" icon="[$]" loading={loading} error={error} span={2}>
      {data && (
        <div className={styles.content}>
          {/* Summary row */}
          <div className={styles.summaryRow}>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>7-Day Total</span>
              <span className={styles.summaryValue}>{totals ? formatCost(totals.totalCost) : "--"}</span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Daily Average</span>
              <span className={styles.summaryValueSm}>
                {totals && daily.length > 0 ? formatCost(totals.totalCost / daily.length) : "--"}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Total Tokens</span>
              <span className={styles.summaryValueSm}>
                {totals ? formatTokens(totals.totalTokens) : "--"}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Cache Hit Ratio</span>
              <span className={styles.summaryValueSm}>
                {totals ? (
                  <Badge label={`${(totalRatio * 100).toFixed(0)}% ${ratioLabel(totalRatio)}`} variant={ratioVariant(totalRatio)} />
                ) : "--"}
              </span>
            </div>
          </div>

          {/* Bar chart */}
          <div className={styles.chartSection}>
            <h4 className={styles.sectionTitle}>Daily Spend</h4>
            <div className={styles.chart}>
              {daily.map((day) => {
                const pct = (day.totalCost / maxCost) * 100;
                const isToday = day.date === new Date().toISOString().slice(0, 10);
                const ratio = cacheHitRatio(day);
                return (
                  <div
                    key={day.date}
                    className={`${styles.barCol} ${expandedDay === day.date ? styles.barColActive : ""}`}
                    onClick={() => setExpandedDay(expandedDay === day.date ? null : day.date)}
                  >
                    <span className={styles.barCost}>{formatCost(day.totalCost)}</span>
                    <div className={styles.barTrack}>
                      <div className={styles.barFillWrap} style={{ height: `${Math.max(pct, 2)}%` }}>
                        <div
                          className={styles.barCacheRead}
                          style={{ height: `${day.totalCost > 0 ? (day.cacheReadCost / day.totalCost) * 100 : 0}%` }}
                        />
                        <div
                          className={styles.barCacheWrite}
                          style={{ height: `${day.totalCost > 0 ? (day.cacheWriteCost / day.totalCost) * 100 : 0}%` }}
                        />
                        <div
                          className={styles.barDirect}
                          style={{ height: `${day.totalCost > 0 ? ((day.inputCost + day.outputCost) / day.totalCost) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <span className={`${styles.barLabel} ${isToday ? styles.barLabelToday : ""}`}>
                      {formatDate(day.date)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className={styles.legend}>
              <span className={styles.legendItem}><span className={styles.legendDotCacheRead} /> Cache Read</span>
              <span className={styles.legendItem}><span className={styles.legendDotCacheWrite} /> Cache Write</span>
              <span className={styles.legendItem}><span className={styles.legendDotDirect} /> Input + Output</span>
            </div>
          </div>

          {/* Cost breakdown */}
          {totals && (
            <div className={styles.breakdownSection}>
              <h4 className={styles.sectionTitle}>Cost Breakdown (7-Day)</h4>
              <div className={styles.breakdownGrid}>
                <CostRow label="Cache Write" cost={totals.cacheWriteCost} tokens={totals.cacheWrite} total={totals.totalCost} color="var(--purple)" />
                <CostRow label="Cache Read" cost={totals.cacheReadCost} tokens={totals.cacheRead} total={totals.totalCost} color="var(--green)" />
                <CostRow label="Input" cost={totals.inputCost} tokens={totals.input} total={totals.totalCost} color="var(--blue)" />
                <CostRow label="Output" cost={totals.outputCost} tokens={totals.output} total={totals.totalCost} color="var(--yellow)" />
              </div>
            </div>
          )}

          {/* Cache analysis */}
          {totals && (
            <div className={styles.cacheSection}>
              <h4 className={styles.sectionTitle}>Cache Efficiency</h4>
              <div className={styles.cacheBar}>
                <div
                  className={styles.cacheBarRead}
                  style={{ width: `${totalRatio * 100}%` }}
                />
                <div
                  className={styles.cacheBarWrite}
                  style={{ width: `${(1 - totalRatio) * 100}%` }}
                />
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
              <p className={styles.cacheNote}>
                {totalRatio >= 0.7
                  ? "Cache is working well — most tokens are served from cache at 1/10th the cost of fresh writes."
                  : totalRatio >= 0.4
                    ? "Cache hit ratio is moderate. Many sessions are creating new context rather than reusing cached prompts."
                    : "Cache hit ratio is low — most tokens are fresh writes at full price. Short or unique sessions prevent cache reuse."
                }
              </p>
            </div>
          )}

          {/* Expanded day detail */}
          {expandedDay && (() => {
            const day = daily.find((d) => d.date === expandedDay);
            if (!day) return null;
            const ratio = cacheHitRatio(day);
            return (
              <div className={styles.dayDetail}>
                <div className={styles.dayDetailHeader}>
                  <h4 className={styles.sectionTitle}>{formatDate(day.date)} Detail</h4>
                  <Badge label={`${(ratio * 100).toFixed(0)}% hit`} variant={ratioVariant(ratio)} />
                </div>
                <div className={styles.dayDetailGrid}>
                  <div className={styles.dayDetailItem}>
                    <span className={styles.dayDetailLabel}>Total Cost</span>
                    <span className={styles.dayDetailValue}>{formatCost(day.totalCost)}</span>
                  </div>
                  <div className={styles.dayDetailItem}>
                    <span className={styles.dayDetailLabel}>Total Tokens</span>
                    <span className={styles.dayDetailValue}>{formatTokens(day.totalTokens)}</span>
                  </div>
                  <div className={styles.dayDetailItem}>
                    <span className={styles.dayDetailLabel}>Input</span>
                    <span className={styles.dayDetailValue}>{formatTokens(day.input)} — {formatCost(day.inputCost)}</span>
                  </div>
                  <div className={styles.dayDetailItem}>
                    <span className={styles.dayDetailLabel}>Output</span>
                    <span className={styles.dayDetailValue}>{formatTokens(day.output)} — {formatCost(day.outputCost)}</span>
                  </div>
                  <div className={styles.dayDetailItem}>
                    <span className={styles.dayDetailLabel}>Cache Read</span>
                    <span className={styles.dayDetailValue}>{formatTokens(day.cacheRead)} — {formatCost(day.cacheReadCost)}</span>
                  </div>
                  <div className={styles.dayDetailItem}>
                    <span className={styles.dayDetailLabel}>Cache Write</span>
                    <span className={styles.dayDetailValue}>{formatTokens(day.cacheWrite)} — {formatCost(day.cacheWriteCost)}</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </Panel>
  );
}

function CostRow({ label, cost, tokens, total, color }: {
  label: string;
  cost: number;
  tokens: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (cost / total) * 100 : 0;
  return (
    <div className={styles.costRow}>
      <div className={styles.costRowHeader}>
        <span className={styles.costRowDot} style={{ background: color }} />
        <span className={styles.costRowLabel}>{label}</span>
        <span className={styles.costRowValue}>{formatCost(cost)}</span>
        <span className={styles.costRowPct}>{pct.toFixed(1)}%</span>
      </div>
      <div className={styles.costRowBar}>
        <div className={styles.costRowBarFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={styles.costRowTokens}>{formatTokens(tokens)} tokens</span>
    </div>
  );
}
