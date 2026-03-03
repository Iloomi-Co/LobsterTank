import { useState, useMemo } from "react";
import { api } from "../../api/client.js";
import { cronToHuman } from "../../utils/cron.js";
import styles from "./ScheduleEditor.module.css";

interface ScheduleEditorProps {
  currentSchedule: string;
  lineIndex: number;
  onSave: () => void;
  onClose: () => void;
}

type Mode = "everyMinutes" | "everyHours" | "daily" | "specificDays" | "monthly" | "custom";

const MINUTE_OPTIONS = [1, 2, 5, 10, 15, 30];
const HOUR_OPTIONS = [1, 2, 3, 4, 6, 8, 12];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatHour12(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return "12:00 PM";
  return `${h - 12}:00 PM`;
}

interface DetectedState {
  mode: Mode;
  minutes: number;
  hours: number;
  hour: number;
  hour2: number | null;
  hour3: number | null;
  days: boolean[];
  dayOfMonth: number;
  custom: string;
}

function parseHours(hr: string): { hour: number; hour2: number | null; hour3: number | null } | null {
  const nums = hr.split(",").map((h) => parseInt(h, 10));
  if (nums.some((n) => isNaN(n))) return null;
  return { hour: nums[0], hour2: nums[1] ?? null, hour3: nums[2] ?? null };
}

function detectMode(schedule: string): DetectedState {
  const defaults = { minutes: 5, hours: 1, hour: 9, hour2: null as number | null, hour3: null as number | null, days: [false, true, true, true, true, true, false], dayOfMonth: 1, custom: schedule };

  if (schedule.startsWith("@")) {
    return { mode: "custom", ...defaults, custom: schedule };
  }

  const parts = schedule.split(/\s+/);
  if (parts.length !== 5) {
    return { mode: "custom", ...defaults, custom: schedule };
  }
  const [min, hr, dom, mon, dow] = parts;

  // Every N minutes: */N * * * *
  if (min.startsWith("*/") && hr === "*" && dom === "*" && mon === "*" && dow === "*") {
    const n = parseInt(min.slice(2), 10);
    if (MINUTE_OPTIONS.includes(n)) {
      return { mode: "everyMinutes", ...defaults, minutes: n };
    }
  }

  // Every N hours: 0 */N * * *
  if (min === "0" && hr.startsWith("*/") && dom === "*" && mon === "*" && dow === "*") {
    const n = parseInt(hr.slice(2), 10);
    if (HOUR_OPTIONS.includes(n)) {
      return { mode: "everyHours", ...defaults, hours: n };
    }
  }

  // Daily at time(s): M H[,H,H] * * *
  if (/^\d+$/.test(min) && /^[\d,]+$/.test(hr) && dom === "*" && mon === "*" && dow === "*") {
    const parsed = parseHours(hr);
    if (parsed) return { mode: "daily", ...defaults, ...parsed };
  }

  // Specific days: M H[,H,H] * * D,D,...
  if (/^\d+$/.test(min) && /^[\d,]+$/.test(hr) && dom === "*" && mon === "*" && dow !== "*") {
    const parsed = parseHours(hr);
    if (parsed) {
      const dayNums = dow.split(",").map((d) => parseInt(d, 10)).filter((d) => !isNaN(d));
      const days = [false, false, false, false, false, false, false];
      for (const d of dayNums) {
        if (d >= 0 && d <= 6) days[d] = true;
      }
      // Also handle range notation like 1-5
      if (dow.includes("-") && !dow.includes(",")) {
        const [start, end] = dow.split("-").map((d) => parseInt(d, 10));
        for (let i = start; i <= end; i++) {
          if (i >= 0 && i <= 6) days[i] = true;
        }
      }
      return { mode: "specificDays", ...defaults, ...parsed, days };
    }
  }

  // Monthly: M H D * *
  if (/^\d+$/.test(min) && /^\d+$/.test(hr) && /^\d+$/.test(dom) && mon === "*" && dow === "*") {
    return { mode: "monthly", ...defaults, hour: parseInt(hr, 10), dayOfMonth: parseInt(dom, 10) };
  }

  return { mode: "custom", ...defaults, custom: schedule };
}

function buildHourField(hour: number, hour2: number | null, hour3: number | null): string {
  const hrs = [hour];
  if (hour2 !== null) hrs.push(hour2);
  if (hour3 !== null) hrs.push(hour3);
  // Sort and deduplicate
  const unique = [...new Set(hrs)].sort((a, b) => a - b);
  return unique.join(",");
}

function buildCron(mode: Mode, minutes: number, hours: number, hour: number, hour2: number | null, hour3: number | null, days: boolean[], dayOfMonth: number, custom: string): string {
  switch (mode) {
    case "everyMinutes":
      return `*/${minutes} * * * *`;
    case "everyHours":
      return `0 */${hours} * * *`;
    case "daily":
      return `0 ${buildHourField(hour, hour2, hour3)} * * *`;
    case "specificDays": {
      const selected = days.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
      const h = buildHourField(hour, hour2, hour3);
      if (selected.length === 0) return `0 ${h} * * *`;
      return `0 ${h} * * ${selected.join(",")}`;
    }
    case "monthly":
      return `0 ${hour} ${dayOfMonth} * *`;
    case "custom":
      return custom;
  }
}

