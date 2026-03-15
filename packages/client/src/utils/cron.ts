const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatHour(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return "12:00 PM";
  return `${h - 12}:00 PM`;
}

/** Describe a day-of-week field as a human string */
function dowToHuman(dow: string): string | null {
  if (dow === "*") return null;
  if (dow === "1-5") return "Weekdays";
  if (dow === "0,6" || dow === "6,0") return "Weekends";
  if (dow.includes(","))
    return dow.split(",").map((d) => SHORT_DAYS[parseInt(d, 10)] ?? d).join(", ");
  if (dow.includes("-")) {
    const [start, end] = dow.split("-").map((d) => parseInt(d, 10));
    return `${SHORT_DAYS[start]}\u2013${SHORT_DAYS[end]}`;
  }
  const d = parseInt(dow, 10);
  return (DAY_NAMES[d] ?? dow) + "s";
}

/** Describe an hour field as a human-readable window or time list */
function hourToHuman(hour: string): { timeStr: string; isRange: boolean } | null {
  if (hour === "*") return null;
  // Range like 7-17
  if (hour.match(/^\d+-\d+$/)) {
    const [start, end] = hour.split("-").map((h) => parseInt(h, 10));
    return { timeStr: `${formatHour(start)}\u2013${formatHour(end)}`, isRange: true };
  }
  // List like 6,15
  const hours = hour.split(",").map((h) => parseInt(h, 10));
  return { timeStr: hours.map(formatHour).join(", "), isRange: false };
}

export function cronToHuman(schedule: string): string {
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

  const dayStr = dowToHuman(dow);
  const hourInfo = hourToHuman(hour);
  const isEveryNMin = min.startsWith("*/");
  const minInterval = isEveryNMin ? parseInt(min.slice(2), 10) : null;

  // Every N minutes (all hours, all days): */N * * * *
  if (isEveryNMin && !hourInfo && dom === "*" && mon === "*" && !dayStr) {
    return minInterval === 1 ? "Every minute" : `Every ${minInterval} min`;
  }

  // Every N minutes within an hour range (with optional dow):
  //   */5 7-17 * * 1-5 → "Weekdays, every 5 min (7:00 AM–5:00 PM)"
  if (isEveryNMin && hourInfo?.isRange && dom === "*" && mon === "*") {
    const freq = minInterval === 1 ? "Every minute" : `Every ${minInterval} min`;
    const prefix = dayStr ? `${dayStr}, ` : "";
    return `${prefix}${freq} (${hourInfo.timeStr})`;
  }

  // Every N hours: 0 */N * * *
  if (min === "0" && hour.startsWith("*/") && dom === "*" && mon === "*" && !dayStr) {
    const n = parseInt(hour.slice(2), 10);
    return n === 1 ? "Every hour" : `Every ${n} hours`;
  }

  // Specific time(s), every day or specific days
  if (hourInfo && !hourInfo.isRange && dom === "*" && mon === "*") {
    const prefix = dayStr ?? "Daily";
    return `${prefix} at ${hourInfo.timeStr}`;
  }

  // Hour range with fixed minute, specific days:
  //   0 7-17 * * 1-5 → "Weekdays, hourly (7:00 AM–5:00 PM)"
  if (hourInfo?.isRange && dom === "*" && mon === "*") {
    const prefix = dayStr ? `${dayStr}, ` : "";
    return `${prefix}hourly (${hourInfo.timeStr})`;
  }

  // Monthly: M H D * *
  if (hourInfo && !hourInfo.isRange && dom !== "*" && mon === "*" && !dayStr) {
    const dayNum = parseInt(dom, 10);
    const suffix = dayNum === 1 ? "st" : dayNum === 2 ? "nd" : dayNum === 3 ? "rd" : "th";
    return `${dayNum}${suffix} of each month at ${hourInfo.timeStr}`;
  }

  return schedule;
}
