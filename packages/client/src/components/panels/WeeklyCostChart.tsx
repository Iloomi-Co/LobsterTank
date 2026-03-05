import { useState, useEffect, useMemo, useRef } from "react";
import { api } from "../../api/client.js";
import { getModelColor } from "../../utils/modelColors.js";
import styles from "./WeeklyCostChart.module.css";

interface DailyModelSpend {
  date: string;
  models: Record<string, number>;
  total: number;
}

interface ModelEntry {
  model: string;
  isLocal: boolean;
  invocations: number;
}

interface Tooltip {
  model: string;
  cost: number;
  color: string;
  x: number;
  y: number;
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDate(dateStr: string, compact = false): string {
  const d = new Date(dateStr + "T12:00:00");
  if (compact) return `${d.getMonth() + 1}/${d.getDate()}`;
  return `${SHORT_DAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

function formatCost(n: number): string {
  if (n >= 10) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

interface WeeklyCostChartProps {
  days?: number;
  selectedDay?: string | null;
  onSelectDay?: (date: string | null) => void;
}

export function WeeklyCostChart({ days = 7, selectedDay, onSelectDay }: WeeklyCostChartProps = {}) {
  const [daily, setDaily] = useState<DailyModelSpend[]>([]);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [totalCost, setTotalCost] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.spendByModel(days).then((res) => {
      if (res.ok && res.data) {
        setDaily(res.data.daily ?? []);
        setModels(res.data.models ?? []);
        setTotalCost(res.data.totalEstimatedCost ?? null);
      }
    });
  }, [days]);

  const allModelNames = useMemo(() => {
    const set = new Set<string>();
    for (const m of models) set.add(m.model);
    for (const d of daily) {
      for (const key of Object.keys(d.models)) set.add(key);
    }
    return [...set];
  }, [models, daily]);

  const maxTotal = useMemo(() => {
    return Math.max(...daily.map((d) => d.total), 0.001);
  }, [daily]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const hoveredModel = tooltip?.model ?? null;
  const hasHover = hoveredModel !== null;

  const handleSegmentEnter = (e: React.MouseEvent, name: string, cost: number, color: string) => {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      model: name,
      cost,
      color,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleSegmentMove = (e: React.MouseEvent) => {
    if (!tooltip || !chartRef.current) return;
    const rect = chartRef.current.getBoundingClientRect();
    setTooltip((prev) => prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>{days}-Day Cost</span>
        {totalCost !== null && (
          <span className={styles.total}>{formatCost(totalCost)}</span>
        )}
      </div>
      <div
        ref={chartRef}
        className={styles.chart}
        onMouseLeave={() => setTooltip(null)}
        onMouseMove={handleSegmentMove}
      >
        {daily.map((day) => {
          const pct = (day.total / maxTotal) * 100;
          const isToday = day.date === todayStr;
          const isSelected = selectedDay === day.date;
          const isDimmed = selectedDay != null && !isSelected;
          return (
            <div
              key={day.date}
              className={`${styles.barCol} ${isSelected ? styles.barColSelected : ""}`}
              onClick={() => onSelectDay?.(isSelected ? null : day.date)}
            >
              {days <= 10 && (
                <span className={styles.barCost}>{formatCost(day.total)}</span>
              )}
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ height: `${Math.max(pct, 3)}%`, opacity: isDimmed ? 0.4 : 1, transition: "opacity 0.2s" }}>
                  {allModelNames.map((name) => {
                    const cost = day.models[name] ?? 0;
                    const segPct = day.total > 0 ? (cost / day.total) * 100 : 0;
                    if (segPct === 0) return null;
                    const m = models.find((x) => x.model === name);
                    const color = getModelColor(name, m?.isLocal ?? false);
                    return (
                      <div
                        key={name}
                        className={styles.barSegment}
                        style={{
                          height: `${segPct}%`,
                          background: color,
                          opacity: hasHover && hoveredModel !== name ? 0.2 : 0.85,
                        }}
                        onMouseEnter={(e) => handleSegmentEnter(e, name, cost, color)}
                      />
                    );
                  })}
                </div>
              </div>
              <span className={`${styles.barLabel} ${isToday ? styles.barLabelToday : ""}`}>
                {formatDate(day.date, days > 10)}
              </span>
            </div>
          );
        })}
        {tooltip && (
          <div
            className={styles.tooltip}
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <span className={styles.tooltipDot} style={{ background: tooltip.color }} />
            <span className={styles.tooltipModel}>{tooltip.model}</span>
            <span className={styles.tooltipCost}>{formatCost(tooltip.cost)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