export function ScheduleEditor({ currentSchedule, lineIndex, onSave, onClose }: ScheduleEditorProps) {
  const detected = useMemo(() => detectMode(currentSchedule), [currentSchedule]);

  const [mode, setMode] = useState<Mode>(detected.mode);
  const [minutes, setMinutes] = useState(detected.minutes);
  const [hours, setHours] = useState(detected.hours);
  const [hour, setHour] = useState(detected.hour);
  const [hour2, setHour2] = useState<number | null>(detected.hour2);
  const [hour3, setHour3] = useState<number | null>(detected.hour3);
  const [days, setDays] = useState(detected.days);
  const [dayOfMonth, setDayOfMonth] = useState(detected.dayOfMonth);
  const [custom, setCustom] = useState(detected.custom);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cronExpression = buildCron(mode, minutes, hours, hour, hour2, hour3, days, dayOfMonth, custom);
  const humanText = cronToHuman(cronExpression);

  const toggleDay = (index: number) => {
    setDays((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const res = await api.schedulerUpdateSchedule(lineIndex, cronExpression);
    setSaving(false);
    if (res.ok) {
      onSave();
    } else {
      setError(res.error ?? "Failed to update schedule");
    }
  };

  const modes: { key: Mode; label: string }[] = [
    { key: "everyMinutes", label: "Every N min" },
    { key: "everyHours", label: "Every N hrs" },
    { key: "daily", label: "Daily" },
    { key: "specificDays", label: "Specific days" },
    { key: "monthly", label: "Monthly" },
    { key: "custom", label: "Custom" },
  ];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Change Schedule</h3>
        </div>

        <div className={styles.modes}>
          {modes.map((m) => (
            <button
              key={m.key}
              className={`${styles.modeBtn} ${mode === m.key ? styles.modeBtnActive : ""}`}
              onClick={() => setMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className={styles.fields}>
          {mode === "everyMinutes" && (
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Every</span>
              <select className={styles.fieldSelect} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                {MINUTE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span>minutes</span>
            </div>
          )}

          {mode === "everyHours" && (
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Every</span>
              <select className={styles.fieldSelect} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                {HOUR_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span>hours</span>
            </div>
          )}

          {mode === "daily" && (
            <>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>At</span>
                <select className={styles.fieldSelect} value={hour} onChange={(e) => setHour(Number(e.target.value))}>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{formatHour12(i)}</option>
                  ))}
                </select>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>Also</span>
                <select className={styles.fieldSelect} value={hour2 ?? ""} onChange={(e) => setHour2(e.target.value === "" ? null : Number(e.target.value))}>
                  <option value="">--</option>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{formatHour12(i)}</option>
                  ))}
                </select>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>Also</span>
                <select className={styles.fieldSelect} value={hour3 ?? ""} onChange={(e) => setHour3(e.target.value === "" ? null : Number(e.target.value))}>
                  <option value="">--</option>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{formatHour12(i)}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {mode === "specificDays" && (
            <>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>Days</span>
                <div className={styles.dayGrid}>
                  {DAY_LABELS.map((label, i) => (
                    <button
                      key={i}
                      className={`${styles.dayBtn} ${days[i] ? styles.dayBtnActive : ""}`}
                      onClick={() => toggleDay(i)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>At</span>
                <select className={styles.fieldSelect} value={hour} onChange={(e) => setHour(Number(e.target.value))}>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{formatHour12(i)}</option>
                  ))}
                </select>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>Also</span>
                <select className={styles.fieldSelect} value={hour2 ?? ""} onChange={(e) => setHour2(e.target.value === "" ? null : Number(e.target.value))}>
                  <option value="">--</option>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{formatHour12(i)}</option>
                  ))}
                </select>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>Also</span>
                <select className={styles.fieldSelect} value={hour3 ?? ""} onChange={(e) => setHour3(e.target.value === "" ? null : Number(e.target.value))}>
                  <option value="">--</option>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{formatHour12(i)}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {mode === "monthly" && (
            <>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>Day</span>
                <select className={styles.fieldSelect} value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))}>
                  {Array.from({ length: 28 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
                <span>of each month</span>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>At</span>
                <select className={styles.fieldSelect} value={hour} onChange={(e) => setHour(Number(e.target.value))}>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{formatHour12(i)}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {mode === "custom" && (
            <div className={styles.fieldRow}>
              <input
                className={styles.fieldInput}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="*/5 * * * *"
                spellCheck={false}
              />
            </div>
          )}
        </div>

        <div className={styles.preview}>
          <div className={styles.previewHuman}>{humanText}</div>
          <div className={styles.previewCron}>{cronExpression}</div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
