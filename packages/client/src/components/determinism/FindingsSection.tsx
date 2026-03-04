import { useState } from "react";
import { Badge } from "../shared/Badge.js";
import styles from "./FindingsSection.module.css";

interface LlmReview {
  isNonDeterministic: string;
  reasoning: string;
  suggestedRewrite: string | null;
  confidence: string;
}

interface Finding {
  id: string;
  category: string;
  severity: "high" | "medium" | "low" | "info";
  file: string | null;
  line: number | null;
  excerpt: string;
  context: string;
  suggestedAction: string;
  hasCrontabMatch?: boolean;
  hasMechanismReference?: boolean;
  mechanismNote?: string;
  crontabEntry?: string;
  estimatedIdleCost?: string;
  missingRules?: string[];
  llmReview?: LlmReview;
}

interface FindingsSectionProps {
  findings: Finding[];
  onDispatch: (finding: Finding) => void;
  onDeepScan: (id: string) => void;
  deepScanning: boolean;
}

const SEVERITY_VARIANT: Record<string, "red" | "yellow" | "blue" | "muted"> = {
  high: "red",
  medium: "yellow",
  low: "blue",
  info: "muted",
};

const CATEGORY_LABELS: Record<string, string> = {
  "schedule-without-crontab": "Schedule Language",
  "action-imperative": "Action Imperative",
  "missing-safeguard": "Missing Safeguard",
  "llm-spawning-cron": "LLM Spawning Cron",
  "rogue-scheduling": "Rogue Scheduling",
  "conditional-logic": "Conditional Logic",
};

const CONFIDENCE_VARIANT: Record<string, "red" | "yellow" | "green" | "muted"> = {
  high: "green",
  medium: "yellow",
  low: "muted",
};

export function FindingsSection({ findings, onDispatch, onDeepScan, deepScanning }: FindingsSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const filtered = filter === "all"
    ? findings
    : findings.filter((f) => f.severity === filter);

  const toggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Findings</span>
        <div className={styles.filters}>
          {["all", "high", "medium", "low", "info"].map((s) => (
            <button
              key={s}
              className={`${styles.filterBtn} ${filter === s ? styles.filterActive : ""}`}
              onClick={() => setFilter(s)}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.findings}>
        {filtered.length === 0 ? (
          <div className={styles.noFindings}>No findings match this filter.</div>
        ) : (
          filtered.map((f) => (
            <div
              key={f.id}
              className={`${styles.finding} ${styles[`severity_${f.severity}`]}`}
            >
              <div className={styles.findingHeader} onClick={() => toggle(f.id)}>
                <div className={styles.findingLeft}>
                  <Badge label={f.severity} variant={SEVERITY_VARIANT[f.severity]} />
                  <Badge label={CATEGORY_LABELS[f.category] ?? f.category} variant="muted" />
                  <span className={styles.findingExcerpt}>{f.excerpt}</span>
                </div>
                <div className={styles.findingRight}>
                  {f.file && (
                    <span className={styles.findingFile}>
                      {f.file}{f.line ? `:${f.line}` : ""}
                    </span>
                  )}
                  <span className={styles.chevron}>
                    {expandedId === f.id ? "\u25B2" : "\u25BC"}
                  </span>
                </div>
              </div>

              {expandedId === f.id && (
                <div className={styles.findingBody}>
                  <div className={styles.detail}>
                    <label>Context:</label>
                    <span>{f.context}</span>
                  </div>
                  <div className={styles.detail}>
                    <label>Suggested action:</label>
                    <span>{f.suggestedAction}</span>
                  </div>

                  {f.hasCrontabMatch !== undefined && (
                    <div className={styles.detail}>
                      <label>Crontab match:</label>
                      <span>{f.hasCrontabMatch ? "Yes" : "No"}{f.crontabEntry ? ` — ${f.crontabEntry}` : ""}</span>
                    </div>
                  )}

                  {f.mechanismNote && (
                    <div className={styles.detail}>
                      <label>Mechanism:</label>
                      <span>{f.mechanismNote}</span>
                    </div>
                  )}

                  {f.missingRules && f.missingRules.length > 0 && (
                    <div className={styles.detail}>
                      <label>Missing rules:</label>
                      <span>{f.missingRules.join(", ")}</span>
                    </div>
                  )}

                  {f.estimatedIdleCost && (
                    <div className={styles.detail}>
                      <label>Estimated idle cost:</label>
                      <span>{f.estimatedIdleCost}</span>
                    </div>
                  )}

                  {f.llmReview && (
                    <div className={styles.llmReview}>
                      <div className={styles.llmHeader}>
                        <span className={styles.llmTitle}>LLM Review</span>
                        <Badge
                          label={`${f.llmReview.confidence} confidence`}
                          variant={CONFIDENCE_VARIANT[f.llmReview.confidence] ?? "muted"}
                        />
                        <Badge
                          label={f.llmReview.isNonDeterministic === "yes" ? "Non-deterministic" : f.llmReview.isNonDeterministic === "no" ? "Deterministic" : "Uncertain"}
                          variant={f.llmReview.isNonDeterministic === "yes" ? "red" : f.llmReview.isNonDeterministic === "no" ? "green" : "yellow"}
                        />
                      </div>
                      <div className={styles.llmReasoning}>{f.llmReview.reasoning}</div>
                      {f.llmReview.suggestedRewrite && (
                        <pre className={styles.llmRewrite}>{f.llmReview.suggestedRewrite}</pre>
                      )}
                    </div>
                  )}

                  <div className={styles.findingActions}>
                    {!f.llmReview && f.category !== "missing-safeguard" && (
                      <button
                        className={styles.reviewBtn}
                        onClick={() => onDeepScan(f.id)}
                        disabled={deepScanning}
                      >
                        {deepScanning ? "Reviewing..." : "Review (OC)"}
                      </button>
                    )}
                    {f.category === "missing-safeguard" ? (
                      <span className={styles.configSyncHint}>Use Config Sync to fix</span>
                    ) : (
                      <button
                        className={styles.dispatchBtn}
                        onClick={() => onDispatch(f)}
                      >
                        Dispatch Fix
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
