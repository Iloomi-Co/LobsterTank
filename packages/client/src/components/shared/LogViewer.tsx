import styles from "./LogViewer.module.css";

interface LogViewerProps {
  content: string;
  maxLines?: number;
}

export function LogViewer({ content, maxLines = 100 }: LogViewerProps) {
  const lines = content.split("\n").slice(-maxLines);

  return (
    <pre className={styles.viewer}>
      {lines.map((line, i) => (
        <div key={i} className={styles.line}>
          <span className={styles.lineNum}>{i + 1}</span>
          <span className={styles.lineContent}>{line}</span>
        </div>
      ))}
    </pre>
  );
}
