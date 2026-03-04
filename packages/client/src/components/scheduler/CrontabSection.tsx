import { useState } from "react";
import { DataTable } from "../shared/DataTable.js";
import { StatusDot } from "../shared/StatusDot.js";
import { Badge } from "../shared/Badge.js";
import { cronToHuman } from "../../utils/cron.js";
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
  registrationMeta?: {
    agent: string;
    description: string;
    pauseFile: string;
    preCheck: string;
  };
}

interface CrontabSectionProps {
  entries: CrontabEntry[];
  pathLine: string | null;
  onToggle: (lineIndex: number, enabled: boolean) => void;
  onViewLogs: (scriptName: string) => void;
  onViewScript: (entry: CrontabEntry) => void;
  onRunScript: (scriptName: string) => Promise<void>;
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

export function CrontabSection({ entries, pathLine, onToggle, onViewLogs, onViewScript, onRunScript }: CrontabSectionProps) {
  const [runningScript, setRunningScript] = useState<string | null>(null);
  const agentEntries = entries.filter((e) => e.category === "agent");
  const systemEntries = entries.filter((e) => e.category === "system");
  const agentActive = agentEntries.filter((e) => e.status === "active").length;
  const sysActive = systemEntries.filter((e) => e.status === "active").length;

  const handleRun = async (scriptName: string) => {
    setRunningScript(scriptName);
    try {
      await onRunScript(scriptName);
    } finally {
      setRunningScript(null);
    }
  };

  const baseColumns = [
    {
      key: "status",
      header: "Status",
      width: "80px",
      render: (e: CrontabEntry) => (
        <StatusDot status={STATUS_MAP[e.status]} label={e.status} />
      ),
    },
    {
      key: "runHistory",
      header: "History",
      width: "90px",
      render: (e: CrontabEntry) => <RunSparkline history={e.runHistory} />,
    },
    {
      key: "schedule",
      header: "Schedule",
      width: "120px",
      render: (e: CrontabEntry) => <code>{e.schedule}</code>,
    },
    {
      key: "frequency",
      header: "Frequency",
      width: "200px",
      render: (e: CrontabEntry) => (
        <span style={{ color: "var(--text-secondary)" }}>{cronToHuman(e.schedule)}</span>
      ),
    },
    {
      key: "script",
      header: "Script",
      width: "220px",
      render: (e: CrontabEntry) => (
        <span className={styles.scriptCell}>
          {e.script}
          {e.scriptPath && (
            <a
              href={`vscode://file${e.scriptPath}`}
              className={styles.codeLink}
              onClick={(ev) => ev.stopPropagation()}
              title={`Open ${e.scriptPath} in VS Code`}
            >
              &lt;/&gt;
            </a>
          )}
        </span>
      ),
    },
    {
      key: "description",
      header: "Description",
      render: (e: CrontabEntry) => (
        <span>
          {e.description}
          {e.registrationMeta?.agent && (
            <span className={styles.agentBadge}> &rarr; {e.registrationMeta.agent}</span>
          )}
        </span>
      ),
    },
    {
      key: "lastRun",
      header: "Last Run",
      width: "150px",
      render: (e: CrontabEntry) => (
        <span style={{ color: "var(--text-muted)" }}>{e.lastRun ?? "--"}</span>
      ),
    },
    {
      key: "cost",
      header: "Cost",
      width: "80px",
      render: (e: CrontabEntry) => {
        const c = e.costEstimate;
        if (!c || c.weeklyTotal === null) {
          return <span className={styles.costDash}>&mdash;</span>;
        }
        if (c.weeklyTotal === 0) {
          return <span className={styles.costFree}>Free</span>;
        }
        const weekly = c.weeklyTotal < 0.01
          ? `~$${c.weeklyTotal.toFixed(4)}`
          : `~$${c.weeklyTotal.toFixed(2)}`;
        const perRun = c.lastRunCost !== null
          ? (c.lastRunCost < 0.01 ? `$${c.lastRunCost.toFixed(4)}` : `$${c.lastRunCost.toFixed(2)}`)
          : "—";
        const tip = `${c.runsThisWeek} runs this week · ${perRun}/run`;
        return (
          <span className={styles.costCell} title={tip}>{weekly}</span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      width: "190px",
      render: (e: CrontabEntry) => {
        const isRunning = runningScript === e.script;
        return (
          <div className={styles.actions}>
            {e.script.endsWith(".sh") && e.status !== "missing" && (
              <button
                className={`${styles.actionBtn} ${styles.runBtn}`}
                disabled={isRunning || !!runningScript}
                onClick={(ev) => { ev.stopPropagation(); handleRun(e.script); }}
              >
                {isRunning ? "Running..." : "Run"}
              </button>
            )}
            {e.logFile && (
              <button className={styles.actionBtn} onClick={(ev) => { ev.stopPropagation(); onViewLogs(e.script); }}>
                Logs
              </button>
            )}
            <button
              className={styles.actionBtn}
              onClick={(ev) => { ev.stopPropagation(); onToggle(e.lineIndex, e.status === "paused"); }}
            >
              {e.status === "paused" ? "Enable" : "Disable"}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>
            Agent Automations
            <Badge label={`${agentActive}/${agentEntries.length}`} variant="green" />
          </div>
        </div>
        <div className={styles.body}>
          <DataTable columns={baseColumns} data={agentEntries} rowKey={(e) => String(e.lineIndex)} onRowClick={onViewScript} compact />
        </div>
      </div>

      <div className={`${styles.section} ${styles.systemSection}`}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>
            System Infrastructure
            <Badge label={`${sysActive}/${systemEntries.length}`} variant="muted" />
          </div>
        </div>
        <div className={styles.body}>
          <DataTable columns={baseColumns} data={systemEntries} rowKey={(e) => String(e.lineIndex)} onRowClick={onViewScript} compact />
          {pathLine && <div className={styles.pathLine}>{pathLine}</div>}
        </div>
      </div>
    </>
  );
}
