import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client.js";
import styles from "./MemoryDashboard.module.css";

/* ── Types ── */

interface BootstrapFile {
  name: string;
  exists: boolean;
  chars: number;
  lines: number;
  tokens: number;
  modifiedAt: string | null;
}

interface DailyNote {
  name: string;
  date: string | null;
  chars: number;
  tokens: number;
  modifiedAt: string;
}

interface MemorySection {
  heading: string;
  lineStart: number;
  lineCount: number;
  tokens: number;
  preview: string;
}

interface DirFile {
  path: string;
  name: string;
  chars: number;
  tokens: number;
  lines: number;
  modifiedAt: string;
}

interface HealthIssue {
  level: "critical" | "warning" | "info";
  message: string;
}

interface AgentMemory {
  name: string;
  displayName: string;
  workspace: string;
  bootstrap: {
    files: BootstrapFile[];
    totalChars: number;
    totalTokens: number;
    fileCount: number;
  };
  dailyNotes: {
    notes: DailyNote[];
    totalChars: number;
    totalTokens: number;
    count: number;
  };
  memory: {
    lines: number;
    tokens: number;
    chars: number;
    modifiedAt: string | null;
    sections: MemorySection[];
    lineLimit: number;
  };
  docs: { files: DirFile[]; totalChars: number; totalTokens: number; count: number };
  config: { files: DirFile[]; totalChars: number; totalTokens: number; count: number };
  health: { status: "healthy" | "warning" | "critical"; issues: HealthIssue[] };
}

interface MemorySystem {
  backend: string;
  details: Record<string, any>;
}

interface MemoryData {
  agents: AgentMemory[];
  totals: {
    agents: number;
    bootstrapTokens: number;
    dailyNoteTokens: number;
    totalMemoryTokens: number;
    healthy: number;
    warning: number;
    critical: number;
  };
  memorySystem?: MemorySystem;
}


/* ── Helpers ── */

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtChars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const FILE_COLORS: Record<string, string> = {
  "AGENTS.md": "#f59e0b",
  "SOUL.md": "#14b8a6",
  "TOOLS.md": "#ef4444",
  "IDENTITY.md": "#ec4899",
  "USER.md": "#06b6d4",
  "HEARTBEAT.md": "#8b5cf6",
  "BOOT.md": "#84cc16",
  "MEMORY.md": "#a855f7",
};

const FILE_SEGMENT_CLASSES: Record<string, string> = {
  "AGENTS.md": styles.segAgents,
  "SOUL.md": styles.segSoul,
  "TOOLS.md": styles.segTools,
  "IDENTITY.md": styles.segIdentity,
  "USER.md": styles.segUser,
  "HEARTBEAT.md": styles.segHeartbeat,
  "BOOT.md": styles.segBoot,
  "MEMORY.md": styles.segMemory,
};

const STATUS_ICON: Record<string, string> = {
  healthy: "✓",
  warning: "⚠",
  critical: "✗",
};

/* ── Context Window Gauge ── */

