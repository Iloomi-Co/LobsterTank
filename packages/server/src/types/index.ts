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

export interface ModelSpendEntry {
  model: string;
  provider: string;
  invocations: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCost: number;
  isLocal: boolean;
  agents: string[];
}

export interface DailyModelSpend {
  date: string;
  models: Record<string, number>;
  total: number;
}

export interface ModelSpendResponse {
  models: ModelSpendEntry[];
  totalEstimatedCost: number;
  localSavings: number;
  activeModelCount: number;
  mostActiveModel: string;
  daily: DailyModelSpend[];
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
  category: "agent" | "system";
  scriptPath: string;
  runHistory: { timestamp: string; status: "success" | "failure" | "skipped" }[];
  costEstimate: {
    lastRunCost: number | null;
    weeklyTotal: number | null;
    runsThisWeek: number;
  } | null;
  registrationMeta?: {
    agent: string;
    description: string;
    pauseFile: string;
    preCheck: string;
  };
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
  budgetSummary: {
    weeklyTotal: number;
    dailyAverage: number;
    estimatedMonthly: number;
  };
}
