import { DataTable } from "../shared/DataTable.js";
import { StatusDot } from "../shared/StatusDot.js";
import { Badge } from "../shared/Badge.js";
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
}

interface CrontabSectionProps {
  entries: CrontabEntry[];
  pathLine: string | null;
  onToggle: (lineIndex: number, enabled: boolean) => void;
  onViewLogs: (scriptName: string) => void;
  onViewScript: (entry: CrontabEntry) => void;
  onEditCrontab: () => void;
}

const STATUS_MAP: Record<string, "online" | "offline" | "warning"> = {
  active: "online",
  paused: "offline",
  missing: "warning",
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatHour(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return "12:00 PM";
  return `${h - 12}:00 PM`;
}

function cronToHuman(schedule: string): string {
  if (schedule.startsWith("@")) {
    const keyword: Record<string, string> = {
      "@reboot": "On system boot",
      "@yearly": "Once a year",
      "@annually": "Once a year",
      "@monthly": "Once a month",
      "@weekly": "Once a week",
      "@daily": "Once a day",
      "@midnight": "Once a day",
      "@hourly": "Every hour",
    };
    return keyword[schedule] ?? schedule;
  }

  const parts = schedule.split(/\s+/);
  if (parts.length !== 5) return schedule;
  const [min, hour, dom, mon, dow] = parts;

  // Every N minutes: */N * * * *
  if (min.startsWith("*/") && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    const n = parseInt(min.slice(2), 10);
    return n === 1 ? "Every minute" : `Every ${n} minutes`;
  }

  // Every N hours: 0 */N * * *
  if (min === "0" && hour.startsWith("*/") && dom === "*" && mon === "*" && dow === "*") {
    const n = parseInt(hour.slice(2), 10);
    return n === 1 ? "Every hour" : `Every ${n} hours`;
  }

  // Parse hours list (e.g. "6,15")
  const hours = hour !== "*" ? hour.split(",").map((h) => parseInt(h, 10)) : null;
  const timeStr = hours ? hours.map(formatHour).join(", ") : null;

  // Specific time, every day: M H * * *
  if (hours && dom === "*" && mon === "*" && dow === "*") {
    return `Daily at ${timeStr}`;
  }

  // Day-of-week patterns
  if (hours && dom === "*" && mon === "*" && dow !== "*") {
    let dayStr: string;
    if (dow === "1-5") {
      dayStr = "Weekdays";
    } else if (dow === "0,6" || dow === "6,0") {
      dayStr = "Weekends";
    } else if (dow.includes(",")) {
      dayStr = dow.split(",").map((d) => SHORT_DAYS[parseInt(d, 10)] ?? d).join(", ");
    } else if (dow.includes("-")) {
      const [start, end] = dow.split("-").map((d) => parseInt(d, 10));
      dayStr = `${SHORT_DAYS[start]}–${SHORT_DAYS[end]}`;
    } else {
      const d = parseInt(dow, 10);
      dayStr = (DAY_NAMES[d] ?? dow) + "s";
    }
    return `${dayStr} at ${timeStr}`;
  }

  return schedule;
}

export function CrontabSection({ entries, pathLine, onToggle, onViewLogs, onViewScript, onEditCrontab }: CrontabSectionProps) {
  const activeCount = entries.filter((e) => e.status === "active").length;

  const columns = [
    {
      key: "status",
      header: "Status",
      width: "80px",
      render: (e: CrontabEntry) => (
        <StatusDot status={STATUS_MAP[e.status]} label={e.status} />
      ),
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
      width: "200px",
      render: (e: CrontabEntry) => <span>{e.script}</span>,
    },
    {
      key: "description",
      header: "Description",
      render: (e: CrontabEntry) => <span>{e.description}</span>,
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
      key: "actions",
      header: "",
      width: "140px",
      render: (e: CrontabEntry) => (
        <div className={styles.actions}>
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
      ),
    },
  ];

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>
          Crontab
          <Badge label={`${activeCount}/${entries.length}`} variant="green" />
        </div>
        <button className={styles.editBtn} onClick={onEditCrontab}>
          Edit Crontab
        </button>
      </div>
      <div className={styles.body}>
        <DataTable columns={columns} data={entries} rowKey={(e) => String(e.lineIndex)} onRowClick={onViewScript} compact />
        {pathLine && <div className={styles.pathLine}>{pathLine}</div>}
      </div>
    </div>
  );
}
