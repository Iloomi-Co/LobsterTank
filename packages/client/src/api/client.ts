interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    return await res.json();
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Network error", timestamp: new Date().toISOString() };
  }
}

export const api = {
  ping: () => request<{ message: string }>("/ping"),
  health: () => request<any>("/health"),
  processes: () => request<any[]>("/processes"),
  killProcess: (pid: number) =>
    request<any>("/processes/kill", { method: "POST", body: JSON.stringify({ pid }) }),
  spend: () => request<any>("/spend"),
  spendByModel: () => request<any>("/spend/by-model"),
  launchd: () => request<any[]>("/launchd"),
  removeLaunchd: (label: string) =>
    request<any>("/launchd/remove", { method: "POST", body: JSON.stringify({ label }) }),
  sessions: () => request<any[]>("/sessions"),
  cleanupSession: (sessionId: string, agent: string) =>
    request<any>("/sessions/cleanup", { method: "POST", body: JSON.stringify({ sessionId, agent }) }),
  cron: () => request<any[]>("/cron"),
  cronLogs: () => request<{ content: string }>("/cron/logs"),
  agents: () => request<any>("/agents"),
  ollama: () => request<any[]>("/ollama"),
  emergencyStop: () =>
    request<any>("/actions/emergency-stop", { method: "POST" }),
  actionLog: () => request<{ content: string }>("/actions/log"),
  config: () => request<any>("/config"),
  updateConfig: (config: any) =>
    request<any>("/config", { method: "PUT", body: JSON.stringify(config) }),
  instances: () => request<any>("/instances"),

  // Step 2: Audit
  audit: () => request<any>("/audit"),
  auditApply: (apply: Record<string, boolean>) =>
    request<any>("/audit/apply", { method: "POST", body: JSON.stringify({ apply }) }),

  // Step 2: Config Sync
  configSyncCheck: () => request<any>("/config-sync/check"),
  configSyncApply: () => request<any>("/config-sync/apply", { method: "POST" }),
  configSyncRules: () => request<any>("/config-sync/rules"),

  // Step 2: Scripts
  scriptsStatus: () => request<any>("/scripts/status"),
  scriptsDeploy: () => request<any>("/scripts/deploy", { method: "POST" }),
  scriptsDeployOne: (name: string) =>
    request<any>(`/scripts/deploy/${name}`, { method: "POST" }),

  // Step 2: Crontab
  crontabStatus: () => request<any>("/crontab"),
  crontabInstall: (entries?: string[]) =>
    request<any>("/crontab/install", { method: "POST", body: JSON.stringify({ entries }) }),

  // Step 2: Registry
  registry: () => request<any>("/registry"),
  registryBootstrap: () => request<any>("/registry/bootstrap", { method: "POST" }),

  // Step 2: Git
  gitStatus: () => request<any>("/git/status"),
  gitInit: () => request<any>("/git/init", { method: "POST" }),
  gitSnapshot: (message?: string) =>
    request<any>("/git/snapshot", { method: "POST", body: JSON.stringify({ message }) }),
  gitLog: () => request<any>("/git/log"),
  gitDiff: () => request<any>("/git/diff"),
  gitRevert: () => request<any>("/git/revert", { method: "POST" }),

  // Step 4: Task Scheduler
  scheduler: () => request<any>("/scheduler"),
  schedulerToggleCron: (lineIndex: number, enabled: boolean) =>
    request<any>("/scheduler/crontab/toggle", {
      method: "POST",
      body: JSON.stringify({ lineIndex, enabled }),
    }),
  schedulerEditCrontab: (content: string) =>
    request<any>("/scheduler/crontab/edit", {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  schedulerRemoveOcCron: (id: string) =>
    request<any>("/scheduler/oc-cron/remove", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),
  schedulerRemoveAllOcCrons: () =>
    request<any>("/scheduler/oc-cron/remove-all", { method: "POST" }),
  schedulerRemoveLaunchd: (label: string) =>
    request<any>("/scheduler/launchd/remove", {
      method: "POST",
      body: JSON.stringify({ label }),
    }),
  schedulerRunScript: (scriptName: string) =>
    request<{ scriptName: string; exitCode: number; output: string }>("/scheduler/run-script", {
      method: "POST",
      body: JSON.stringify({ scriptName }),
    }),
  schedulerLogs: (scriptName: string) =>
    request<{ content: string; lines: number }>(`/scheduler/logs/${encodeURIComponent(scriptName)}`),
  schedulerScript: (scriptName: string) =>
    request<{ content: string; path: string }>(`/scheduler/script/${encodeURIComponent(scriptName)}`),

  // Step 5: Determinism Audit
  determinismScan: () => request<any>("/determinism/scan"),
  determinismDeepScan: (findingIds?: string[]) =>
    request<any>("/determinism/deep-scan", {
      method: "POST",
      body: JSON.stringify({ findingIds }),
    }),
  determinismDispatch: (findingId: string, instruction: string) =>
    request<any>("/determinism/dispatch", {
      method: "POST",
      body: JSON.stringify({ findingId, instruction }),
    }),
  determinismExport: () => request<any>("/determinism/export"),

  // Step 6: Gateway
  gatewayRestart: () =>
    request<any>("/gateway/restart", { method: "POST" }),
};
