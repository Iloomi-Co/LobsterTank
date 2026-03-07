import { useCallback } from "react";
import styles from "./TopBar.module.css";

export type ViewType = "dashboard" | "cost" | "scheduler" | "determinism";

const VIEW_PATHS: Record<ViewType, string> = {
  dashboard: "/",
  cost: "/cost",
  scheduler: "/scheduler",
  determinism: "/determinism",
};

const PATH_VIEWS: Record<string, ViewType> = Object.fromEntries(
  Object.entries(VIEW_PATHS).map(([v, p]) => [p, v as ViewType])
);

export function viewFromPath(pathname: string): ViewType {
  return PATH_VIEWS[pathname] ?? "dashboard";
}

export function pathFromView(view: ViewType): string {
  return VIEW_PATHS[view];
}

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
    if (!d) return "";
    return d.toLocaleTimeString();
  }, []);

  return (
    <header className={styles.topBar}>
      <div className={styles.left}>
        <span className={styles.logo}>LobsterTank</span>
      </div>
      <nav className={styles.nav}>
        <button
          className={`${styles.navTab} ${activeView === "dashboard" ? styles.navActive : ""}`}
          onClick={() => onViewChange("dashboard")}
        >
          Dashboard
        </button>
        <button
          className={`${styles.navTab} ${activeView === "cost" ? styles.navActive : ""}`}
          onClick={() => onViewChange("cost")}
        >
          Cost
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
      <div className={styles.right}>
        <span className={styles.timestamp}>{formatTime(lastRefresh)}</span>
        <button className={styles.themeBtn} onClick={onToggleTheme} title="Toggle theme (T)">
          <span className={`${styles.themeIcon} ${theme === "light" ? styles.themeIconActive : ""}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          </span>
          <span className={`${styles.themeIcon} ${theme === "dark" ? styles.themeIconActive : ""}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </span>
        </button>
        <button className={styles.refreshBtn} onClick={onRefresh} title="Refresh (R)">
          Refresh
        </button>
      </div>
    </header>
  );
}
