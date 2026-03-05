import { useState, useEffect, useCallback } from "react";
import { Shell } from "./components/layout/Shell.js";
import { TopBar, type ViewType } from "./components/layout/TopBar.js";
import { WelcomeRow } from "./components/layout/WelcomeRow.js";
import { StatsRow } from "./components/layout/StatsRow.js";
import { useTheme } from "./hooks/useTheme.js";
import { InstanceHealth } from "./components/panels/InstanceHealth.js";
import { ProcessMonitor } from "./components/panels/ProcessMonitor.js";
import { ActiveSessions } from "./components/panels/ActiveSessions.js";
import { AgentCarousel } from "./components/panels/AgentCarousel.js";
import { TokensByModel } from "./components/panels/TokensByModel.js";
import { WeeklyCostChart } from "./components/panels/WeeklyCostChart.js";
import { IdentityCard } from "./components/panels/IdentityCard.js";
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
      >
        {view === "dashboard" ? (
          <>
            <WelcomeRow />
            <StatsRow />
            <IdentityCard />
            <AgentCarousel key={`agents-${refreshKey}`} />
            <TokensByModel key={`tokens-${refreshKey}`} />
            <WeeklyCostChart key={`weekly-cost-${refreshKey}`} />
            <AuditPanel key={`audit-${refreshKey}`} />
            <InstanceHealth key={`health-${refreshKey}`} />
            <GitPanel key={`git-${refreshKey}`} />
            <ProcessMonitor key={`proc-${refreshKey}`} />
            <ActiveSessions key={`sessions-${refreshKey}`} />
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
