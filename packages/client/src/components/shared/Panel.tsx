import { type ReactNode } from "react";
import styles from "./Panel.module.css";

interface PanelProps {
  title: string;
  icon?: string;
  children: ReactNode;
  loading?: boolean;
  error?: string | null;
  actions?: ReactNode;
  span?: 1 | 2;
}

export function Panel({ title, icon, children, loading, error, actions, span = 1 }: PanelProps) {
  return (
    <div className={`${styles.panel} ${span === 2 ? styles.span2 : ""}`}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          {icon && <span className={styles.icon}>{icon}</span>}
          <h3 className={styles.title}>{title}</h3>
          {loading && <span className={styles.spinner} />}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      <div className={styles.body}>
        {error ? (
          <div className={styles.error}>{error}</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
