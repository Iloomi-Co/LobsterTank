import { useCallback, useState } from "react";
import { Panel } from "../shared/Panel.js";
import { DataTable } from "../shared/DataTable.js";
import { EmptyState } from "../shared/EmptyState.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.js";
import { usePolling } from "../../hooks/usePolling.js";
import { api } from "../../api/client.js";
import styles from "./ProcessMonitor.module.css";

export function ProcessMonitor() {
  const fetcher = useCallback(() => api.processes(), []);
  const { data, error, loading, refresh } = usePolling({ fetcher, delay: 200 });
  const [killTarget, setKillTarget] = useState<{ pid: number; command: string } | null>(null);

  const handleKill = async () => {
    if (!killTarget) return;
    await api.killProcess(killTarget.pid);
    setKillTarget(null);
    refresh();
  };

  const columns = [
    { key: "pid", header: "PID", render: (p: any) => <span className={styles.pid}>{p.pid}</span>, width: "70px" },
    { key: "cpu", header: "CPU%", render: (p: any) => <span>{p.cpu.toFixed(1)}</span>, width: "60px" },
    { key: "mem", header: "MEM%", render: (p: any) => <span>{p.mem.toFixed(1)}</span>, width: "60px" },
    { key: "command", header: "Command", render: (p: any) => (
      <span className={`${styles.command} ${p.isRogue ? styles.rogue : ""}`}>
        {p.command.length > 60 ? p.command.slice(0, 60) + "..." : p.command}
      </span>
    )},
    { key: "actions", header: "", render: (p: any) => (
      <button className={styles.killBtn} onClick={() => setKillTarget({ pid: p.pid, command: p.command })}>
        Kill
      </button>
    ), width: "50px" },
  ];

  return (
    <Panel title="Process Monitor" icon="[P]" loading={loading} error={error}>
      {data && data.length > 0 ? (
        <DataTable columns={columns} data={data} rowKey={(p: any) => String(p.pid)} compact />
      ) : (
        <EmptyState message="No OpenClaw processes detected" />
      )}

      <ConfirmDialog
        open={!!killTarget}
        title="Kill Process"
        message={`Send SIGTERM to PID ${killTarget?.pid}?\n\n${killTarget?.command}`}
        onConfirm={handleKill}
        onCancel={() => setKillTarget(null)}
        confirmLabel="Kill"
        danger
      />
    </Panel>
  );
}
