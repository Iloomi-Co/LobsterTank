import { useState } from "react";
import { StatusDot } from "../shared/StatusDot.js";
import { Badge } from "../shared/Badge.js";
import { HelplessnessWarning } from "./HelplessnessWarning.js";
import { cronToHuman } from "../../utils/cron.js";
import { getModelColor } from "../../utils/modelColors.js";
import styles from "./CrontabSection.module.css";

interface CrontabEntry {
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
  modelInfo?: {
    model: string;
    provider: string;
    isLocal: boolean;
  } | null;
  registrationMeta?: {
    agent: string;
    description: string;
    pauseFile: string;
    preCheck: string;
  };
  helplessness?: {
    detected: boolean;
    agentName: string | null;
    patterns: {
      type: "repeated-failure" | "capability-mismatch" | "stale-session";
      claimedLimitation: string;
      actualCapability?: string;
      toolsmdLastModified?: string;
      firstFailure?: string;
      lastFailure?: string;
      occurrences: number;
    }[];
    recommendation: string | null;
  } | null;
}

interface CrontabSectionProps {
  entries: CrontabEntry[];
  pathLine: string | null;
  onToggle: (lineIndex: number, enabled: boolean) => void;
  onViewLogs: (scriptName: string) => void;
  onViewScript: (entry: CrontabEntry) => void;
  onRunScript: (scriptName: string) => Promise<void>;
  onForceNewSession?: (scriptName: string) => Promise<void>;
  dismissedHelplessness?: Set<string>;
  onDismissHelplessness?: (scriptName: string) => void;
}

const STATUS_MAP: Record<string, "online" | "offline" | "warning"> = {
  active: "online",
  paused: "offline",
  missing: "warning",
};

const SPARK_CLASS: Record<string, string> = {
  success: styles.sparkSuccess,
  failure: styles.sparkFailure,
  skipped: styles.sparkSkipped,
};

function RunSparkline({ history }: { history: { timestamp: string; status: string }[] }) {
  if (!history.length) {
    return <span className={styles.sparkEmpty}>--</span>;
  }
  const padded: (typeof history[number] | null)[] = [
    ...Array(7 - history.length).fill(null),
    ...history,
  ];
  return (
    <div className={styles.sparkline}>
      {padded.map((run, i) => (
        <span
          key={i}
          className={`${styles.sparkDot} ${run ? SPARK_CLASS[run.status] ?? "" : styles.sparkNoData}`}
          title={run ? `${run.timestamp}: ${run.status}` : "No data"}
        />
      ))}
    </div>
  );
}

function formatCardCost(entry: CrontabEntry): { text: string; className?: string; title?: string } {
  const c = entry.costEstimate;
  if (!c || c.weeklyTotal === null) {
    return { text: "\u2014", className: styles.taskStatMuted };
  }
  if (c.weeklyTotal === 0) {
    return { text: "Free", className: styles.taskStatFree };
  }
  const weekly = c.weeklyTotal < 0.01
    ? `~$${c.weeklyTotal.toFixed(4)}/wk`
    : `~$${c.weeklyTotal.toFixed(2)}/wk`;
  const perRun = c.lastRunCost !== null
    ? (c.lastRunCost < 0.01 ? `$${c.lastRunCost.toFixed(4)}` : `$${c.lastRunCost.toFixed(2)}`)
    : "\u2014";
  return { text: weekly, title: `${c.runsThisWeek} runs this week \u00b7 ${perRun}/run` };
}

