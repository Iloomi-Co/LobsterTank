import { useState, useCallback } from "react";
import { usePolling } from "../../hooks/usePolling.js";
import { api } from "../../api/client.js";
import { CrontabSection } from "./CrontabSection.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.js";
import { LogModal } from "./LogModal.js";
import { ScriptModal } from "./ScriptModal.js";
import styles from "./TaskScheduler.module.css";

interface SchedulerState {
  crontab: {
    entries: {
      lineIndex: number;
      schedule: string;
      command: string;
      script: string;
      description: string;
      logFile: string | null;
      lastRun: string | null;
      status: "active" | "paused" | "missing";
      category: "agent" | "system";
      scriptPath: string;
      runHistory: { timestamp: string; status: "success" | "failure" | "skipped" }[];
      costEstimate: {
        lastRunCost: number | null;
        weeklyTotal: number | null;
        runsThisWeek: number;
      } | null;
      hasPrompt: boolean;
      registrationMeta?: {
        agent: string;
        description: string;
        pauseFile: string;
        preCheck: string;
      };
    }[];
    pathLine: string | null;
    raw: string;
  };
  ocCrons: {
    entries: { id: string; schedule: string; command: string; label?: string }[];
    isEmpty: boolean;
  };
  launchd: {
    entries: {
      label: string;
      pid: number | null;
      status: number;
      plistPath?: string;
      classification: "protected" | "rogue" | "unknown";
    }[];
    breadcrumbExists: boolean;
  };
  budgetSummary: {
    weeklyTotal: number;
    dailyAverage: number;
    estimatedMonthly: number;
  };
}

