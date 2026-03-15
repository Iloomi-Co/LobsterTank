import { useState, useEffect, useCallback } from "react";
import { Shell } from "./components/layout/Shell.js";
import { TopBar, type ViewType, type ProfileInfo, viewFromPath, pathFromView, profileFromPath } from "./components/layout/TopBar.js";
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
import { GitPanel } from "./components/panels/GitPanel.js";
import { TaskScheduler } from "./components/scheduler/TaskScheduler.js";
import { DeterminismAudit } from "./components/determinism/DeterminismAudit.js";
import { CostDashboard } from "./components/cost/CostDashboard.js";
import { AboutPage } from "./components/about/AboutPage.js";
import { MemoryDashboard } from "./components/memory/MemoryDashboard.js";
import { ConfirmDialog } from "./components/shared/ConfirmDialog.js";
import { getProfileSlug, profileNameToSlug } from "./api/client.js";
import { api } from "./api/client.js";
import styles from "./App.module.css";

export function App() {
  const [activeInstance, setActiveInstance] = useState("all");
  const [instances, setInstances] = useState<{ id: string; name: string }[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [emergencyConfirm, setEmergencyConfirm] = useState(false);
  const [view, setView] = useState<ViewType>(() => viewFromPath(window.location.pathname));
  const [profileSlug, setProfileSlug] = useState(() => profileFromPath(window.location.pathname));
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);

  // Redirect bare "/" to "/${defaultProfile}/"
  useEffect(() => {
    const path = window.location.pathname;
    if (path === "/" || !path.split("/").filter(Boolean)[0]?.startsWith("openclaw")) {
      // Fetch profiles to find the default, then redirect
      api.profiles().then((res) => {
        if (res.ok && res.data?.profiles) {
          setProfiles(res.data.profiles);
          const defaultSlug = res.data.profiles[0]?.slug ?? "openclaw";
          history.replaceState(null, "", `/${defaultSlug}/`);
          setProfileSlug(defaultSlug);
          setView("dashboard");
        }
      });
    } else {
      // Load profiles list
      api.profiles().then((res) => {
        if (res.ok && res.data?.profiles) {
          setProfiles(res.data.profiles);
        }
      });
    }
  }, []);

  const navigateTo = useCallback((v: ViewType) => {
    setView(v);
    const path = pathFromView(v, profileSlug);
    if (window.location.pathname !== path) {
      history.pushState(null, "", path);
    }
  }, [profileSlug]);

  const handleProfileChange = useCallback((newSlug: string) => {
    setProfileSlug(newSlug);
    // Navigate to same view but under new profile
    const currentView = view;
    const path = pathFromView(currentView, newSlug);
    history.pushState(null, "", path);
    // Force remount of all components
    setRefreshKey((k) => k + 1);
    setLastRefresh(new Date());
  }, [view]);

  useEffect(() => {
    const onPopState = () => {
      setView(viewFromPath(window.location.pathname));
      setProfileSlug(profileFromPath(window.location.pathname));
      setRefreshKey((k) => k + 1);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    api.instances().then((res) => {
      if (res.ok && res.data?.instances) {
        setInstances(res.data.instances.map((i: any) => ({ id: i.id, name: i.name })));
      }
    });
  }, [profileSlug, refreshKey]);

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
            onViewChange={navigateTo}
            profiles={profiles}
            activeProfile={profileSlug}
            onProfileChange={handleProfileChange}
          />
        }
      >
        {view === "about" ? (
          <AboutPage onNavigate={navigateTo} />
        ) : view === "dashboard" ? (
          <>
            <WelcomeRow key={`welcome-${profileSlug}-${refreshKey}`} />
            <StatsRow key={`stats-${profileSlug}-${refreshKey}`} />
            <IdentityCard key={`identity-${profileSlug}-${refreshKey}`} />
            <AgentCarousel key={`agents-${profileSlug}-${refreshKey}`} />
            <TokensByModel key={`tokens-${profileSlug}-${refreshKey}`} />
            <WeeklyCostChart key={`weekly-cost-${profileSlug}-${refreshKey}`} />
            <InstanceHealth key={`health-${profileSlug}-${refreshKey}`} />
            <GitPanel key={`git-${profileSlug}-${refreshKey}`} />
            <ProcessMonitor key={`proc-${profileSlug}-${refreshKey}`} />
            <ActiveSessions key={`sessions-${profileSlug}-${refreshKey}`} />
          </>
        ) : view === "cost" ? (
          <CostDashboard key={`cost-${profileSlug}-${refreshKey}`} />
        ) : view === "scheduler" ? (
          <TaskScheduler key={`scheduler-${profileSlug}-${refreshKey}`} />
        ) : view === "memory" ? (
          <MemoryDashboard key={`memory-${profileSlug}-${refreshKey}`} />
        ) : (
          <DeterminismAudit key={`determinism-${profileSlug}-${refreshKey}`} />
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
