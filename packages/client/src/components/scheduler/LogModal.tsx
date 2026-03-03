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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.schedulerLogs(scriptName).then((res) => {
      setContent(res.ok && res.data ? res.data.content : "Failed to load logs");
      setLoading(false);
    });
  }, [scriptName]);

  const reversed = content
    ? content.split("\n").filter(Boolean).reverse().join("\n")
    : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(reversed).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Logs: {scriptName}</h3>
          <div className={styles.headerActions}>
            {!loading && content && (
              <button className={styles.copyBtn} onClick={handleCopy}>
                {copied ? "Copied" : "Copy"}
              </button>
            )}
            <button className={styles.closeBtn} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>Loading logs...</div>
          ) : (
            <LogViewer content={reversed} maxLines={50} />
          )}
        </div>
      </div>
    </div>
  );
}
