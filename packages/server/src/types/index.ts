export interface OcInstance {
  id: string;
  name: string;
  path: string;
  gatewayPort: number;
  isDefault: boolean;
}

export interface InstanceRegistry {
  instances: OcInstance[];
  lastUpdated: string;
}

export interface DashboardConfig {
  refreshInterval: number;
  theme: "dark";
  pinnedPanels: string[];
}

export interface AgentInfo {
  id: string;
  name?: string;
  workspace?: string;
  model?: {
    primary?: string;
    fallbacks?: string[];
  };
}

export interface ProcessInfo {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  command: string;
  isRogue: boolean;
}

export interface GatewayStatus {
  running: boolean;
  pid?: number;
  port: number;
  uptime?: string;
}

export interface HealthStatus {
  gateway: GatewayStatus;
  agents: AgentInfo[];
  timestamp: string;
}

export interface SessionInfo {
  id: string;
  agent: string;
  startedAt: string;
  lastActivity: string;
  isStale: boolean;
}

export interface SpendData {
  total?: number;
  byModel?: Record<string, number>;
  balance?: number;
  lastUpdated: string;
  error?: string;
}

export interface LaunchdJob {
  label: string;
  pid: number | null;
  status: number;
  plistPath?: string;
  isOcRelated: boolean;
  classification: "safe" | "rogue" | "unknown";
}

export interface CronJob {
  schedule: string;
  command: string;
  isOcRelated: boolean;
  isPaused: boolean;
}

export interface OllamaModel {
  name: string;
  size: string;
  modified: string;
  isRunning: boolean;
  usedByAgent?: string;
}

export interface ActionResult {
  success: boolean;
  action: string;
  details: string;
  timestamp: string;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

// --- Scheduler types ---

export interface SchedulerCrontabEntry {
  lineIndex: number;
  schedule: string;
  command: string;
  script: string;
  description: string;
  logFile: string | null;
  lastRun: string | null;
  status: "active" | "paused" | "missing";
}

export interface SchedulerOcCron {
  id: string;
  schedule: string;
  command: string;
  label?: string;
}

export interface SchedulerLaunchdEntry {
  label: string;
  pid: number | null;
  status: number;
  plistPath?: string;
  classification: "protected" | "rogue" | "unknown";
}

export interface SchedulerState {
  crontab: {
    entries: SchedulerCrontabEntry[];
    pathLine: string | null;
    raw: string;
  };
  ocCrons: {
    entries: SchedulerOcCron[];
    isEmpty: boolean;
  };
  launchd: {
    entries: SchedulerLaunchdEntry[];
    breadcrumbExists: boolean;
  };
}