function TaskCard({
  entry,
  runningScript,
  runResult,
  onCardClick,
  onRun,
  onViewLogs,
  onToggle,
}: {
  entry: CrontabEntry;
  runningScript: string | null;
  runResult: { script: string; ok: boolean; message: string } | null;
  onCardClick: (entry: CrontabEntry) => void;
  onRun: (scriptName: string) => void;
  onViewLogs: (scriptName: string) => void;
  onToggle: (lineIndex: number, enabled: boolean) => void;
}) {
  const cost = formatCardCost(entry);
  const isRunning = runningScript === entry.script;
  const cardResult = runResult?.script === entry.script ? runResult : null;

  return (
    <div className={styles.taskCard} onClick={() => onCardClick(entry)}>
      <div className={styles.taskCardHeader}>
        <div className={styles.taskCardTitle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StatusDot status={STATUS_MAP[entry.status]} />
            <span className={styles.taskCardName}>{entry.script}</span>
          </div>
          {entry.description && (
            <span className={styles.taskCardDesc}>{entry.description}</span>
          )}
        </div>
        <Badge label={entry.status} variant={entry.status === "active" ? "green" : entry.status === "paused" ? "muted" : "yellow"} />
      </div>

      <div className={styles.taskStats}>
        <div className={styles.taskStat}>
          <span className={styles.taskStatLabel}>Schedule</span>
          <span className={styles.taskStatValue}><code>{entry.schedule}</code></span>
        </div>
        <div className={styles.taskStat}>
          <span className={styles.taskStatLabel}>Frequency</span>
          <span className={styles.taskStatValue}>{cronToHuman(entry.schedule)}</span>
        </div>
        <div className={styles.taskStat}>
          <span className={styles.taskStatLabel}>Last Run</span>
          <span className={styles.taskStatValue}>{entry.lastRun ?? "\u2014"}</span>
        </div>
        <div className={styles.taskStat}>
          <span className={styles.taskStatLabel}>Cost</span>
          <span className={`${styles.taskStatValue} ${cost.className ?? ""}`} title={cost.title}>
            {cost.text}
          </span>
        </div>
      </div>

      <RunSparkline history={entry.runHistory} />

      {entry.modelInfo && (
        <div className={styles.modelChip}>
          <span
            className={styles.modelDot}
            style={{ background: getModelColor(entry.modelInfo.model, entry.modelInfo.isLocal) }}
          />
          <span>{entry.modelInfo.model}</span>
          {entry.modelInfo.isLocal && <span className={styles.modelFree}>FREE</span>}
        </div>
      )}

      <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
        {entry.script.endsWith(".sh") && entry.status !== "missing" && (
          <button
            className={`${styles.actionBtn} ${styles.runBtn}`}
            disabled={isRunning || !!runningScript}
            onClick={() => onRun(entry.script)}
          >
            {isRunning ? "Running..." : "Run"}
          </button>
        )}
        {entry.logFile && (
          <button className={styles.actionBtn} onClick={() => onViewLogs(entry.script)}>
            Logs
          </button>
        )}
        <button
          className={styles.actionBtn}
          onClick={() => onToggle(entry.lineIndex, entry.status === "paused")}
        >
          {entry.status === "paused" ? "Enable" : "Disable"}
        </button>
        {cardResult && (
          <span className={cardResult.ok ? styles.runResultOk : styles.runResultFail}>
            {cardResult.message}
          </span>
        )}
      </div>
    </div>
  );
}

export function CrontabSection({ entries, pathLine, onToggle, onViewLogs, onViewScript, onRunScript, onForceNewSession, dismissedHelplessness, onDismissHelplessness }: CrontabSectionProps) {
  const [runningScript, setRunningScript] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{ script: string; ok: boolean; message: string } | null>(null);
  const agentEntries = entries.filter((e) => e.category === "agent");
  const systemEntries = entries.filter((e) => e.category === "system");
  const agentActive = agentEntries.filter((e) => e.status === "active").length;
  const sysActive = systemEntries.filter((e) => e.status === "active").length;

  const handleRun = async (scriptName: string) => {
    setRunningScript(scriptName);
    setRunResult(null);
    try {
      await onRunScript(scriptName);
      setRunResult({ script: scriptName, ok: true, message: "Completed" });
    } catch (e: any) {
      setRunResult({ script: scriptName, ok: false, message: e.message ?? "Failed" });
    } finally {
      setRunningScript(null);
      setTimeout(() => setRunResult(null), 5000);
    }
  };

  return (
    <>
      {/* Agent Automations */}
      <div className={styles.sectionHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className={styles.sectionHeading}>Agent Automations</span>
          <Badge label={`${agentActive}/${agentEntries.length}`} variant="green" />
        </div>
      </div>
      <div className={styles.taskGrid}>
        {agentEntries.map((entry) => (
          <TaskCard
            key={entry.lineIndex}
            entry={entry}
            runningScript={runningScript}
            runResult={runResult}
            onCardClick={onViewScript}
            onRun={handleRun}
            onViewLogs={onViewLogs}
            onToggle={onToggle}
          />
        ))}
      </div>
      {onForceNewSession && onDismissHelplessness && agentEntries
        .filter((e) => e.helplessness?.detected && !dismissedHelplessness?.has(e.script))
        .map((e) => (
          <HelplessnessWarning
            key={e.script}
            scriptName={e.script}
            agentName={e.helplessness!.agentName}
            patterns={e.helplessness!.patterns}
            recommendation={e.helplessness!.recommendation}
            onForceNewSession={onForceNewSession}
            onDismiss={onDismissHelplessness}
          />
        ))}

      {/* System Infrastructure */}
      <div className={`${styles.sectionHeader} ${styles.systemSection}`}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className={styles.sectionHeading}>System Infrastructure</span>
          <Badge label={`${sysActive}/${systemEntries.length}`} variant="muted" />
        </div>
      </div>
      <div className={`${styles.taskGrid} ${styles.systemSection}`}>
        {systemEntries.map((entry) => (
          <TaskCard
            key={entry.lineIndex}
            entry={entry}
            runningScript={runningScript}
            runResult={runResult}
            onCardClick={onViewScript}
            onRun={handleRun}
            onViewLogs={onViewLogs}
            onToggle={onToggle}
          />
        ))}
      </div>
      {pathLine && <div className={styles.pathLine}>{pathLine}</div>}
    </>
  );
}
