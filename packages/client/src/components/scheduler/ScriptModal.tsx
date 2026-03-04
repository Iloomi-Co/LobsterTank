import { useState, useEffect } from "react";
import { LogViewer } from "../shared/LogViewer.js";
import { api } from "../../api/client.js";
import { ScheduleEditor } from "./ScheduleEditor.js";
import styles from "./ScriptModal.module.css";

interface ScriptModalProps {
  scriptName: string;
  schedule: string;
  description: string;
  command: string;
  lineIndex: number;
  onScheduleUpdated: () => void;
  onClose: () => void;
}

export function ScriptModal({ scriptName, schedule, description, command, lineIndex, onScheduleUpdated, onClose }: ScriptModalProps) {
  const [content, setContent] = useState<string | null>(null);
  const [scriptPath, setScriptPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* no clipboard access */ }
  };

  const handleOpenInVSCode = () => {
    if (!scriptPath) return;
    window.open(`vscode://file${scriptPath}`, "_blank");
  };

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
          <div className={styles.headerActions}>
            <button className={styles.changeScheduleBtn} onClick={() => setEditorOpen(true)}>
              Change Schedule
            </button>
            <button className={styles.closeBtn} onClick={onClose}>
              Close
            </button>
          </div>
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
        <div className={styles.contentHeader}>
          <span className={styles.contentLabel}>Script</span>
          <div className={styles.contentActions}>
            {scriptPath && (
              <button className={styles.actionBtn} onClick={handleOpenInVSCode}>
                Open in VS Code
              </button>
            )}
            <button className={styles.actionBtn} onClick={handleCopy} disabled={!content}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>Loading script...</div>
          ) : (
            <LogViewer content={content ?? ""} maxLines={500} />
          )}
        </div>
      </div>

      {editorOpen && (
        <ScheduleEditor
          currentSchedule={schedule}
          lineIndex={lineIndex}
          onSave={() => {
            setEditorOpen(false);
            onScheduleUpdated();
          }}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}
