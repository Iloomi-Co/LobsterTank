import { useState, useRef } from "react";
import styles from "./CacheHistory.module.css";

interface DailyCache {
  date: string;
  ratio: number; // 0–1
  cacheRead: number;
  cacheWrite: number;
}

interface Props {
  daily: DailyCache[];
  avgRatio: number;
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return `${SHORT_DAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

function ratioColor(r: number): string {
  if (r >= 0.7) return "var(--green)";
  if (r >= 0.4) return "var(--yellow)";
  return "var(--red)";
}

const CHART_W = 600;
const CHART_H = 140;
const PAD_L = 36;
const PAD_R = 12;
const PAD_T = 8;
const PAD_B = 4;
const INNER_W = CHART_W - PAD_L - PAD_R;
const INNER_H = CHART_H - PAD_T - PAD_B;

export function CacheHistory({ daily, avgRatio }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null);

  if (daily.length === 0) return null;

  // Map data to chart coordinates
  const points = daily.map((d, i) => {
    const x = PAD_L + (daily.length === 1 ? INNER_W / 2 : (i / (daily.length - 1)) * INNER_W);
    const y = PAD_T + INNER_H - d.ratio * INNER_H;
    return { x, y, ...d };
  });

  // Build SVG path
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${PAD_T + INNER_H} L${points[0].x},${PAD_T + INNER_H} Z`;

  // Grid lines at 25%, 50%, 75%, 100%
  const gridLines = [0.25, 0.5, 0.75, 1.0];

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!wrapRef.current || points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * CHART_W;
    // Find closest point
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dist = Math.abs(points[i].x - mx);
      if (dist < minDist) { minDist = dist; closest = i; }
    }
    const wrapRect = wrapRef.current.getBoundingClientRect();
    const px = (points[closest].x / CHART_W) * rect.width + rect.left - wrapRect.left;
    const py = (points[closest].y / CHART_H) * rect.height + rect.top - wrapRect.top;
    setHover({ idx: closest, x: px, y: py });
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>Cache Efficiency Trend</h3>
        <span className={styles.currentValue}>30-Day Avg: {(avgRatio * 100).toFixed(0)}%</span>
      </div>
      <div className={styles.chartWrap} ref={wrapRef}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* Grid */}
          {gridLines.map((g) => {
            const y = PAD_T + INNER_H - g * INNER_H;
            return (
              <g key={g}>
                <line className={styles.gridLine} x1={PAD_L} y1={y} x2={CHART_W - PAD_R} y2={y} />
                <text className={styles.gridLabel} x={PAD_L - 4} y={y + 3} textAnchor="end">
                  {(g * 100).toFixed(0)}%
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          <path d={areaPath} fill="var(--green)" className={styles.areaFill} />

          {/* Line */}
          <path d={linePath} className={styles.line} stroke="var(--green)" />

          {/* Dots */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={hover?.idx === i ? 5 : 3}
              fill={ratioColor(p.ratio)}
              stroke="var(--bg-panel)"
              className={styles.dot}
            />
          ))}
        </svg>

        {hover && (
          <div
            className={styles.tooltip}
            style={{ left: hover.x, top: hover.y }}
          >
            <span className={styles.tooltipDate}>{fmtDate(points[hover.idx].date)}</span>
            <span className={styles.tooltipValue}>
              {(points[hover.idx].ratio * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>
      <div className={styles.labels}>
        <span>{daily.length > 0 ? fmtDate(daily[0].date) : ""}</span>
        <span>{daily.length > 1 ? fmtDate(daily[daily.length - 1].date) : ""}</span>
      </div>
    </div>
  );
}
