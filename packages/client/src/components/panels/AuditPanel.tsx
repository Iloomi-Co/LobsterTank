import { useState, useCallback } from "react";
import { Panel } from "../shared/Panel.js";
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

  const runAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.audit();
      if (result.ok && result.data) {
        setData(result.data);
      } else {
        setError(result.error ?? "Audit failed");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

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

  return (
    <Panel title="Audit & Deploy" icon="[>]" loading={loading || applying} error={error} span={2}>
      {!data ? (
        <div className={styles.entryPoint}>
          <p className={styles.description}>
            Scan your OpenClaw installation against the canonical config.
            Review the change plan before applying any changes.
          </p>
          <button className={styles.auditBtn} onClick={runAudit} disabled={loading}>
            {loading ? "Running Audit..." : "Run Full Audit"}
          </button>
          <span className={styles.target}>Target: ~/.openclaw</span>
        </div>
      ) : (
        <div className={styles.content}>
          {/* Applied results toast */}
          {data.applied && (
            <div className={styles.toast}>
              Applied: {data.applied.join(", ")}
            </div>
          )}

          {/* Change Plan */}
          <div className={styles.planSection}>
            <div className={styles.planHeader}>
              <h4 className={styles.planTitle}>Audit Report</h4>
              <div className={styles.planActions}>
                <button className={styles.copyBtn} onClick={handleCopy}>
                  {copied ? "Copied!" : "Copy to Clipboard"}
                </button>
              </div>
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

          {/* Action buttons */}
          <div className={styles.actionBar}>
            {data.totalChanges > 0 && (
              <button
                className={styles.applyBtn}
                onClick={() => setConfirmOpen(true)}
                disabled={applying || selectedCount === 0}
              >
                {applying ? "Applying..." : `Confirm & Apply (${data?.totalChanges ?? 0})`}
              </button>
            )}
            <button className={styles.rerunBtn} onClick={runAudit} disabled={loading}>
              Re-run Audit
            </button>
          </div>

          {/* Expandable detail: Config Sync */}
          <div className={styles.detailSection}>
            <button className={styles.detailToggle} onClick={() => toggleSection("configSync")}>
              {expandedSections.configSync ? "▼" : "▶"} Config Sync Details
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
              {expandedSections.tasks ? "▼" : "▶"} Discovered Tasks ({data.discoveredTasks?.length ?? 0})
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
                        <span>{allPassed ? "✅" : "⚠️"}</span>
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
                {expandedSections.deployAvail ? "▼" : "▶"} Deploy Available ({data.deployOnlyScripts.length})
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
                {expandedSections.orphaned ? "▼" : "▶"} Orphaned Crontab Entries ({data.crontab.orphanedEntries.length})
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
                {expandedSections.crontabFixes ? "▼" : "▶"} Crontab Fixes ({data.crontab.fixes.length})
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
                {expandedSections.issues ? "▼" : "▶"} Issues ({data.issues.length})
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

      <ConfirmDialog
        open={confirmOpen}
        title="Apply Changes"
        message={`This will make ${data?.totalChanges ?? 0} change(s) across ${selectedCount} categories. A git snapshot will be created before and after. Proceed?`}
        onConfirm={handleApply}
        onCancel={() => setConfirmOpen(false)}
        confirmLabel="Apply"
        danger={false}
      />
    </Panel>
  );
}
