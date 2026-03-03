const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatHour(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return "12:00 PM";
  return `${h - 12}:00 PM`;
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
      dayStr = `${SHORT_DAYS[start]}\u2013${SHORT_DAYS[end]}`;
    } else {
      const d = parseInt(dow, 10);
      dayStr = (DAY_NAMES[d] ?? dow) + "s";
    }
    return `${dayStr} at ${timeStr}`;
  }

  // Monthly: M H D * *
  if (hours && dom !== "*" && mon === "*" && dow === "*") {
    const dayNum = parseInt(dom, 10);
    const suffix = dayNum === 1 ? "st" : dayNum === 2 ? "nd" : dayNum === 3 ? "rd" : "th";
    return `${dayNum}${suffix} of each month at ${timeStr}`;
  }

  return schedule;
}
