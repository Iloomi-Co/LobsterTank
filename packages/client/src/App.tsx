import { useState, useEffect, useCallback } from "react";
import { Shell } from "./components/layout/Shell.js";
import { TopBar, type ViewType } from "./components/layout/TopBar.js";
import { useTheme } from "./hooks/useTheme.js";
import { InstanceHealth } from "./components/panels/InstanceHealth.js";
import { ProcessMonitor } from "./components/panels/ProcessMonitor.js";
import { ActiveSessions } from "./components/panels/ActiveSessions.js";
import { AgentConfig } from "./components/panels/AgentConfig.js";
import { OllamaModels } from "./components/panels/OllamaModels.js";
import { AuditPanel } from "./components/panels/AuditPanel.js";
import { GitPanel } from "./components/panels/GitPanel.js";
import { TaskScheduler } from "./components/scheduler/TaskScheduler.js";
import { DeterminismAudit } from "./components/determinism/DeterminismAudit.js";
import { CostDashboard } from "./components/cost/CostDashboard.js";
import { ConfirmDialog } from "./components/shared/ConfirmDialog.js";
import { api } from "./api/client.js";
import styles from "./App.module.css";

export function App() {
  const [activeInstance, setActiveInstance] = useState("all");
  const [instances, setInstances] = useState<{ id: string; name: string }[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [emergencyConfirm, setEmergencyConfirm] = useState(false);
  const [view, setView] = useState<ViewType>("dashboard");
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    api.instances().then((res) => {
      if (res.ok && res.data?.instances) {
        setInstances(res.data.instances.map((i: any) => ({ id: i.id, name: i.name })));
      }
    });
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setLastRefresh(new Date());
  }, []);

  const handleEmergencyStop = async () => {
    await api.emergencyStop();
    setEmergencyConfirm(false);
    handleRefresh();
  };

  // Keyboard shortcuts: R=refresh, T=toggle theme
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "r") handleRefresh();
      if (e.key === "t") toggleTheme();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleRefresh, toggleTheme]);

  const sidebar = (
    <div className={styles.sidebar}>
      <div className={styles.navGroup}>
        <button
          className={`${styles.iconBtn} ${view === "dashboard" ? styles.iconBtnActive : ""}`}
          onClick={() => setView("dashboard")}
          title="Dashboard"
        >
          #
        </button>
        <button
          className={`${styles.iconBtn} ${view === "cost" ? styles.iconBtnActive : ""}`}
          onClick={() => setView("cost")}
          title="Cost"
        >
          $
        </button>
        <button
          className={`${styles.iconBtn} ${view === "scheduler" ? styles.iconBtnActive : ""}`}
          onClick={() => setView("scheduler")}
          title="Task Scheduler"
        >
          &gt;
        </button>
        <button
          className={`${styles.iconBtn} ${view === "determinism" ? styles.iconBtnActive : ""}`}
          onClick={() => setView("determinism")}
          title="Determinism Audit"
        >
          ?
        </button>
      </div>

      <div className={styles.sidebarSpacer} />

      <div className={styles.navGroup}>
        <button
          className={styles.iconBtn}
          onClick={handleRefresh}
          title="Refresh (R)"
        >
          R
        </button>
        <button
          className={`${styles.iconBtn} ${styles.dangerBtn}`}
          onClick={() => setEmergencyConfirm(true)}
          title="Emergency Stop"
        >
          !
        </button>
        <button
          className={styles.iconBtn}
          onClick={toggleTheme}
          title="Toggle Theme (T)"
        >
          {theme === "dark" ? "L" : "D"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <Shell
        topBar={
          <TopBar
            instances={instances}
            activeInstance={activeInstance}
            onInstanceChange={setActiveInstance}
            onRefresh={handleRefresh}
            lastRefresh={lastRefresh}
            theme={theme}
            onToggleTheme={toggleTheme}
            activeView={view}
            onViewChange={setView}
          />
        }
        sidebar={sidebar}
      >
        {view === "dashboard" ? (
          <>
            <AuditPanel key={`audit-${refreshKey}`} />
            <InstanceHealth key={`health-${refreshKey}`} />
            <GitPanel key={`git-${refreshKey}`} />
            <ProcessMonitor key={`proc-${refreshKey}`} />
            <ActiveSessions key={`sessions-${refreshKey}`} />
            <AgentConfig key={`agents-${refreshKey}`} />
            <OllamaModels key={`ollama-${refreshKey}`} />
          </>
        ) : view === "cost" ? (
          <CostDashboard key={`cost-${refreshKey}`} />
        ) : view === "scheduler" ? (
          <TaskScheduler key={`scheduler-${refreshKey}`} />
        ) : (
          <DeterminismAudit key={`determinism-${refreshKey}`} />
        )}
      </Shell>

      <ConfirmDialog
        open={emergencyConfirm}
        title="Emergency Stop"
        message="This will send SIGTERM to ALL OpenClaw processes. Are you sure?"
        onConfirm={handleEmergencyStop}
        onCancel={() => setEmergencyConfirm(false)}
        confirmLabel="Stop All"
        danger
      />
    </>
  );
}
