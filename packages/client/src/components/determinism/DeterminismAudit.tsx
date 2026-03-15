import { useState, useCallback, useEffect } from "react";
import { api } from "../../api/client.js";
import { FindingsSection } from "./FindingsSection.js";
import { DispatchFixDialog } from "./DispatchFixDialog.js";
import { Badge } from "../shared/Badge.js";
import styles from "./DeterminismAudit.module.css";
import auditStyles from "../panels/AuditPanel.module.css";

// ─── Types: Determinism ─────────────────────────────────────

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
  workspace: string | null;
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

interface ScanResult {
  scanTimestamp: string;
  target: string;
  workspacesScanned: string[];
  filesScanned: number;
  findings: Finding[];
  summary: { high: number; medium: number; low: number; info: number };
}

// ─── Types: Audit (config sync + tasks) ─────────────────────

interface DiscoveredTask {
  report: {
    scriptName: string;
    classification: "agent-wrapper" | "infrastructure" | "utility";
    checks: { id: string; label: string; passed: boolean; detail: string | null; agentOnly?: boolean; exempt?: boolean }[];
    passCount: number;
    totalApplicable: number;
    agentName: string | null;
    schedule: string | null;
    hasCrontabEntry: boolean;
  };
  inBin: boolean;
  inDeploy: boolean;
  deployStatus: "ok" | "update" | "new" | "not-in-deploy";
}

interface AuditData {
  changePlanText: string;
  totalChanges: number;
  taskWarnings: number;
  configSync: any;
  discoveredTasks: DiscoveredTask[];
  crontab: any;
  deployOnlyScripts: string[];
  issues: any[];
  gitStatus: any;
  applied?: string[];
}

// ─── Rule/Check display helpers ─────────────────────────────

const RULE_SHORT_NAMES: Record<string, string> = {
  "scheduling-rules": "Scheduling",
  "log-locations": "Logs",
  "cost-monitoring": "Cost",
  "troubleshooting-flow": "Troubleshoot",
  "heartbeat-rules": "Heartbeat",
  "automation-creation": "Automation",
};

