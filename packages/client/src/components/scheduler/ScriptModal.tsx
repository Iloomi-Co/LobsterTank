import { useState, useEffect } from "react";
import { LogViewer } from "../shared/LogViewer.js";
import { api } from "../../api/client.js";
import styles from "./ScriptModal.module.css";

interface ScriptModalProps {
  scriptName: string;
  schedule: string;
  description: string;
  command: string;
  onClose: () => void;
}

export function ScriptModal({ scriptName, schedule, description, command, onClose }: ScriptModalProps) {
  const [content, setContent] = useState<string | null>(null);
  const [scriptPath, setScriptPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.schedulerScript(scriptName).then((res) => {
      if (res.ok && res.data) {
        setContent(res.data.content);
        setScriptPath(res.data.path);
      } else {
        setContent("# Failed to load script");
      }
      setLoading(false);
    });
  }, [scriptName]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>{scriptName}</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            Close
          </button>
        </div>
        <div className={styles.meta}>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Schedule:</span>
            <code className={styles.metaValue}>{schedule}</code>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Description:</span>
            <span className={styles.metaValue}>{description}</span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Command:</span>
            <code className={styles.metaValue}>{command}</code>
          </div>
          {scriptPath && (
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Path:</span>
              <code className={styles.metaValue}>{scriptPath}</code>
            </div>
          )}
        </div>
        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>Loading script...</div>
          ) : (
            <LogViewer content={content ?? ""} maxLines={500} />
          )}
        </div>
      </div>
    </div>
  );
}
