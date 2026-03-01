import { useState, useEffect, useCallback } from "react";
import { Shell } from "./components/layout/Shell.js";
import { TopBar, type ViewType } from "./components/layout/TopBar.js";
import { useTheme } from "./hooks/useTheme.js";
import { InstanceHealth } from "./components/panels/InstanceHealth.js";
import { ProcessMonitor } from "./components/panels/ProcessMonitor.js";
import { SpendMonitor } from "./components/panels/SpendMonitor.js";
import { ActiveSessions } from "./components/panels/ActiveSessions.js";
import { AgentConfig } from "./components/panels/AgentConfig.js";
import { OllamaModels } from "./components/panels/OllamaModels.js";
import { AuditPanel } from "./components/panels/AuditPanel.js";
import { GitPanel } from "./components/panels/GitPanel.js";
import { TaskScheduler } from "./components/scheduler/TaskScheduler.js";
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
      <div className={styles.sidebarSection}>
        <h4 className={styles.sidebarTitle}>Quick Actions</h4>
        <button className={styles.actionBtn} onClick={handleRefresh}>
          Refresh All
        </button>
        <button
          className={`${styles.actionBtn} ${styles.dangerBtn}`}
          onClick={() => setEmergencyConfirm(true)}
        >
          Emergency Stop
        </button>
      </div>
      <div className={styles.sidebarSection}>
        <h4 className={styles.sidebarTitle}>Keyboard</h4>
        <div className={styles.shortcut}>
          <kbd className={styles.key}>R</kbd>
          <span>Refresh</span>
        </div>
        <div className={styles.shortcut}>
          <kbd className={styles.key}>T</kbd>
          <span>Theme</span>
        </div>
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
            <SpendMonitor key={`spend-${refreshKey}`} />
            <GitPanel key={`git-${refreshKey}`} />
            <ProcessMonitor key={`proc-${refreshKey}`} />
            <ActiveSessions key={`sessions-${refreshKey}`} />
            <AgentConfig key={`agents-${refreshKey}`} />
            <OllamaModels key={`ollama-${refreshKey}`} />
          </>
        ) : (
          <TaskScheduler key={`scheduler-${refreshKey}`} />
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