function ruleShortName(id: string): string {
  return RULE_SHORT_NAMES[id] ?? id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ruleIconSvg(id: string) {
  const props = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    case "scheduling-rules":
      return <svg {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
    case "log-locations":
      return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
    case "cost-monitoring":
      return <svg {...props}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
    case "troubleshooting-flow":
      return <svg {...props}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>;
    case "heartbeat-rules":
      return <svg {...props}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
    case "automation-creation":
      return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
    default:
      return <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>;
  }
}

const CHECK_SHORT_NAMES: Record<string, string> = {
  shebang: "Shebang",
  "strict-mode": "Strict Mode",
  "global-pause": "Global Pause",
  "per-task-pause": "Task Pause",
  lockfile: "Lockfile",
  logging: "Logging",
  "session-id": "Session ID",
  "pre-check": "Pre-check",
  "heredoc-prompt": "Heredoc Prompt",
};

function checkShortName(id: string): string {
  return CHECK_SHORT_NAMES[id] ?? id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function checkIconSvg(id: string) {
  const props = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    case "shebang":
      return <svg {...props}><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>;
    case "strict-mode":
      return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    case "global-pause":
      return <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg>;
    case "per-task-pause":
      return <svg {...props}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>;
    case "lockfile":
      return <svg {...props}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
    case "logging":
      return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
    case "session-id":
      return <svg {...props}><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>;
    case "pre-check":
      return <svg {...props}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
    case "heredoc-prompt":
      return <svg {...props}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
    default:
      return <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>;
  }
}

// ─── Component ──────────────────────────────────────────────

type SelectedCard =
  | { type: "agent"; data: any }
  | { type: "task"; data: DiscoveredTask };

export function DeterminismAudit() {
  // Determinism state
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [deepScanning, setDeepScanning] = useState(false);
  const [dispatchFinding, setDispatchFinding] = useState<Finding | null>(null);
  const [copied, setCopied] = useState(false);

  // Audit state
  const [auditData, setAuditData] = useState<AuditData | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  // Card detail dialog
  const [selectedCard, setSelectedCard] = useState<SelectedCard | null>(null);
  const [dialogFixing, setDialogFixing] = useState(false);
  const [dialogResult, setDialogResult] = useState<"ok" | "error" | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<"health" | "scan">("health");

  // Shared
  const [error, setError] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);

  // ── Load both on mount ──────────────────────────────────────
  const runFullAudit = useCallback(async () => {
    setAuditLoading(true);
    setScanning(true);
    setError(null);
    try {
      const [auditRes, scanRes] = await Promise.all([
        api.audit(),
        api.determinismScan(),
      ]);
      if (auditRes.ok && auditRes.data) setAuditData(auditRes.data);
      if (scanRes.ok && scanRes.data) setScanResult(scanRes.data);
      if (!auditRes.ok) setError(auditRes.error ?? "Audit failed");
      if (!scanRes.ok) setError(scanRes.error ?? "Scan failed");

      // Auto-select determinism tab when system health is empty but findings exist
      if (auditRes.ok && auditRes.data) {
        const hasHealthItems = (auditRes.data.configSync?.results?.length ?? 0) > 0
          || (auditRes.data.discoveredTasks?.length ?? 0) > 0;
        if (!hasHealthItems && scanRes.ok && scanRes.data?.findings?.length > 0) {
          setActiveTab("scan");
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAuditLoading(false);
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    runFullAudit();
  }, [runFullAudit]);

  // ── Determinism actions ─────────────────────────────────────

  const runDeepScan = useCallback(async (findingIds?: string[]) => {
    setDeepScanning(true);
    setError(null);
    try {
      const res = await api.determinismDeepScan(findingIds);
      if (res.ok && res.data) {
        setScanResult((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, findings: [...prev.findings] };
          for (const reviewed of res.data.findings) {
            const idx = updated.findings.findIndex((f: Finding) => f.id === reviewed.id);
            if (idx >= 0) updated.findings[idx] = reviewed;
          }
          return updated;
        });
      } else {
        setError(res.error ?? "Deep scan failed");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeepScanning(false);
    }
  }, []);

  // ── Fix actions for high-priority findings ──────────────────

  const handleFixConfigSync = useCallback(async () => {
    setFixing("configSync");
    try {
      const res = await api.auditApply({ configSync: true, scriptDeployment: false, crontabFixes: false, scriptFixes: false });
      if (res.ok && res.data) {
        setAuditData(res.data);
        const scanRes = await api.determinismScan();
        if (scanRes.ok && scanRes.data) setScanResult(scanRes.data);
      } else {
        setError(res.error ?? "Config sync failed");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setFixing(null);
    }
  }, []);

  const handleFixOcCrons = useCallback(async () => {
    setFixing("ocCrons");
    try {
      const res = await api.schedulerRemoveAllOcCrons();
      if (res.ok) {
        const scanRes = await api.determinismScan();
        if (scanRes.ok && scanRes.data) setScanResult(scanRes.data);
      } else {
        setError(res.error ?? "Failed to remove OC crons");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setFixing(null);
    }
  }, []);

  const handleFixScripts = useCallback(async () => {
    setFixing("scriptFixes");
    try {
      const res = await api.auditApply({ configSync: false, scriptDeployment: true, crontabFixes: false, scriptFixes: true });
      if (res.ok && res.data) {
        setAuditData(res.data);
      } else {
        setError(res.error ?? "Script fixes failed");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setFixing(null);
    }
  }, []);

  // ── Dialog fix wrappers (keep dialog open, show progress) ──
  const handleDialogFix = useCallback(async (fixFn: () => Promise<void>) => {
    setDialogFixing(true);
    setDialogResult(null);
    try {
      await fixFn();
      setDialogResult("ok");
      // Re-run full audit so cards reflect the fix
      const [auditRes, scanRes] = await Promise.all([
        api.audit(),
        api.determinismScan(),
      ]);
      if (auditRes.ok && auditRes.data) setAuditData(auditRes.data);
      if (scanRes.ok && scanRes.data) setScanResult(scanRes.data);
      setTimeout(() => {
        setSelectedCard(null);
        setDialogFixing(false);
        setDialogResult(null);
      }, 800);
    } catch {
      setDialogResult("error");
      setDialogFixing(false);
    }
  }, []);

  // ── CSV export ──────────────────────────────────────────────

  const buildCsv = useCallback(() => {
    if (!scanResult) return "";
    const headers = ["ID", "Severity", "Category", "File", "Line", "Excerpt", "Context", "Suggested Action", "LLM Verdict", "LLM Reasoning"];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = scanResult.findings.map((f) => [
      f.id, f.severity, f.category, f.file ?? "", f.line != null ? String(f.line) : "",
      f.excerpt, f.context, f.suggestedAction, f.llmReview?.isNonDeterministic ?? "", f.llmReview?.reasoning ?? "",
    ]);
    return [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
  }, [scanResult]);

  const handleCopyCsv = useCallback(async () => {
    const csv = buildCsv();
    if (!csv) return;
    try {
      await navigator.clipboard.writeText(csv);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* no clipboard */ }
  }, [buildCsv]);

  const handleDownloadCsv = useCallback(() => {
    const csv = buildCsv();
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [buildCsv]);

  // ── Computed values ─────────────────────────────────────────

  const totalFindings = scanResult
    ? scanResult.summary.high + scanResult.summary.medium + scanResult.summary.low + scanResult.summary.info
    : 0;

  const nonInfoFindings = scanResult
    ? scanResult.findings.filter((f) => f.severity !== "info")
    : [];

  const auditCounts = (() => {
    if (!auditData) return null;
    let ok = 0, total = 0;
    // Config sync rules
    if (auditData.configSync?.results) {
      for (const r of auditData.configSync.results) {
        ok += (r.ok?.length ?? 0);
        total += (r.ok?.length ?? 0) + (r.missing?.length ?? 0) + (r.outdated?.length ?? 0);
      }
    }
    // Task checks + deploy status (only count deploy for scripts in deploy source)
    if (auditData.discoveredTasks) {
      for (const t of auditData.discoveredTasks) {
        ok += t.report.passCount;
        total += t.report.totalApplicable;
        if (t.inDeploy) {
          total += 1;
          if (t.deployStatus === "ok") ok += 1;
        }
      }
    }
    return { ok, total };
  })();

  const allPass = auditCounts ? auditCounts.ok === auditCounts.total : false;
  const isLoading = auditLoading || scanning;

  return (
    <div className={styles.container}>
      {/* ===== Page Title ===== */}
      <h1 className={styles.pageHeading}>Audit</h1>

      {/* ===== Stats Row ===== */}
      <div className={styles.statsRow}>
        <div className={styles.pills}>
          {auditCounts && (
            <div className={styles.pillGroup}>
              <span className={styles.pillLabel}>System Health</span>
              <span className={`${styles.pill} ${allPass ? styles.pillGreen : styles.pillRed}`}>
                {auditCounts.ok}/{auditCounts.total} Checks
              </span>
            </div>
          )}
          {scanResult && (
            <div className={styles.pillGroup}>
              <span className={styles.pillLabel}>Determinism</span>
              <span className={`${styles.pill} ${totalFindings === 0 ? styles.pillGreen : scanResult.summary.high > 0 ? styles.pillRed : styles.pillYellow}`}>
                {totalFindings === 0 ? "Clean" : `${totalFindings} Finding${totalFindings !== 1 ? "s" : ""}`}
              </span>
            </div>
          )}
          {scanResult && scanResult.summary.high > 0 && (
            <div className={styles.pillGroup}>
              <span className={styles.pillLabel}>High Severity</span>
              <span className={`${styles.pill} ${styles.pillRed}`}>
                {scanResult.summary.high}
              </span>
            </div>
          )}
        </div>
        <button
          className={styles.scanBtn}
          onClick={runFullAudit}
          disabled={isLoading}
        >
          {isLoading ? "Scanning..." : "Re-Scan"}
        </button>
      </div>

      {/* ===== Tabs ===== */}
      <div className={styles.tabBar}>
        <button
          className={`${styles.tab} ${activeTab === "health" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("health")}
        >
          System Health
          {auditCounts && (
            <span className={`${styles.tabBadge} ${allPass ? styles.tabBadgeGreen : styles.tabBadgeRed}`}>
              {auditCounts.ok}/{auditCounts.total}
            </span>
          )}
        </button>
        <button
          className={`${styles.tab} ${activeTab === "scan" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("scan")}
        >
          Determinism Scan
          {scanResult && totalFindings > 0 && (
            <span className={`${styles.tabBadge} ${scanResult.summary.high > 0 ? styles.tabBadgeRed : styles.tabBadgeYellow}`}>
              {totalFindings}
            </span>
          )}
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* ===== Loading state ===== */}
      {isLoading && !auditData && !scanResult && (
        <div className={styles.loading}>Running full audit...</div>
      )}

      {/* ===== Tab: System Health ===== */}
      {activeTab === "health" && auditData && (
        <div className={styles.systemHealth} style={isLoading ? { opacity: 0.4, pointerEvents: "none", transition: "opacity 0.2s" } : undefined}>
          {/* Agents row */}
          {auditData.configSync?.results?.length > 0 && (
            <div className={styles.carouselSection}>
              <div className={styles.rowHeader}>
                <h3 className={auditStyles.rowLabel}>Agents</h3>
                {!allPass && (
                  <button className={styles.fixBtn} onClick={handleFixConfigSync} disabled={fixing !== null}>
                    {fixing === "configSync" ? "Syncing..." : "Fix: Run Config Sync"}
                  </button>
                )}
              </div>
              <div className={styles.scrollRow}>
                {auditData.configSync.results.map((ws: any) => {
                  const okSet = new Set<string>(ws.ok ?? []);
                  const allIds: string[] = [...okSet, ...new Set<string>(ws.outdated ?? []), ...new Set<string>(ws.missing ?? [])];
                  const passCount = okSet.size;
                  const totalCount = allIds.length;
                  const agentType: string = ws.agentType ?? "";
                  const typeLabel = agentType.charAt(0).toUpperCase() + agentType.slice(1);

                  return (
                    <div key={ws.workspace} className={styles.scrollCard} style={{ cursor: "pointer" }} onClick={() => setSelectedCard({ type: "agent", data: ws })}>
                      <div className={auditStyles.agentCardHeader}>
                        <div>
                          <div className={auditStyles.agentCardName}>{ws.agent ?? ws.workspace}</div>
                          {typeLabel && <div className={auditStyles.agentCardType}>{typeLabel}</div>}
                        </div>
                        <span className={auditStyles.agentCardScore}>{passCount}/{totalCount}</span>
                      </div>
                      <div className={auditStyles.ruleList}>
                        {allIds.map((ruleId: string) => {
                          const passed = okSet.has(ruleId);
                          return (
                            <div key={ruleId} className={auditStyles.ruleItem}>
                              <div className={auditStyles.ruleIcon}>{ruleIconSvg(ruleId)}</div>
                              <span className={auditStyles.ruleLabel}>{ruleShortName(ruleId)}</span>
                              <span className={`${auditStyles.ruleStatus} ${passed ? auditStyles.ruleStatusOk : auditStyles.ruleStatusFail}`}>
                                {passed ? (
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                                ) : (
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Task rows by classification */}
          {auditData.discoveredTasks?.length > 0 && (() => {
            const tasksByType: Record<string, { label: string; tasks: typeof auditData.discoveredTasks }> = {
              "agent-wrapper": { label: "Agent Wrappers", tasks: [] },
              "infrastructure": { label: "Infrastructure", tasks: [] },
              "utility": { label: "Utility", tasks: [] },
            };
            for (const t of auditData.discoveredTasks) {
              tasksByType[t.report.classification]?.tasks.push(t);
            }

            return Object.entries(tasksByType).map(([cls, { label, tasks }]) => {
              if (tasks.length === 0) return null;
              return (
                <div key={cls} className={styles.carouselSection}>
                  <div className={styles.rowHeader}>
                    <h3 className={auditStyles.rowLabel}>{label}</h3>
                    {cls === "agent-wrapper" && (auditData.taskWarnings ?? 0) > 0 && (
                      <button className={styles.fixBtn} onClick={handleFixScripts} disabled={fixing !== null}>
                        {fixing === "scriptFixes" ? "Fixing..." : `Fix: Auto-Patch ${auditData.taskWarnings} Warning${auditData.taskWarnings !== 1 ? "s" : ""}`}
                      </button>
                    )}
                  </div>
                  <div className={styles.scrollRow}>
                    {tasks.map((task) => {
                      const r = task.report;
                      const applicable = r.checks.filter(
                        (c) => !c.agentOnly || r.classification === "agent-wrapper"
                      );

                      return (
                        <div key={r.scriptName} className={styles.scrollCard} style={{ cursor: "pointer" }} onClick={() => setSelectedCard({ type: "task", data: task })}>
                          <div className={auditStyles.agentCardHeader}>
                            <div>
                              <div className={auditStyles.agentCardName} title={r.scriptName}>{r.scriptName}</div>
                              {r.schedule && <div className={auditStyles.agentCardType}>{r.schedule}</div>}
                            </div>
                            <span className={auditStyles.agentCardScore}>{r.passCount + (task.inDeploy && task.deployStatus === "ok" ? 1 : 0)}/{r.totalApplicable + (task.inDeploy ? 1 : 0)}</span>
                          </div>
                          <div className={auditStyles.ruleList}>
                            {applicable.filter((c) => !c.exempt).map((c) => (
                              <div key={c.id} className={auditStyles.ruleItem}>
                                <div className={auditStyles.ruleIcon}>
                                  {checkIconSvg(c.id)}
                                </div>
                                <span className={auditStyles.ruleLabel}>
                                  {checkShortName(c.id)}
                                </span>
                                <span className={`${auditStyles.ruleStatus} ${c.passed ? auditStyles.ruleStatusOk : auditStyles.ruleStatusFail}`}>
                                  {c.passed ? (
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                                  ) : (
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  )}
                                </span>
                              </div>
                            ))}
                            {/* Deploy status row — only for scripts in deploy source */}
                            {task.inDeploy && (
                              <div className={auditStyles.ruleItem}>
                                <div className={auditStyles.ruleIcon}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                </div>
                                <span className={auditStyles.ruleLabel}>
                                  {task.deployStatus === "ok" ? "Deployed" : task.deployStatus === "update" ? "Needs Deploy" : "New Script"}
                                </span>
                                <span className={`${auditStyles.ruleStatus} ${task.deployStatus === "ok" ? auditStyles.ruleStatusOk : auditStyles.ruleStatusFail}`}>
                                  {task.deployStatus === "ok" ? (
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                                  ) : (
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* ===== Tab: Determinism Scan ===== */}
      {activeTab === "scan" && (
        <div style={isLoading ? { opacity: 0.4, pointerEvents: "none", transition: "opacity 0.2s" } : undefined}>
          {/* Scan-specific actions */}
          {scanResult && !scanning && (
            <div className={styles.scanActions}>
              <button className={styles.actionBtn} onClick={handleCopyCsv}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                {copied ? "Copied!" : "Copy Logs"}
              </button>
              <button className={styles.actionBtn} onClick={handleDownloadCsv}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download Logs
              </button>
              {nonInfoFindings.length > 0 && (
                <button
                  className={`${styles.actionBtn} ${styles.deepScanBtn}`}
                  onClick={() => runDeepScan()}
                  disabled={deepScanning}
                >
                  {deepScanning ? "Reviewing..." : "Deep Scan (OC)"}
                </button>
              )}
            </div>
          )}

          {scanResult && !scanning && (
            <>
              <div className={styles.meta}>
                <span>Workspaces: {scanResult.workspacesScanned.join(", ") || "none"}</span>
                <span>Files scanned: {scanResult.filesScanned}</span>
                <span>Findings: {totalFindings}</span>
                <span>Scanned: {new Date(scanResult.scanTimestamp).toLocaleTimeString()}</span>
              </div>

              {totalFindings === 0 ? (
                <div className={styles.clean}>
                  All clear — no determinism issues detected.
                </div>
              ) : (
                <FindingsSection
                  findings={scanResult.findings}
                  onDispatch={setDispatchFinding}
                  onDismiss={(id) => {
                    setScanResult((prev) => {
                      if (!prev) return prev;
                      const remaining = prev.findings.filter((f) => f.id !== id);
                      const summary = { high: 0, medium: 0, low: 0, info: 0 };
                      for (const f of remaining) summary[f.severity]++;
                      return { ...prev, findings: remaining, summary };
                    });
                  }}
                  onDeepScan={(id) => runDeepScan([id])}
                  deepScanning={deepScanning}
                  onFixConfigSync={handleFixConfigSync}
                  onFixOcCrons={handleFixOcCrons}
                  fixing={fixing}
                />
              )}
            </>
          )}

          {scanning && (
            <div className={styles.loading}>Scanning for determinism issues...</div>
          )}
        </div>
      )}

      {dispatchFinding && (
        <DispatchFixDialog
          finding={dispatchFinding}
          onClose={() => setDispatchFinding(null)}
        />
      )}

      {/* ===== Card Detail Dialog ===== */}
      {selectedCard && (
        <div className={styles.dialogOverlay} onClick={(e) => { if (e.target === e.currentTarget && !dialogFixing) { setSelectedCard(null); setDialogResult(null); } }}>
          <div className={styles.dialog}>
            {/* Fixing / result states — shared across agent & task */}
            {(dialogFixing || dialogResult) ? (
              <div className={styles.dialogBody}>
                <div className={styles.dialogTitle}>
                  {selectedCard.type === "agent"
                    ? (selectedCard.data.agent ?? selectedCard.data.workspace)
                    : selectedCard.data.report.scriptName}
                </div>
                {dialogFixing && !dialogResult && (
                  <>
                    <div className={styles.dialogSpinner} />
                    <div className={styles.dialogResultLabel}>Fixing...</div>
                  </>
                )}
                {dialogResult === "ok" && (
                  <>
                    <div className={styles.dialogResultIcon}>✓</div>
                    <div className={styles.dialogPassLabel}>Fixed</div>
                  </>
                )}
                {dialogResult === "error" && (
                  <>
                    <div className={styles.dialogResultIcon}>✗</div>
                    <div className={styles.dialogFailLabel}>Fix failed</div>
                    <div className={styles.dialogActions}>
                      <button className={styles.dialogBtn} onClick={() => { setSelectedCard(null); setDialogResult(null); }}>Dismiss</button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                {selectedCard.type === "agent" && (() => {
                  const ws = selectedCard.data;
                  const okSet = new Set<string>(ws.ok ?? []);
                  const outdatedSet = new Set<string>(ws.outdated ?? []);
                  const missingSet = new Set<string>(ws.missing ?? []);
                  const allIds: string[] = [...okSet, ...outdatedSet, ...missingSet];
                  const passCount = okSet.size;
                  const totalCount = allIds.length;
                  const allPass = passCount === totalCount;
                  const failing = allIds.filter((id) => !okSet.has(id));

                  return (
                    <>
                      <div className={styles.dialogBody}>
                        <div className={styles.dialogTitle}>{ws.agent ?? ws.workspace}</div>
                        {allPass ? (
                          <>
                            <div className={styles.dialogPassIcon}>👍</div>
                            <div className={styles.dialogPassLabel}>{passCount}/{totalCount} Passed</div>
                          </>
                        ) : (
                          <>
                            <div className={styles.dialogFailLabel}>{failing.length}/{totalCount} Failed</div>
                            <div className={styles.dialogIssues}>
                              {failing.map((ruleId: string) => (
                                <div key={ruleId} className={styles.dialogIssueRow}>
                                  <span className={styles.dialogIssueDot}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  </span>
                                  <div style={{ flex: 1 }}>
                                    <div className={styles.dialogIssueName}>{ruleShortName(ruleId)}</div>
                                    <div className={styles.dialogIssueDetail}>
                                      {outdatedSet.has(ruleId) ? "Outdated — needs re-sync" : "Missing — not configured"}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                      <div className={styles.dialogActions}>
                        {allPass ? (
                          <button className={styles.dialogBtn} onClick={() => setSelectedCard(null)}>OK</button>
                        ) : (
                          <>
                            <button className={`${styles.dialogBtn} ${styles.dialogBtnMuted}`} onClick={() => setSelectedCard(null)}>Fix Later</button>
                            <div className={styles.dialogBtnDivider} />
                            <button className={`${styles.dialogBtn} ${styles.dialogBtnPrimary}`} onClick={() => handleDialogFix(handleFixConfigSync)}>Fix Now</button>
                          </>
                        )}
                      </div>
                    </>
                  );
                })()}

                {selectedCard.type === "task" && (() => {
                  const task = selectedCard.data;
                  const r = task.report;
                  const applicable = r.checks.filter(
                    (c) => (!c.agentOnly || r.classification === "agent-wrapper") && !c.exempt
                  );
                  const scoreNum = r.passCount + (task.inDeploy && task.deployStatus === "ok" ? 1 : 0);
                  const scoreDen = r.totalApplicable + (task.inDeploy ? 1 : 0);
                  const allPass = scoreNum === scoreDen;
                  const failedChecks = applicable.filter((c) => !c.passed);
                  const deployFailing = task.inDeploy && task.deployStatus !== "ok";
                  const failCount = failedChecks.length + (deployFailing ? 1 : 0);

                  return (
                    <>
                      <div className={styles.dialogBody}>
                        <div className={styles.dialogTitle}>{r.scriptName}</div>
                        {allPass ? (
                          <>
                            <div className={styles.dialogPassIcon}>👍</div>
                            <div className={styles.dialogPassLabel}>{scoreNum}/{scoreDen} Passed</div>
                          </>
                        ) : (
                          <>
                            <div className={styles.dialogFailLabel}>{failCount}/{scoreDen} Failed</div>
                            <div className={styles.dialogIssues}>
                              {failedChecks.map((c) => (
                                <div key={c.id} className={styles.dialogIssueRow}>
                                  <span className={styles.dialogIssueDot}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  </span>
                                  <div style={{ flex: 1 }}>
                                    <div className={styles.dialogIssueName}>{checkShortName(c.id)}</div>
                                    {c.detail && <div className={styles.dialogIssueDetail}>{c.detail}</div>}
                                  </div>
                                </div>
                              ))}
                              {deployFailing && (
                                <div className={styles.dialogIssueRow}>
                                  <span className={styles.dialogIssueDot}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  </span>
                                  <div style={{ flex: 1 }}>
                                    <div className={styles.dialogIssueName}>Deploy Status</div>
                                    <div className={styles.dialogIssueDetail}>
                                      {task.deployStatus === "update" ? "Stale — needs re-deploy" : task.deployStatus === "new" ? "New script — not yet deployed" : "Not in deploy/scripts/core/"}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      <div className={styles.dialogActions}>
                        {allPass ? (
                          <button className={styles.dialogBtn} onClick={() => setSelectedCard(null)}>OK</button>
                        ) : (
                          <>
                            <button className={`${styles.dialogBtn} ${styles.dialogBtnMuted}`} onClick={() => setSelectedCard(null)}>Fix Later</button>
                            <div className={styles.dialogBtnDivider} />
                            <button className={`${styles.dialogBtn} ${styles.dialogBtnPrimary}`} onClick={() => handleDialogFix(handleFixScripts)}>Fix Now</button>
                          </>
                        )}
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
