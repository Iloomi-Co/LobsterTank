import styles from "./StatusDot.module.css";

interface StatusDotProps {
  status: "online" | "offline" | "warning" | "unknown";
  label?: string;
  pulse?: boolean;
}

export function StatusDot({ status, label, pulse = false }: StatusDotProps) {
  return (
    <span className={styles.wrapper}>
      <span
        className={`${styles.dot} ${styles[status]} ${pulse ? styles.pulse : ""}`}
      />
      {label && <span className={styles.label}>{label}</span>}
    </span>
  );
}
