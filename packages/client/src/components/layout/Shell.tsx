import { type ReactNode } from "react";
import styles from "./Shell.module.css";

interface ShellProps {
  topBar: ReactNode;
  children: ReactNode;
}

export function Shell({ topBar, children }: ShellProps) {
  return (
    <div className={styles.shell}>
      <div className={styles.page}>
        {topBar}
        <main className={styles.grid}>{children}</main>
      </div>
    </div>
  );
}
