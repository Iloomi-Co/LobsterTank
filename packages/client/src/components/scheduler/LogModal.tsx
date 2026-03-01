import { useState, useEffect } from "react";
import { LogViewer } from "../shared/LogViewer.js";
import { api } from "../../api/client.js";
import styles from "./LogModal.module.css";

interface LogModalProps {
  scriptName: string;
  onClose: () => void;
}

export function LogModal({ scriptName, onClose }: LogModalProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.schedulerLogs(scriptName).then((res) => {
      setContent(res.ok && res.data ? res.data.content : "Failed to load logs");
      setLoading(false);
    });
  }, [scriptName]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Logs: {scriptName}</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            Close
          </button>
        </div>
        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>Loading logs...</div>
          ) : (
            <LogViewer content={content ?? ""} maxLines={50} />
          )}
        </div>
      </div>
    </div>
  );
}
