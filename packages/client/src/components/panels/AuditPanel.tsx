import { useState, useCallback } from "react";
import { Panel } from "../shared/Panel.js";
import { Badge } from "../shared/Badge.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.js";
import { api } from "../../api/client.js";
import styles from "./AuditPanel.module.css";

interface AuditData {
  changePlanText: string;
  totalChanges: number;
  configSync: any;
  scriptDeployment: any;
  crontab: any;
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
    crontab: true,
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
              <h4 className={styles.planTitle}>Change Plan</h4>
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
                    label={`${data.scriptDeployment?.scripts?.filter((s: any) => s.status !== "ok").length ?? 0} to deploy`}
                    variant="blue"
                  />
                </label>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={applyCategories.crontab}
                    onChange={() => toggleCategory("crontab")}
                  />
                  <span>Crontab</span>
                  <Badge
                    label={`${data.crontab?.toAdd?.length ?? 0} to add`}
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
                {applying ? "Applying..." : `Confirm & Apply (${selectedCount})`}
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

          {/* Expandable detail: Scripts */}
          <div className={styles.detailSection}>
            <button className={styles.detailToggle} onClick={() => toggleSection("scripts")}>
              {expandedSections.scripts ? "▼" : "▶"} Script Deployment Details
            </button>
            {expandedSections.scripts && data.scriptDeployment?.scripts && (
              <div className={styles.detailContent}>
                <table className={styles.statusTable}>
                  <thead>
                    <tr>
                      <th>Script</th>
                      <th>Deployed</th>
                      <th>Current</th>
                      <th>Cron</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.scriptDeployment.scripts.map((s: any) => (
                      <tr key={s.name}>
                        <td className={styles.scriptName}>{s.name}</td>
                        <td>{s.deployed ? "✅" : "❌"}</td>
                        <td>{s.deployed ? (s.upToDate ? "✅" : "⚠️") : "—"}</td>
                        <td>{s.cronEntry ? (s.cronInstalled ? "✅" : "❌") : "n/a"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Expandable detail: Crontab */}
          <div className={styles.detailSection}>
            <button className={styles.detailToggle} onClick={() => toggleSection("crontab")}>
              {expandedSections.crontab ? "▼" : "▶"} Crontab Details
            </button>
            {expandedSections.crontab && (
              <div className={styles.detailContent}>
                {!data.crontab?.hasPath && (
                  <div className={styles.warning}>PATH line missing from crontab</div>
                )}
                {data.crontab?.entries?.map((e: any, i: number) => (
                  <div key={i} className={styles.cronEntry}>
                    <span className={styles.cronSchedule}>{e.schedule}</span>
                    <span className={styles.cronCommand}>{e.command}</span>
                  </div>
                ))}
                {data.crontab?.toAdd?.map((entry: string, i: number) => (
                  <div key={`add-${i}`} className={`${styles.cronEntry} ${styles.cronNew}`}>
                    <span className={styles.cronLabel}>+ ADD</span>
                    <span className={styles.cronCommand}>{entry}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

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
