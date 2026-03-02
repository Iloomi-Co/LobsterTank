import { useState, useCallback } from "react";
import { usePolling } from "../../hooks/usePolling.js";
import { api } from "../../api/client.js";
import { CrontabSection } from "./CrontabSection.js";
import { OcCronSection } from "./OcCronSection.js";
import { LaunchdSection } from "./LaunchdSection.js";
import { LogModal } from "./LogModal.js";
import { ScriptModal } from "./ScriptModal.js";
import { CrontabEditor } from "./CrontabEditor.js";
import styles from "./TaskScheduler.module.css";

interface SchedulerState {
  crontab: {
    entries: {
      lineIndex: number;
      schedule: string;
      command: string;
      script: string;
      description: string;
      logFile: string | null;
      lastRun: string | null;
      status: "active" | "paused" | "missing";
    }[];
    pathLine: string | null;
    raw: string;
  };
  ocCrons: {
    entries: { id: string; schedule: string; command: string; label?: string }[];
    isEmpty: boolean;
  };
  launchd: {
    entries: {
      label: string;
      pid: number | null;
      status: number;
      plistPath?: string;
      classification: "protected" | "rogue" | "unknown";
    }[];
    breadcrumbExists: boolean;
  };
}

export function TaskScheduler() {
  const fetcher = useCallback(() => api.scheduler(), []);
  const { data, error, loading, refresh } = usePolling<SchedulerState>({ fetcher, interval: 30000 });

  const [logModal, setLogModal] = useState<string | null>(null);
  const [scriptModal, setScriptModal] = useState<{
    script: string;
    schedule: string;
    description: string;
    command: string;
  } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const handleToggleCron = async (lineIndex: number, enabled: boolean) => {
    await api.schedulerToggleCron(lineIndex, enabled);
    refresh();
  };

  const handleRemoveOcCron = async (id: string) => {
    await api.schedulerRemoveOcCron(id);
    refresh();
  };

  const handleRemoveAllOcCrons = async () => {
    await api.schedulerRemoveAllOcCrons();
    refresh();
  };

  const handleRemoveLaunchd = async (label: string) => {
    await api.schedulerRemoveLaunchd(label);
    refresh();
  };

  const handleEditorSave = () => {
    setEditorOpen(false);
    refresh();
  };

  if (loading && !data) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading scheduler state...</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Task Scheduler</span>
        <span className={styles.headerMeta}>
          {data.crontab.entries.length} crontab entries &middot;{" "}
          {data.ocCrons.entries.length} OC crons &middot;{" "}
          {data.launchd.entries.length} launchd services
        </span>
      </div>

      <CrontabSection
        entries={data.crontab.entries}
        pathLine={data.crontab.pathLine}
        onToggle={handleToggleCron}
        onViewLogs={setLogModal}
        onViewScript={(entry) => setScriptModal({
          script: entry.script,
          schedule: entry.schedule,
          description: entry.description,
          command: entry.command,
        })}
        onEditCrontab={() => setEditorOpen(true)}
      />

      <OcCronSection
        entries={data.ocCrons.entries}
        isEmpty={data.ocCrons.isEmpty}
        onRemove={handleRemoveOcCron}
        onRemoveAll={handleRemoveAllOcCrons}
      />

      <LaunchdSection
        entries={data.launchd.entries}
        breadcrumbExists={data.launchd.breadcrumbExists}
        onRemove={handleRemoveLaunchd}
      />

      {logModal && (
        <LogModal scriptName={logModal} onClose={() => setLogModal(null)} />
      )}

      {scriptModal && (
        <ScriptModal
          scriptName={scriptModal.script}
          schedule={scriptModal.schedule}
          description={scriptModal.description}
          command={scriptModal.command}
          onClose={() => setScriptModal(null)}
        />
      )}

      {editorOpen && (
        <CrontabEditor
          initialContent={data.crontab.raw}
          onSave={handleEditorSave}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}
