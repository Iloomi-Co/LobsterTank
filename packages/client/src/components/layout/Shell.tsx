import { type ReactNode } from "react";
import styles from "./Shell.module.css";

interface ShellProps {
  topBar: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
}

export function Shell({ topBar, sidebar, children }: ShellProps) {
  return (
    <div className={styles.shell}>
      {topBar}
      <div className={styles.body}>
        <aside className={styles.sidebar}>{sidebar}</aside>
        <main className={styles.grid}>{children}</main>
      </div>
    </div>
  );
}
