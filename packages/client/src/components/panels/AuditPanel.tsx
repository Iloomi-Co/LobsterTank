import { useState, useCallback, useEffect } from "react";
import { Badge } from "../shared/Badge.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.js";
import { api } from "../../api/client.js";
import styles from "./AuditPanel.module.css";

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

interface CrontabHealth {
  raw: string;
  hasPath: boolean;
  pathLine: string | null;
  orphanedEntries: { schedule: string; command: string }[];
  fixes: string[];
}

interface AuditData {
  changePlanText: string;
  totalChanges: number;
  configSync: any;
  discoveredTasks: DiscoveredTask[];
  crontab: CrontabHealth;
  deployOnlyScripts: string[];
  issues: any[];
  gitStatus: any;
  applied?: string[];
}

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

export function AuditPanel() {
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyCategories, setApplyCategories] = useState({
    configSync: true,
    scriptDeployment: true,
    crontabFixes: true,
  });
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);
  const [lastRunTime, setLastRunTime] = useState<Date | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  const runAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.audit();
      if (result.ok && result.data) {
        setData(result.data);
        setLastRunTime(new Date());
      } else {
        setError(result.error ?? "Audit failed");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load on mount
  useEffect(() => {
    runAudit();
  }, [runAudit]);

  const handleCopy = useCallback(() => {
    if (!data?.changePlanText) return;
    navigator.clipboard.writeText(data.changePlanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  const handleApply = useCallback(async () => {
    setConfirmOpen(false);
    setApplying(true);
    try {
      const result = await api.auditApply(applyCategories);
      if (result.ok && result.data) {
        setData(result.data);
        setLastRunTime(new Date());
      } else {
        setError(result.error ?? "Apply failed");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setApplying(false);
    }
  }, [applyCategories]);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleCategory = (key: string) => {
    setApplyCategories((prev) => ({ ...prev, [key]: !prev[key as keyof typeof prev] }));
  };

  const selectedCount = Object.values(applyCategories).filter(Boolean).length;

  const classificationBadge = (cls: string) => {
    switch (cls) {
      case "agent-wrapper": return <Badge label="agent" variant="blue" />;
      case "infrastructure": return <Badge label="infra" variant="yellow" />;
      default: return <Badge label="utility" variant="default" />;
    }
  };

  const scriptsNeedingDeploy = data?.discoveredTasks?.filter((t) => t.deployStatus === "update" || t.deployStatus === "new").length ?? 0;

  // Compute config sync rule counts
  const configRuleCounts = (() => {
    if (!data?.configSync?.results) return null;
    let ok = 0;
    let total = 0;
    for (const r of data.configSync.results) {
      ok += (r.ok?.length ?? 0);
      total += (r.ok?.length ?? 0) + (r.missing?.length ?? 0) + (r.outdated?.length ?? 0);
    }
    return { ok, total };
  })();

  const gitOk = data?.gitStatus?.clean !== false;

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const allRulesPass = configRuleCounts ? configRuleCounts.ok === configRuleCounts.total : false;

  return (
    <>
      {/* ===== Section wrapper ===== */}
      <div className={styles.section}>
        {/* Section header — outside the card */}
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeaderLeft}>
            <h2 className={styles.sectionHeading}>Audit & Deploy</h2>
            {configRuleCounts && (
              <span className={`${styles.rulesBadge} ${allRulesPass ? styles.rulesBadgeGreen : styles.rulesBadgeRed}`}>
                {configRuleCounts.ok}/{configRuleCounts.total} Rules
                <span className={styles.rulesBadgeIcon}>{allRulesPass ? "\u2713" : "\u2717"}</span>
              </span>
            )}
          </div>
          <div className={styles.buttonGroup}>
            <button
              className={styles.headerBtn}
              onClick={runAudit}
              disabled={loading || applying}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              {loading ? "Running..." : "Re-Scan"}
            </button>
            <button
              className={`${styles.headerBtn} ${showLogs ? styles.headerBtnActive : ""}`}
              onClick={() => setShowLogs((v) => !v)}
              disabled={!data}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              {showLogs ? "Hide Logs" : "View Logs"}
            </button>
          </div>
        </div>

        {data?.applied && (
          <div className={styles.rowToast}>Applied: {data.applied.join(", ")}</div>
        )}

        {error ? (
          <div className={styles.rowError}>{error}</div>
        ) : loading && !data ? (
          <div className={styles.rowLoading}>
            <span className={styles.rowSpinner} />
            Running audit...
          </div>
        ) : data ? (
          <>
            {/* Agents row */}
            {data.configSync?.results?.length > 0 && (
              <>
                <h3 className={styles.rowLabel}>Agents</h3>
                <div className={styles.auditRow}>
                  <div className={styles.cardArea}>
                    {data.configSync.results.map((ws: any) => {
                      const okSet = new Set<string>(ws.ok ?? []);
                      const outdatedSet = new Set<string>(ws.outdated ?? []);
                      const missingSet = new Set<string>(ws.missing ?? []);
                      const allIds: string[] = [...okSet, ...outdatedSet, ...missingSet];
                      const passCount = okSet.size;
                      const totalCount = allIds.length;
                      const agentType: string = ws.agentType ?? "";
                      const typeLabel = agentType.charAt(0).toUpperCase() + agentType.slice(1);

                      return (
                        <div key={ws.workspace} className={styles.agentCard}>
                          <div className={styles.agentCardHeader}>
                            <div>
                              <div className={styles.agentCardName}>{ws.agent ?? ws.workspace}</div>
                              {typeLabel && <div className={styles.agentCardType}>{typeLabel}</div>}
                            </div>
                            <span className={styles.agentCardScore}>{passCount}/{totalCount}</span>
                          </div>
                          <div className={styles.ruleList}>
                            {allIds.map((ruleId: string) => {
                              const passed = okSet.has(ruleId);
                              return (
                                <div key={ruleId} className={styles.ruleItem}>
                                  <div className={styles.ruleIcon}>
                                    {ruleIconSvg(ruleId)}
                                  </div>
                                  <span className={styles.ruleLabel}>
                                    {ruleShortName(ruleId)}
                                  </span>
                                  <span className={`${styles.ruleStatus} ${passed ? styles.ruleStatusOk : styles.ruleStatusFail}`}>
                                    {passed ? (
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                                    ) : (
                                      <span />
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
              </>
            )}

            {/* Tasks row */}
            {data.discoveredTasks?.length > 0 && (
              <>
                <h3 className={styles.rowLabel}>Tasks</h3>
                <div className={styles.auditRow}>
                  <div className={styles.cardArea}>
                    {data.discoveredTasks.map((task) => {
                      const r = task.report;
                      const applicable = r.checks.filter(
                        (c) => !c.agentOnly || r.classification === "agent-wrapper"
                      );
                      const classLabel =
                        r.classification === "agent-wrapper" ? "Agent Wrapper"
                          : r.classification === "infrastructure" ? "Infrastructure"
                            : "Utility";

                      return (
                        <div key={r.scriptName} className={styles.agentCard}>
                          <div className={styles.agentCardHeader}>
                            <div>
                              <div className={styles.agentCardName} title={r.scriptName}>{r.scriptName}</div>
                              <div className={styles.agentCardType}>{classLabel}{r.schedule ? ` \u00B7 ${r.schedule}` : ""}</div>
                            </div>
                            <span className={styles.agentCardScore}>{r.passCount}/{r.totalApplicable}</span>
                          </div>
                          <div className={styles.ruleList}>
                            {applicable.map((c) => (
                              <div key={c.id} className={`${styles.ruleItem} ${c.exempt ? styles.ruleItemExempt : ""}`}>
                                <div className={`${styles.ruleIcon} ${c.exempt ? styles.ruleIconExempt : ""}`}>
                                  {checkIconSvg(c.id)}
                                </div>
                                <span className={`${styles.ruleLabel} ${c.exempt ? styles.ruleLabelExempt : ""}`}>
                                  {checkShortName(c.id)}
                                </span>
                                <span className={`${styles.ruleStatus} ${
                                  c.exempt
                                    ? styles.ruleStatusExempt
                                    : c.passed
                                      ? styles.ruleStatusOk
                                      : styles.ruleStatusFail
                                }`}>
                                  {c.exempt ? (
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="3" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                  ) : c.passed ? (
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                                  ) : (
                                    <span />
                                  )}
                                </span>
                              </div>
                            ))}
                            {task.deployStatus !== "ok" && (
                              <div className={styles.ruleItem}>
                                <div className={styles.ruleIcon}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                </div>
                                <span className={styles.ruleLabel}>
                                  {task.deployStatus === "update" ? "Needs Deploy" : task.deployStatus === "new" ? "New Script" : "Not Deployed"}
                                </span>
                                <span className={`${styles.ruleStatus} ${styles.ruleStatusFail}`}>
                                  <span />
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        ) : null}
      </div>

      {/* ===== Full-screen logs modal ===== */}
      {showLogs && (
        <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setShowLogs(false); }}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderLeft}>
                <span className={styles.modalTitle}>Audit & Deploy</span>
                {(loading || applying) && <span className={styles.rowSpinner} />}
              </div>
              <div className={styles.modalHeaderActions}>
                <button className={styles.rerunBtn} onClick={runAudit} disabled={loading}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  Re-run Audit
                </button>
                <button className={styles.copyBtn} onClick={handleCopy}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  {copied ? "Copied!" : "Copy to Clipboard"}
                </button>
                {data && data.totalChanges > 0 && (
                  <button
                    className={styles.applyBtn}
                    onClick={() => setConfirmOpen(true)}
                    disabled={applying || selectedCount === 0}
                  >
                    {applying ? "Applying..." : `Apply (${data.totalChanges})`}
                  </button>
                )}
                <button className={styles.modalCloseBtn} onClick={() => setShowLogs(false)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <div className={styles.modalBody}>
              {!data ? (
                <div className={styles.rowLoading}>
                  <span className={styles.rowSpinner} />
                  Loading audit data...
                </div>
              ) : (
                <div className={styles.content}>
                  {/* Applied results toast */}
                  {data.applied && (
                    <div className={styles.toast}>
                      Applied: {data.applied.join(", ")}
                    </div>
                  )}

                  {error && <div className={styles.rowError}>{error}</div>}

                  {/* Audit Report */}
                  <div className={styles.planSection}>
                    <div className={styles.planHeader}>
                      <h4 className={styles.planTitle}>Audit Report</h4>
                    </div>
                    <pre className={styles.planText}>{data.changePlanText}</pre>
                  </div>

                  {/* Category toggles */}
                  {data.totalChanges > 0 && (
                    <div className={styles.categories}>
                      <h4 className={styles.sectionTitle}>Apply Categories</h4>
                      <div className={styles.checkboxGroup}>
                        <label className={styles.checkbox}>
                          <input
                            type="checkbox"
                            checked={applyCategories.configSync}
                            onChange={() => toggleCategory("configSync")}
                          />
                          <span>Config Sync</span>
                          <Badge
                            label={`${data.configSync?.summary?.missing ?? 0 + (data.configSync?.summary?.outdated ?? 0)} changes`}
                            variant={data.configSync?.aligned ? "green" : "yellow"}
                          />
                        </label>
                        <label className={styles.checkbox}>
                          <input
                            type="checkbox"
                            checked={applyCategories.scriptDeployment}
                            onChange={() => toggleCategory("scriptDeployment")}
                          />
                          <span>Script Deployment</span>
                          <Badge
                            label={`${scriptsNeedingDeploy} to deploy`}
                            variant="blue"
                          />
                        </label>
                        <label className={styles.checkbox}>
                          <input
                            type="checkbox"
                            checked={applyCategories.crontabFixes}
                            onChange={() => toggleCategory("crontabFixes")}
                          />
                          <span>Crontab Fixes</span>
                          <Badge
                            label={`${data.crontab?.fixes?.length ?? 0} fixes`}
                            variant="blue"
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Expandable detail: Config Sync */}
                  <div className={styles.detailSection}>
                    <button className={styles.detailToggle} onClick={() => toggleSection("configSync")}>
                      {expandedSections.configSync ? "\u25BC" : "\u25B6"} Config Sync Details
                      <Badge
                        label={data.configSync?.aligned ? "aligned" : "drift"}
                        variant={data.configSync?.aligned ? "green" : "yellow"}
                      />
                    </button>
                    {expandedSections.configSync && data.configSync?.results && (
                      <div className={styles.detailContent}>
                        {data.configSync.results.map((r: any) => (
                          <div key={r.workspace} className={styles.wsRow}>
                            <span className={styles.wsName}>{r.workspace}</span>
                            <div className={styles.ruleChecks}>
                              {(r.ok ?? []).map((id: string) => (
                                <Badge key={id} label={id} variant="green" />
                              ))}
                              {(r.missing ?? []).map((id: string) => (
                                <Badge key={id} label={id} variant="red" />
                              ))}
                              {(r.outdated ?? []).map((id: string) => (
                                <Badge key={id} label={id} variant="yellow" />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Expandable detail: Discovered Tasks */}
                  <div className={styles.detailSection}>
                    <button className={styles.detailToggle} onClick={() => toggleSection("tasks")}>
                      {expandedSections.tasks ? "\u25BC" : "\u25B6"} Discovered Tasks ({data.discoveredTasks?.length ?? 0})
                    </button>
                    {expandedSections.tasks && data.discoveredTasks && (
                      <div className={styles.detailContent}>
                        {data.discoveredTasks.map((task) => {
                          const r = task.report;
                          const allPassed = r.passCount === r.totalApplicable;
                          const applicable = r.checks.filter((c) => !c.agentOnly || r.classification === "agent-wrapper");
                          return (
                            <div key={r.scriptName} className={styles.wsRow}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                                <span>{allPassed ? "\u2705" : "\u26A0\uFE0F"}</span>
                                <span className={styles.scriptName}>{r.scriptName}</span>
                                {classificationBadge(r.classification)}
                                {r.schedule && <Badge label={r.schedule} variant="default" />}
                                {r.agentName && <Badge label={r.agentName} variant="blue" />}
                              </div>
                              <div className={styles.ruleChecks}>
                                {applicable.map((c) => (
                                  <Badge key={c.id} label={c.label} variant={c.exempt ? "default" : c.passed ? "green" : "red"} />
                                ))}
                                {task.deployStatus === "update" && <Badge label="needs deploy" variant="yellow" />}
                                {task.deployStatus === "not-in-deploy" && <Badge label="local only" variant="default" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Deploy Available */}
                  {data.deployOnlyScripts?.length > 0 && (
                    <div className={styles.detailSection}>
                      <button className={styles.detailToggle} onClick={() => toggleSection("deployAvail")}>
                        {expandedSections.deployAvail ? "\u25BC" : "\u25B6"} Deploy Available ({data.deployOnlyScripts.length})
                      </button>
                      {expandedSections.deployAvail && (
                        <div className={styles.detailContent}>
                          {data.deployOnlyScripts.map((s) => (
                            <div key={s} className={styles.cronEntry}>
                              <span className={styles.cronCommand}>{s} (in deploy/, not in ~/bin/)</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Orphaned Crontab Entries */}
                  {data.crontab?.orphanedEntries?.length > 0 && (
                    <div className={styles.detailSection}>
                      <button className={styles.detailToggle} onClick={() => toggleSection("orphaned")}>
                        {expandedSections.orphaned ? "\u25BC" : "\u25B6"} Orphaned Crontab Entries ({data.crontab.orphanedEntries.length})
                      </button>
                      {expandedSections.orphaned && (
                        <div className={styles.detailContent}>
                          {!data.crontab?.hasPath && (
                            <div className={styles.warning}>PATH line missing from crontab</div>
                          )}
                          {data.crontab.orphanedEntries.map((e, i) => (
                            <div key={i} className={`${styles.cronEntry} ${styles.cronNew}`}>
                              <span className={styles.cronSchedule}>{e.schedule}</span>
                              <span className={styles.cronCommand}>{e.command}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Crontab Fixes */}
                  {data.crontab?.fixes?.length > 0 && (
                    <div className={styles.detailSection}>
                      <button className={styles.detailToggle} onClick={() => toggleSection("crontabFixes")}>
                        {expandedSections.crontabFixes ? "\u25BC" : "\u25B6"} Crontab Fixes ({data.crontab.fixes.length})
                      </button>
                      {expandedSections.crontabFixes && (
                        <div className={styles.detailContent}>
                          {data.crontab.fixes.map((fix, i) => (
                            <div key={i} className={styles.issueRow}>
                              <Badge label="FIX" variant="yellow" />
                              <span>{fix}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Expandable detail: Issues */}
                  {data.issues?.length > 0 && (
                    <div className={styles.detailSection}>
                      <button className={styles.detailToggle} onClick={() => toggleSection("issues")}>
                        {expandedSections.issues ? "\u25BC" : "\u25B6"} Issues ({data.issues.length})
                      </button>
                      {expandedSections.issues && (
                        <div className={styles.detailContent}>
                          {data.issues.map((issue: any, i: number) => (
                            <div key={i} className={styles.issueRow}>
                              <Badge
                                label={issue.severity}
                                variant={issue.severity === "warn" ? "yellow" : "blue"}
                              />
                              <span>{issue.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Apply Changes"
        message={`This will make ${data?.totalChanges ?? 0} change(s) across ${selectedCount} categories. A git snapshot will be created before and after. Proceed?`}
        onConfirm={handleApply}
        onCancel={() => setConfirmOpen(false)}
        confirmLabel="Apply"
        danger={false}
      />
    </>
  );
}