function ContextGauge({ used, total }: { used: number; total: number }) {
  const pct = Math.min((used / total) * 100, 100);
  const r = 80;
  const circumHalf = Math.PI * r;
  const filled = (pct / 100) * circumHalf;
  const color = pct < 50 ? "#B4E33D" : pct < 80 ? "#f59e0b" : "#ef4444";

  return (
    <div className={styles.gaugeContainer}>
      <svg className={styles.gaugeSvg} viewBox="0 0 200 120">
        <path d="M 20 110 A 80 80 0 0 1 180 110" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" strokeLinecap="round" />
        <path d="M 20 110 A 80 80 0 0 1 180 110" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${filled} ${circumHalf}`} style={{ transition: "stroke-dasharray 0.5s ease" }} />
      </svg>
      <div className={styles.gaugeLabel}>{pct.toFixed(1)}%</div>
      <div className={styles.gaugeSublabel}>{fmtTokens(used)} / {fmtTokens(total)} tokens used at session start</div>
    </div>
  );
}

/* ── Memory Flow Diagram (pure SVG) ── */

function MemoryFlowDiagram({ agent }: { agent: AgentMemory }) {
  const bTok = agent.bootstrap.totalTokens;
  const dTok = agent.dailyNotes.totalTokens;
  const mTok = agent.memory.tokens;
  const docTok = agent.docs.totalTokens;
  const cfgTok = agent.config.totalTokens;

  return (
    <svg viewBox="0 0 760 180" style={{ width: "100%", maxWidth: 760, height: "auto" }}>
      {/* Bootstrap Files */}
      <rect x="10" y="10" width="150" height="60" rx="10" fill="rgba(59,130,246,0.15)" stroke="rgba(59,130,246,0.4)" strokeWidth="1" />
      <text x="85" y="32" textAnchor="middle" fill="#3b82f6" fontSize="11" fontWeight="600">Bootstrap Files</text>
      <text x="85" y="48" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10">{agent.bootstrap.fileCount} files · {fmtTokens(bTok)} tok</text>
      <text x="85" y="62" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="9">Injected every session</text>

      {/* Daily Notes */}
      <rect x="10" y="84" width="150" height="60" rx="10" fill="rgba(168,85,247,0.15)" stroke="rgba(168,85,247,0.4)" strokeWidth="1" />
      <text x="85" y="106" textAnchor="middle" fill="#a855f7" fontSize="11" fontWeight="600">Session Notes</text>
      <text x="85" y="122" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10">{agent.dailyNotes.count} files · {fmtTokens(dTok)} tok</text>
      <text x="85" y="136" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="9">Raw conversation logs</text>

      {/* Arrow: Bootstrap → Context */}
      <line x1="160" y1="40" x2="460" y2="52" stroke="rgba(59,130,246,0.5)" strokeWidth="1.5" markerEnd="url(#arrB)" />
      <text x="310" y="36" textAnchor="middle" fill="rgba(59,130,246,0.6)" fontSize="9">always loaded</text>

      {/* Arrow: Daily Notes → Compaction */}
      <line x1="160" y1="114" x2="270" y2="114" stroke="rgba(168,85,247,0.5)" strokeWidth="1.5" markerEnd="url(#arrP)" />

      {/* Compaction */}
      <rect x="272" y="84" width="160" height="60" rx="10" fill="rgba(168,85,247,0.08)" stroke="rgba(168,85,247,0.3)" strokeWidth="1" strokeDasharray="4 3" />
      <text x="352" y="106" textAnchor="middle" fill="#a855f7" fontSize="11" fontWeight="600">Compaction</text>
      <text x="352" y="122" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10">MEMORY.md: {mTok} tok / {agent.memory.lines} lines</text>
      <text x="352" y="136" textAnchor="middle" fill={agent.memory.lines > agent.memory.lineLimit ? "#ef4444" : "rgba(255,255,255,0.3)"} fontSize="9">
        {agent.memory.lines > agent.memory.lineLimit ? `OVER ${agent.memory.lineLimit}-line limit!` : `${agent.memory.lineLimit}-line limit`}
      </text>

      {/* Arrow: Compaction → Context */}
      <line x1="432" y1="100" x2="460" y2="72" stroke="rgba(180,227,61,0.5)" strokeWidth="1.5" markerEnd="url(#arrG)" />
      <text x="450" y="78" textAnchor="middle" fill="rgba(180,227,61,0.5)" fontSize="8">distilled</text>

      {/* Context Window */}
      <rect x="462" y="22" width="170" height="70" rx="12" fill="rgba(180,227,61,0.1)" stroke="rgba(180,227,61,0.5)" strokeWidth="1.5" />
      <text x="547" y="46" textAnchor="middle" fill="#B4E33D" fontSize="12" fontWeight="700">Context Window</text>
      <text x="547" y="62" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10">{fmtTokens(bTok)} bootstrap loaded</text>
      <text x="547" y="76" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="9">{fmtTokens(200_000 - bTok)} remaining of 200k</text>

      {/* Retrieval */}
      <rect x="462" y="106" width="170" height="56" rx="10" fill="rgba(251,191,36,0.1)" stroke="rgba(251,191,36,0.35)" strokeWidth="1" strokeDasharray="4 3" />
      <text x="547" y="128" textAnchor="middle" fill="#fbbf24" fontSize="11" fontWeight="600">Retrieval Index</text>
      <text x="547" y="144" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10">{agent.docs.count + agent.config.count} files · {fmtTokens(docTok + cfgTok)} tok</text>
      <text x="547" y="156" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="9">On-demand retrieval</text>

      {/* Arrow: Retrieval → Context */}
      <line x1="547" y1="106" x2="547" y2="92" stroke="rgba(251,191,36,0.4)" strokeWidth="1" strokeDasharray="3 3" markerEnd="url(#arrY)" />

      <defs>
        <marker id="arrB" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(59,130,246,0.6)" /></marker>
        <marker id="arrP" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(168,85,247,0.6)" /></marker>
        <marker id="arrG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(180,227,61,0.6)" /></marker>
        <marker id="arrY" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(251,191,36,0.5)" /></marker>
      </defs>
    </svg>
  );
}

/* ── Main Component ── */

export function MemoryDashboard() {
  const [data, setData] = useState<MemoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string>("main");
  const [previewFile, setPreviewFile] = useState<{ agent: string; fileName: string } | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [queryInput, setQueryInput] = useState("");
  const [queryResponse, setQueryResponse] = useState<string | null>(null);
  const [querying, setQuerying] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await api.memory();
    if (res.ok && res.data) {
      setData(res.data as MemoryData);
      const names = (res.data as MemoryData).agents.map((a) => a.name);
      if (!names.includes(selectedAgent)) {
        setSelectedAgent(names[0] ?? "main");
      }
    } else {
      setError(res.error ?? "Failed to load memory data");
    }
    setLoading(false);
  }, [selectedAgent]);

  useEffect(() => { fetchData(); }, []);

  const handleQuery = async () => {
    const msg = queryInput.trim();
    if (!msg || querying) return;
    setQuerying(true);
    setQueryError(null);
    setQueryResponse(null);
    const res = await api.memoryQuery(selectedAgent, msg);
    if (res.ok && res.data) {
      setQueryResponse(res.data.response);
    } else {
      setQueryError(res.error ?? "Query failed");
    }
    setQuerying(false);
  };

  const handlePreview = async (agent: string, fileName: string) => {
    setPreviewFile({ agent, fileName });
    setPreviewLoading(true);
    const res = await api.memoryFile(agent, fileName);
    if (res.ok && res.data) {
      setPreviewContent(res.data.content);
    } else {
      setPreviewContent(`Error: ${res.error}`);
    }
    setPreviewLoading(false);
  };

  if (loading && !data) {
    return (
      <div className={styles.container}>
        <h1 className={styles.pageHeading}>Memory</h1>
        <div className={styles.loading}>Loading memory data...</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={styles.container}>
        <h1 className={styles.pageHeading}>Memory</h1>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const agent = data.agents.find((a) => a.name === selectedAgent) ?? data.agents[0];
  if (!agent) return null;

  const bootstrapTotal = agent.bootstrap.totalTokens;
  const contextCapacity = 200_000;

  return (
    <div className={styles.container}>
      <h1 className={styles.pageHeading}>Memory</h1>

      {/* Stats pills */}
      <div className={styles.statsRow}>
        <div className={styles.pills}>
          <div className={styles.pillGroup}>
            <span className={styles.pillLabel}>Agents</span>
            <span className={`${styles.pill} ${styles.pillBlue}`}>{data.totals.agents}</span>
          </div>
          <div className={styles.pillGroup}>
            <span className={styles.pillLabel}>Healthy</span>
            <span className={`${styles.pill} ${data.totals.critical > 0 ? styles.pillRed : data.totals.warning > 0 ? styles.pillYellow : styles.pillGreen}`}>
              {data.totals.healthy}/{data.totals.agents}
            </span>
          </div>
          <div className={styles.pillGroup}>
            <span className={styles.pillLabel}>Bootstrap Budget</span>
            <span className={`${styles.pill} ${styles.pillGreen}`}>{fmtTokens(data.totals.bootstrapTokens)} tokens</span>
          </div>
          <div className={styles.pillGroup}>
            <span className={styles.pillLabel}>Daily Notes</span>
            <span className={`${styles.pill} ${styles.pillMuted}`}>{fmtTokens(data.totals.dailyNoteTokens)} tokens</span>
          </div>
          {data.memorySystem && (
            <div className={styles.pillGroup}>
              <span className={styles.pillLabel}>Memory System</span>
              <span className={`${styles.pill} ${data.memorySystem.backend === "qmd" ? styles.pillBlue : styles.pillMuted}`}>
                {data.memorySystem.backend === "qmd" ? "QMD" : data.memorySystem.backend === "default" ? "Default" : data.memorySystem.backend}
              </span>
            </div>
          )}
        </div>
        <button className={styles.refreshBtn} onClick={fetchData} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* Agent tabs with health indicators */}
      <div className={styles.agentTabs}>
        {data.agents.map((a) => (
          <button
            key={a.name}
            className={`${styles.agentTab} ${selectedAgent === a.name ? styles.agentTabActive : ""}`}
            onClick={() => { setSelectedAgent(a.name); setQueryInput(""); setQueryResponse(null); setQueryError(null); }}
          >
            <span className={`${styles.healthDot} ${styles[`health_${a.health.status}`]}`} title={a.health.status}>
              {STATUS_ICON[a.health.status]}
            </span>
            {a.displayName}
            <span className={styles.agentTokens}>{fmtTokens(a.bootstrap.totalTokens)}</span>
          </button>
        ))}
      </div>

      {/* Health issues (if any) */}
      {agent.health.issues.length > 0 && (
        <div className={styles.healthPanel}>
          <div className={styles.healthTitle}>
            {agent.health.status === "critical" ? "Critical Issues" : agent.health.status === "warning" ? "Warnings" : "Notes"} — {agent.displayName}
          </div>
          <div className={styles.healthList}>
            {agent.health.issues.map((issue, i) => (
              <div key={i} className={`${styles.healthIssue} ${styles[`issue_${issue.level}`]}`}>
                <span className={styles.issueIcon}>
                  {issue.level === "critical" ? "✗" : issue.level === "warning" ? "⚠" : "ℹ"}
                </span>
                {issue.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Query Agent Memory */}
      <div className={styles.querySection}>
        <div className={styles.queryBar}>
          <svg className={styles.queryIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <input
            className={styles.queryInput}
            type="text"
            placeholder={`Ask ${agent.displayName} about their memory... (e.g. "What do you know about email config?")`}
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleQuery(); }}
            disabled={querying}
          />
          <button
            className={styles.queryBtn}
            onClick={handleQuery}
            disabled={querying || !queryInput.trim()}
          >
            {querying ? "Asking..." : "Ask"}
          </button>
        </div>
        {querying && (
          <div className={styles.queryLoading}>
            <span className={styles.querySpinner} />
            Querying {agent.displayName} via OpenClaw...
          </div>
        )}
        {queryError && (
          <div className={styles.queryError}>{queryError}</div>
        )}
        {queryResponse && (
          <div className={styles.queryResponse}>
            <div className={styles.queryResponseHeader}>
              <span className={styles.queryResponseAgent}>{agent.displayName}</span>
              <span className={styles.queryResponseMeta}>via openclaw agent</span>
            </div>
            <pre className={styles.queryResponseBody}>{queryResponse}</pre>
          </div>
        )}
      </div>

      {/* Boundary cards grid */}
      <div className={styles.boundaryGrid}>

        {/* ── 1. Bootstrap Files ── */}
        <div className={`${styles.boundaryCard} ${styles.boundaryCardFull}`}>
          <div className={styles.boundaryHeader}>
            <div className={styles.boundaryTitle}>
              <div className={`${styles.boundaryIcon} ${styles.iconBootstrap}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <div>
                <div className={styles.boundaryName}>Bootstrap Files</div>
                <div className={styles.boundaryDesc}>Injected into every conversation start — this is what the agent "knows" from the first token</div>
              </div>
            </div>
            <span className={styles.boundaryTokens}>
              {agent.bootstrap.fileCount}/{agent.bootstrap.files.length} files · {fmtTokens(agent.bootstrap.totalTokens)} tok
            </span>
          </div>
          <div className={styles.boundaryBody}>
            <div className={styles.tokenBar}>
              {agent.bootstrap.files.filter((f) => f.exists).map((f) => (
                <div
                  key={f.name}
                  className={`${styles.tokenSegment} ${FILE_SEGMENT_CLASSES[f.name] ?? styles.segBootstrap}`}
                  style={{ width: `${(f.tokens / agent.bootstrap.totalTokens) * 100}%` }}
                  title={`${f.name}: ${f.tokens} tokens (${((f.tokens / agent.bootstrap.totalTokens) * 100).toFixed(1)}%)`}
                />
              ))}
            </div>

            <div className={styles.fileList} style={{ marginTop: 12 }}>
              {agent.bootstrap.files.map((f) => (
                <div
                  key={f.name}
                  className={styles.fileRow}
                  onClick={() => f.exists && handlePreview(agent.name, f.name)}
                >
                  <div className={styles.fileLeft}>
                    <span className={`${styles.fileStatus} ${f.exists ? (f.chars < 20 ? styles.fileStatusWarn : styles.fileStatusOk) : styles.fileStatusMissing}`}>
                      {f.exists ? (f.chars < 20 ? "EMPTY" : "OK") : "MISSING"}
                    </span>
                    <span className={styles.filePill} style={{ background: FILE_COLORS[f.name] ?? "#3b82f6" }}>{f.name}</span>
                  </div>
                  <div className={styles.fileRight}>
                    {f.exists ? (
                      <>
                        <span className={styles.fileStat}><span className={styles.fileStatLabel}>raw </span>{fmtChars(f.chars)} chars</span>
                        <span className={styles.fileStat}>~{fmtTokens(f.tokens)} tok</span>
                        <span className={styles.fileStat}>{f.lines} lines</span>
                        <span className={styles.fileStat}>{timeAgo(f.modifiedAt)}</span>
                        <span className={styles.fileChevron}>›</span>
                      </>
                    ) : (
                      <span className={styles.fileStat}>—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── 2. MEMORY.md Sections (Curated Memory) ── */}
        <div className={`${styles.boundaryCard} ${styles.boundaryCardFull}`}>
          <div className={styles.boundaryHeader}>
            <div className={styles.boundaryTitle}>
              <div className={`${styles.boundaryIcon} ${styles.iconTranscript}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              </div>
              <div>
                <div className={styles.boundaryName}>Curated Memory (MEMORY.md)</div>
                <div className={styles.boundaryDesc}>
                  Distilled long-term knowledge — {agent.memory.sections.length} sections, {agent.memory.lines}/{agent.memory.lineLimit} lines
                  {agent.memory.lines > agent.memory.lineLimit && (
                    <span className={styles.overLimit}> — OVER LIMIT, compaction needed</span>
                  )}
                </div>
              </div>
            </div>
            <span className={styles.boundaryTokens}>{fmtTokens(agent.memory.tokens)} tok</span>
          </div>
          <div className={styles.boundaryBody}>
            {/* Line usage bar */}
            <div className={styles.lineUsageBar}>
              <div
                className={styles.lineUsageFill}
                style={{
                  width: `${Math.min((agent.memory.lines / agent.memory.lineLimit) * 100, 100)}%`,
                  background: agent.memory.lines > agent.memory.lineLimit ? "#ef4444" : agent.memory.lines > agent.memory.lineLimit * 0.8 ? "#f59e0b" : "#B4E33D",
                }}
              />
            </div>
            <div className={styles.lineUsageLabel}>
              {agent.memory.lines} / {agent.memory.lineLimit} lines used
              {agent.memory.modifiedAt && <span> · Last updated {timeAgo(agent.memory.modifiedAt)}</span>}
            </div>

            {agent.memory.sections.length === 0 ? (
              <div className={styles.emptyState}>No sections found in MEMORY.md</div>
            ) : (
              <div className={styles.sectionList}>
                {agent.memory.sections.map((s) => (
                  <div key={s.heading} className={styles.sectionRow}>
                    <div
                      className={styles.sectionHeader}
                      onClick={() => setExpandedSection(expandedSection === s.heading ? null : s.heading)}
                    >
                      <div className={styles.sectionLeft}>
                        <span className={styles.sectionChevron}>{expandedSection === s.heading ? "▲" : "▼"}</span>
                        <span className={styles.sectionName}>{s.heading}</span>
                      </div>
                      <div className={styles.sectionRight}>
                        <span className={styles.sectionStat}>{s.lineCount} lines</span>
                        <span className={styles.sectionStat}>{fmtTokens(s.tokens)} tok</span>
                      </div>
                    </div>
                    {expandedSection === s.heading && (
                      <div className={styles.sectionPreview}>{s.preview || "(empty section)"}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── 3. Context Window ── */}
        <div className={styles.boundaryCard}>
          <div className={styles.boundaryHeader}>
            <div className={styles.boundaryTitle}>
              <div className={`${styles.boundaryIcon} ${styles.iconContext}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              </div>
              <div>
                <div className={styles.boundaryName}>Context Window</div>
                <div className={styles.boundaryDesc}>Active working memory per session</div>
              </div>
            </div>
          </div>
          <div className={styles.boundaryBody}>
            <ContextGauge used={bootstrapTotal} total={contextCapacity} />
            <div className={styles.contextBreakdown}>
              <div className={styles.contextRow}>
                <span className={styles.contextLabel}>Bootstrap injection</span>
                <span className={styles.contextValue}>{fmtTokens(bootstrapTotal)} tok</span>
              </div>
              <div className={styles.contextRow}>
                <span className={styles.contextLabel}>Available for conversation</span>
                <span className={styles.contextValue}>{fmtTokens(contextCapacity - bootstrapTotal)} tok</span>
              </div>
              <div className={styles.contextRow}>
                <span className={styles.contextLabel}>Model capacity (Claude)</span>
                <span className={styles.contextValue}>{fmtTokens(contextCapacity)} tok</span>
              </div>
              <div className={styles.contextRow}>
                <span className={styles.contextLabel}>Largest bootstrap file</span>
                <span className={styles.contextValue}>
                  {agent.bootstrap.files.filter((f) => f.exists).sort((a, b) => b.tokens - a.tokens)[0]?.name ?? "—"}
                  {" ("}{fmtTokens(agent.bootstrap.files.filter((f) => f.exists).sort((a, b) => b.tokens - a.tokens)[0]?.tokens ?? 0)}{")"}
                </span>
              </div>
              <div className={styles.contextRow}>
                <span className={styles.contextLabel}>Bootstrap % of context</span>
                <span className={styles.contextValue}>{((bootstrapTotal / contextCapacity) * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 4. Transcript / Compaction ── */}
        <div className={styles.boundaryCard}>
          <div className={styles.boundaryHeader}>
            <div className={styles.boundaryTitle}>
              <div className={`${styles.boundaryIcon} ${styles.iconTranscript}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
              </div>
              <div>
                <div className={styles.boundaryName}>Session Notes</div>
                <div className={styles.boundaryDesc}>Raw session logs distilled into MEMORY.md</div>
              </div>
            </div>
          </div>
          <div className={styles.boundaryBody}>
            <div className={styles.contextBreakdown}>
              <div className={styles.contextRow}>
                <span className={styles.contextLabel}>Daily notes</span>
                <span className={styles.contextValue}>{agent.dailyNotes.count} files</span>
              </div>
              <div className={styles.contextRow}>
                <span className={styles.contextLabel}>Total volume</span>
                <span className={styles.contextValue}>{fmtTokens(agent.dailyNotes.totalTokens)} tok ({fmtChars(agent.dailyNotes.totalChars)} chars)</span>
              </div>
              <div className={styles.contextRow}>
                <span className={styles.contextLabel}>Compression ratio</span>
                <span className={styles.contextValue}>
                  {agent.dailyNotes.totalTokens > 0
                    ? `${(agent.dailyNotes.totalTokens / Math.max(agent.memory.tokens, 1)).toFixed(1)}:1`
                    : "—"}
                </span>
              </div>
              <div className={styles.contextRow}>
                <span className={styles.contextLabel}>Notes → MEMORY.md</span>
                <span className={styles.contextValue}>{fmtTokens(agent.dailyNotes.totalTokens)} → {fmtTokens(agent.memory.tokens)}</span>
              </div>
            </div>

            {agent.dailyNotes.notes.length > 0 && (
              <div className={styles.notesList} style={{ marginTop: 16 }}>
                {agent.dailyNotes.notes.slice(0, 10).map((n) => (
                  <div key={n.name} className={styles.noteRow}>
                    <div className={styles.noteLeft}>
                      <span className={styles.noteDot} />
                      <span className={styles.noteName}>{n.name}</span>
                    </div>
                    <div className={styles.noteRight}>
                      <span className={styles.noteStat}>{fmtTokens(n.tokens)} tok</span>
                      <span className={styles.noteStat}>{timeAgo(n.modifiedAt)}</span>
                    </div>
                  </div>
                ))}
                {agent.dailyNotes.notes.length > 10 && (
                  <div className={styles.emptyState}>+{agent.dailyNotes.notes.length - 10} more</div>
                )}
              </div>
            )}
            {agent.dailyNotes.notes.length === 0 && (
              <div className={styles.emptyState}>No daily notes found</div>
            )}
          </div>
        </div>

        {/* ── 5. Retrieval Index ── */}
        <div className={`${styles.boundaryCard} ${styles.boundaryCardFull}`}>
          <div className={styles.boundaryHeader}>
            <div className={styles.boundaryTitle}>
              <div className={`${styles.boundaryIcon} ${styles.iconRetrieval}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <div>
                <div className={styles.boundaryName}>Retrieval Index</div>
                <div className={styles.boundaryDesc}>
                  On-demand knowledge accessed during sessions — {agent.docs.count + agent.config.count + agent.dailyNotes.count} total files
                </div>
              </div>
            </div>
            <span className={styles.boundaryTokens}>
              {fmtTokens(agent.docs.totalTokens + agent.config.totalTokens + agent.dailyNotes.totalTokens)} tok
            </span>
          </div>
          <div className={styles.boundaryBody}>
            <div className={styles.retrievalGrid}>
              {/* Daily Notes bucket */}
              <div className={styles.retrievalBucket}>
                <div className={styles.retrievalBucketHeader}>
                  <span className={styles.retrievalBucketName}>memory/</span>
                  <span className={styles.retrievalBucketStats}>{agent.dailyNotes.count} files · {fmtTokens(agent.dailyNotes.totalTokens)} tok</span>
                </div>
                {agent.dailyNotes.notes.slice(0, 4).map((n) => (
                  <div key={n.name} className={styles.retrievalFile}>
                    <span className={styles.retrievalFileName}>{n.name}</span>
                    <span className={styles.retrievalFileStat}>{fmtTokens(n.tokens)}</span>
                  </div>
                ))}
                {agent.dailyNotes.count > 4 && (
                  <div className={styles.retrievalMore}>+{agent.dailyNotes.count - 4} more</div>
                )}
              </div>

              {/* Docs bucket */}
              <div className={styles.retrievalBucket}>
                <div className={styles.retrievalBucketHeader}>
                  <span className={styles.retrievalBucketName}>docs/</span>
                  <span className={styles.retrievalBucketStats}>{agent.docs.count} files · {fmtTokens(agent.docs.totalTokens)} tok</span>
                </div>
                {agent.docs.count === 0 ? (
                  <div className={styles.retrievalEmpty}>No docs directory</div>
                ) : (
                  <>
                    {agent.docs.files.slice(0, 6).map((f) => (
                      <div key={f.path} className={styles.retrievalFile}>
                        <span className={styles.retrievalFileName} title={f.path}>{f.path}</span>
                        <span className={styles.retrievalFileStat}>{fmtTokens(f.tokens)}</span>
                      </div>
                    ))}
                    {agent.docs.count > 6 && (
                      <div className={styles.retrievalMore}>+{agent.docs.count - 6} more</div>
                    )}
                  </>
                )}
              </div>

              {/* Config bucket */}
              <div className={styles.retrievalBucket}>
                <div className={styles.retrievalBucketHeader}>
                  <span className={styles.retrievalBucketName}>config/</span>
                  <span className={styles.retrievalBucketStats}>{agent.config.count} files · {fmtTokens(agent.config.totalTokens)} tok</span>
                </div>
                {agent.config.count === 0 ? (
                  <div className={styles.retrievalEmpty}>No config files</div>
                ) : (
                  <>
                    {agent.config.files.slice(0, 6).map((f) => (
                      <div key={f.path} className={styles.retrievalFile}>
                        <span className={styles.retrievalFileName} title={f.path}>{f.path}</span>
                        <span className={styles.retrievalFileStat}>{fmtTokens(f.tokens)}</span>
                      </div>
                    ))}
                    {agent.config.count > 6 && (
                      <div className={styles.retrievalMore}>+{agent.config.count - 6} more</div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* File preview dialog */}
      {previewFile && (
        <div className={styles.dialogOverlay} onClick={(e) => { if (e.target === e.currentTarget) setPreviewFile(null); }}>
          <div className={styles.dialog}>
            <div className={styles.dialogHeader}>
              <div>
                <div className={styles.dialogTitle}>{previewFile.fileName}</div>
                <div className={styles.dialogMeta}>{(data.agents.find((a) => a.name === previewFile.agent)?.displayName ?? previewFile.agent)} workspace</div>
              </div>
              <button className={styles.dialogClose} onClick={() => setPreviewFile(null)}>✕</button>
            </div>
            <div className={styles.dialogContent}>
              {previewLoading ? "Loading..." : previewContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
