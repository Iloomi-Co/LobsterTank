import { useCallback } from "react";
import styles from "./TopBar.module.css";

export type ViewType = "dashboard" | "scheduler" | "determinism";

interface TopBarProps {
  instances: { id: string; name: string }[];
  activeInstance: string;
  onInstanceChange: (id: string) => void;
  onRefresh: () => void;
  lastRefresh: Date | null;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
}

export function TopBar({
  instances,
  activeInstance,
  onInstanceChange,
  onRefresh,
  lastRefresh,
  theme,
  onToggleTheme,
  activeView,
  onViewChange,
}: TopBarProps) {
  const formatTime = useCallback((d: Date | null) => {
    if (!d) return "--:--:--";
    return d.toLocaleTimeString();
  }, []);

  return (
    <header className={styles.topBar}>
      <div className={styles.left}>
        <span className={styles.logo}>LobsterTank</span>
        <span className={styles.subtitle}>OpenClaw Control Plane</span>
      </div>
      <nav className={styles.nav}>
        <button
          className={`${styles.navTab} ${activeView === "dashboard" ? styles.navActive : ""}`}
          onClick={() => onViewChange("dashboard")}
        >
          Dashboard
        </button>
        <button
          className={`${styles.navTab} ${activeView === "scheduler" ? styles.navActive : ""}`}
          onClick={() => onViewChange("scheduler")}
        >
          Task Scheduler
        </button>
        <button
          className={`${styles.navTab} ${activeView === "determinism" ? styles.navActive : ""}`}
          onClick={() => onViewChange("determinism")}
        >
          Determinism Audit
        </button>
      </nav>
      {activeView === "dashboard" && (
        <div className={styles.center}>
          <button
            className={`${styles.tab} ${activeInstance === "all" ? styles.active : ""}`}
            onClick={() => onInstanceChange("all")}
          >
            All
          </button>
          {instances.map((inst) => (
            <button
              key={inst.id}
              className={`${styles.tab} ${activeInstance === inst.id ? styles.active : ""}`}
              onClick={() => onInstanceChange(inst.id)}
            >
              {inst.name}
            </button>
          ))}
        </div>
      )}
      <div className={styles.right}>
        <span className={styles.timestamp}>{formatTime(lastRefresh)}</span>
        <button className={styles.themeBtn} onClick={onToggleTheme} title="Toggle theme (T)">
          {theme === "dark" ? "Light" : "Dark"}
        </button>
        <button className={styles.refreshBtn} onClick={onRefresh} title="Refresh (R)">
          Refresh
        </button>
      </div>
    </header>
  );
}