export function TaskScheduler() {
  const fetcher = useCallback(() => api.scheduler(), []);
  const { data, error, loading, refresh } = usePolling<SchedulerState>({ fetcher, interval: 30000 });

  const [logModal, setLogModal] = useState<string | null>(null);
  const [scriptModal, setScriptModal] = useState<{
    script: string;
    schedule: string;
    description: string;
    command: string;
    lineIndex: number;
  } | null>(null);
  const [ocExpanded, setOcExpanded] = useState(false);
  const [launchdExpanded, setLaunchdExpanded] = useState(false);
  const [confirmRemoveOc, setConfirmRemoveOc] = useState<string | null>(null);
  const [confirmRemoveAllOc, setConfirmRemoveAllOc] = useState(false);
  const [confirmRemoveLaunchd, setConfirmRemoveLaunchd] = useState<string | null>(null);

  const handleToggleCron = async (lineIndex: number, enabled: boolean) => {
    await api.schedulerToggleCron(lineIndex, enabled);
    refresh();
  };

  const handleRemoveOcCron = async (id: string) => {
    await api.schedulerRemoveOcCron(id);
    refresh();
  };

  const handleRemoveAllOcCrons = async () => {
    await api.schedulerRemoveAllOcCrons();
    refresh();
  };

  const handleRemoveLaunchd = async (label: string) => {
    await api.schedulerRemoveLaunchd(label);
    refresh();
  };

  const handleRunScript = async (scriptName: string) => {
    await api.schedulerRunScript(scriptName);
    refresh();
  };

  if (loading && !data) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading scheduler state...</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const fmtCost = (n: number) => n < 0.01 ? `~$${n.toFixed(4)}` : `~$${n.toFixed(2)}`;

  const agentCount = data.crontab.entries.filter((e) => e.category === "agent").length;
  const systemCount = data.crontab.entries.filter((e) => e.category === "system").length;

  const ocHasEntries = !data.ocCrons.isEmpty && data.ocCrons.entries.length > 0;
  const ocOk = !ocHasEntries;
  const hasRogue = data.launchd.entries.some((e) => e.classification === "rogue" || e.classification === "unknown");
  const launchdOk = !hasRogue;

  const ocLabel = ocOk
    ? "OC Crons: Clear"
    : `OC Crons: ${data.ocCrons.entries.length} found`;
  const launchdLabel = launchdOk
    ? data.launchd.entries.length > 0 ? "Launchd: Gateway Only" : "Launchd: None"
    : "Launchd: Rogue Found";

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Task Scheduler</span>
        <div className={styles.headerChips}>
          <span
            className={`${styles.chip} ${ocOk ? styles.chipOk : styles.chipDanger}`}
            onClick={ocHasEntries ? () => setOcExpanded(!ocExpanded) : undefined}
            style={ocHasEntries ? { cursor: "pointer" } : undefined}
          >
            {ocLabel}
            {ocHasEntries && (
              <span className={styles.expandArrow} data-open={ocExpanded}>&#9654;</span>
            )}
          </span>
          <span
            className={`${styles.chip} ${launchdOk ? styles.chipOk : styles.chipDanger}`}
            onClick={hasRogue ? () => setLaunchdExpanded(!launchdExpanded) : undefined}
            style={hasRogue ? { cursor: "pointer" } : undefined}
          >
            {launchdLabel}
            {hasRogue && (
              <span className={styles.expandArrow} data-open={launchdExpanded}>&#9654;</span>
            )}
          </span>
        </div>
        <span className={styles.headerMeta}>
          {agentCount} agent &middot; {systemCount} system
          {data.budgetSummary.weeklyTotal > 0 && (
            <>
              <br />
              Automation cost: {fmtCost(data.budgetSummary.weeklyTotal)}/wk &middot;{" "}
              {fmtCost(data.budgetSummary.dailyAverage)}/day &middot;{" "}
              {fmtCost(data.budgetSummary.estimatedMonthly)}/mo
            </>
          )}
        </span>
      </div>

      {ocExpanded && ocHasEntries && (
        <div className={styles.expandPanel}>
          {data.ocCrons.entries.map((e) => (
            <div key={e.id} className={styles.expandEntry}>
              <span>
                <strong>{e.id}</strong> &mdash; <code>{e.schedule}</code> {e.command}
              </span>
              <button className={styles.removeBtn} onClick={() => setConfirmRemoveOc(e.id)}>
                Remove
              </button>
            </div>
          ))}
          <div style={{ marginTop: 8 }}>
            <button className={styles.dangerBtn} onClick={() => setConfirmRemoveAllOc(true)}>
              Remove All
            </button>
          </div>
        </div>
      )}

      {launchdExpanded && hasRogue && (
        <div className={styles.expandPanel}>
          {data.launchd.entries.map((e) => (
            <div key={e.label} className={styles.expandEntry}>
              <span>
                <strong>{e.label}</strong>
                {e.pid && <> &mdash; PID {e.pid}</>}
                {" "}&mdash; {e.classification}
              </span>
              {e.classification === "protected" ? (
                <span className={styles.protectedLabel}>protected</span>
              ) : (
                <button className={styles.removeBtn} onClick={() => setConfirmRemoveLaunchd(e.label)}>
                  Remove
                </button>
              )}
            </div>
          ))}
          {data.launchd.breadcrumbExists && (
            <div className={styles.breadcrumb}>
              A rogue service was previously blocked. See ~/.openclaw/ROGUE_SERVICE_BLOCKED.md
            </div>
          )}
        </div>
      )}

      <CrontabSection
        entries={data.crontab.entries}
        pathLine={data.crontab.pathLine}
        onToggle={handleToggleCron}
        onViewLogs={setLogModal}
        onViewScript={(entry) => setScriptModal({
          script: entry.script,
          schedule: entry.schedule,
          description: entry.description,
          command: entry.command,
          lineIndex: entry.lineIndex,
        })}
        onRunScript={handleRunScript}
      />

      <ConfirmDialog
        open={!!confirmRemoveOc}
        title="Remove OC Cron"
        message={`Remove internal cron job "${confirmRemoveOc}"?`}
        onConfirm={() => {
          if (confirmRemoveOc) handleRemoveOcCron(confirmRemoveOc);
          setConfirmRemoveOc(null);
        }}
        onCancel={() => setConfirmRemoveOc(null)}
        confirmLabel="Remove"
        danger
      />

      <ConfirmDialog
        open={confirmRemoveAllOc}
        title="Remove All OC Crons"
        message={`Remove all ${data.ocCrons.entries.length} OC internal cron jobs?`}
        onConfirm={() => {
          handleRemoveAllOcCrons();
          setConfirmRemoveAllOc(false);
        }}
        onCancel={() => setConfirmRemoveAllOc(false)}
        confirmLabel="Remove All"
        danger
      />

      <ConfirmDialog
        open={!!confirmRemoveLaunchd}
        title="Remove Launchd Service"
        message={`Remove launchd service "${confirmRemoveLaunchd}"? This will unload it and delete its plist.`}
        onConfirm={() => {
          if (confirmRemoveLaunchd) handleRemoveLaunchd(confirmRemoveLaunchd);
          setConfirmRemoveLaunchd(null);
        }}
        onCancel={() => setConfirmRemoveLaunchd(null)}
        confirmLabel="Remove"
        danger
      />

      {logModal && (
        <LogModal scriptName={logModal} onClose={() => setLogModal(null)} />
      )}

      {scriptModal && (
        <ScriptModal
          scriptName={scriptModal.script}
          schedule={scriptModal.schedule}
          description={scriptModal.description}
          command={scriptModal.command}
          lineIndex={scriptModal.lineIndex}
          onScheduleUpdated={() => {
            setScriptModal(null);
            refresh();
          }}
          onClose={() => setScriptModal(null)}
        />
      )}
    </div>
  );
}
