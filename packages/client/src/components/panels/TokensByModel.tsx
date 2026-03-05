import { useState, useEffect, useMemo } from "react";
import { api } from "../../api/client.js";
import { getModelColor, formatTokens } from "../../utils/modelColors.js";
import styles from "./TokensByModel.module.css";

interface ModelEntry {
  model: string;
  invocations: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  isLocal: boolean;
}

const CX = 75;
const CY = 75;
const OUTER_R = 75;
const INNER_R = 42;
const HOVER_OFFSET = 5;

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(startAngle: number, endAngle: number): string {
  const sweep = endAngle - startAngle;
  const largeArc = sweep > 180 ? 1 : 0;
  const outerStart = polarToXY(CX, CY, OUTER_R, startAngle);
  const outerEnd = polarToXY(CX, CY, OUTER_R, endAngle);
  const innerEnd = polarToXY(CX, CY, INNER_R, endAngle);
  const innerStart = polarToXY(CX, CY, INNER_R, startAngle);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${OUTER_R} ${OUTER_R} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER_R} ${INNER_R} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

export function TokensByModel() {
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    api.spendByModel().then((res) => {
      if (res.ok && res.data?.models) setModels(res.data.models);
    });
  }, []);

  const segments = useMemo(() => {
    const active = models.filter((m) => m.invocations > 0);
    const total = active.reduce((s, m) => s + m.estimatedInputTokens + m.estimatedOutputTokens, 0);
    if (total === 0) return { items: [], total: 0 };

    const items = active.map((m) => {
      const tokens = m.estimatedInputTokens + m.estimatedOutputTokens;
      return {
        label: m.model,
        value: tokens,
        color: getModelColor(m.model, m.isLocal),
        pct: (tokens / total) * 100,
      };
    });

    return { items, total };
  }, [models]);

  const arcs = useMemo(() => {
    let acc = 0;
    return segments.items.map((seg) => {
      const startAngle = acc * 3.6;
      acc += seg.pct;
      const endAngle = acc * 3.6;
      const midAngle = (startAngle + endAngle) / 2;
      const midRad = ((midAngle - 90) * Math.PI) / 180;
      return {
        d: arcPath(startAngle, Math.min(endAngle, startAngle + 359.99)),
        tx: Math.cos(midRad) * HOVER_OFFSET,
        ty: Math.sin(midRad) * HOVER_OFFSET,
      };
    });
  }, [segments]);

  const hasHover = hoveredIndex !== null;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>Tokens by Model</span>
      </div>
      <div className={styles.content}>
        <svg
          className={styles.donut}
          viewBox={`-${HOVER_OFFSET} -${HOVER_OFFSET} ${150 + HOVER_OFFSET * 2} ${150 + HOVER_OFFSET * 2}`}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {segments.items.length === 0 && (
            <circle cx={CX} cy={CY} r={OUTER_R} fill="rgba(128,128,128,0.08)" />
          )}
          {arcs.map((arc, i) => (
            <path
              key={segments.items[i].label}
              d={arc.d}
              fill={segments.items[i].color}
              opacity={hasHover && hoveredIndex !== i ? 0.3 : 1}
              transform={hoveredIndex === i ? `translate(${arc.tx}, ${arc.ty})` : undefined}
              style={{ transition: "opacity 0.15s, transform 0.15s" }}
              onMouseEnter={() => setHoveredIndex(i)}
            />
          ))}
          <circle cx={CX} cy={CY} r={INNER_R} className={styles.holeBg} />
          <text x={CX} y={CY - 4} textAnchor="middle" className={styles.totalText}>
            {formatTokens(segments.total)}
          </text>
          <text x={CX} y={CY + 12} textAnchor="middle" className={styles.totalLabelText}>
            tokens
          </text>
        </svg>
        <div className={styles.legend}>
          {segments.items.map((seg, i) => (
            <div
              key={seg.label}
              className={`${styles.legendItem} ${hoveredIndex === i ? styles.legendItemActive : ""}`}
              style={{ opacity: hasHover && hoveredIndex !== i ? 0.4 : 1 }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span className={styles.legendDot} style={{ background: seg.color }} />
              <span className={styles.legendLabel}>{seg.label}</span>
              <span className={styles.legendValue}>{formatTokens(seg.value)}</span>
              <span className={styles.legendPct}>{seg.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
