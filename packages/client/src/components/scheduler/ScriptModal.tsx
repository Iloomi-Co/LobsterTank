import { useState, useEffect, useCallback } from "react";
import { LogViewer } from "../shared/LogViewer.js";
import { api } from "../../api/client.js";
import { ScheduleEditor } from "./ScheduleEditor.js";
import { FeedbackPanel } from "./FeedbackPanel.js";
import { PromptTuner } from "./PromptTuner.js";
import { FeedbackHistory } from "./FeedbackHistory.js";
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

  const [prompts, setPrompts] = useState<any[]>([]);
  const [feedbackEntries, setFeedbackEntries] = useState<any[]>([]);
  const [lastOutputSnippet, setLastOutputSnippet] = useState<string | null>(null);
  const [tunerSuggestion, setTunerSuggestion] = useState<string | null>(null);
  const [tunerHeredocId, setTunerHeredocId] = useState<string | undefined>(undefined);
  const [tunerLastOutput, setTunerLastOutput] = useState<string | undefined>(undefined);
  const [lastFeedbackId, setLastFeedbackId] = useState<string | undefined>(undefined);

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

  const loadFeedback = useCallback(async () => {
    const res = await api.schedulerFeedback(scriptName);
    if (res.ok && res.data) {
      setFeedbackEntries(res.data);
    }
  }, [scriptName]);

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

    api.schedulerPrompts(scriptName).then((res) => {
      if (res.ok && res.data) {
        setPrompts(res.data.prompts);
      }
    });

    // Fetch last run output for feedback context
    api.schedulerLogs(scriptName).then((res) => {
      if (res.ok && res.data && res.data.content) {
        // Take last ~2000 chars as the snippet
        const full = res.data.content;
        setLastOutputSnippet(full.length > 2000 ? full.slice(-2000) : full);
      }
    });

    loadFeedback();
  }, [scriptName, loadFeedback]);

  const handleFeedbackSubmitted = async () => {
    const res = await api.schedulerFeedback(scriptName);
    if (res.ok && res.data && res.data.length > 0) {
      setFeedbackEntries(res.data);
      setLastFeedbackId(res.data[res.data.length - 1].id);
    }
  };

  const handleRewriteRequested = (suggestion: string, heredocId?: string, lastOutput?: string) => {
    setTunerSuggestion(suggestion);
    setTunerHeredocId(heredocId);
    setTunerLastOutput(lastOutput);
  };

  const handleTunerDone = () => {
    // Reload script content and feedback
    api.schedulerScript(scriptName).then((res) => {
      if (res.ok && res.data) {
        setContent(res.data.content);
      }
    });
    loadFeedback();
  };

  const handleTunerClose = () => {
    setTunerSuggestion(null);
    setTunerHeredocId(undefined);
    setTunerLastOutput(undefined);
  };

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

        {!loading && (
          <>
            <FeedbackPanel
              scriptName={scriptName}
              prompts={prompts}
              lastOutputSnippet={lastOutputSnippet}
              onFeedbackSubmitted={handleFeedbackSubmitted}
              onRewriteRequested={handleRewriteRequested}
            />

            {tunerSuggestion && (
              <PromptTuner
                scriptName={scriptName}
                suggestion={tunerSuggestion}
                heredocId={tunerHeredocId}
                feedbackId={lastFeedbackId}
                lastOutput={tunerLastOutput}
                onDone={handleTunerDone}
                onClose={handleTunerClose}
              />
            )}

            <FeedbackHistory
              scriptName={scriptName}
              entries={feedbackEntries}
              onReverted={handleTunerDone}
            />
          </>
        )}
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
