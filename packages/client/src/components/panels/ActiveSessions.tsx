import { useCallback, useState } from "react";
import { Panel } from "../shared/Panel.js";
import { DataTable } from "../shared/DataTable.js";
import { Badge } from "../shared/Badge.js";
import { EmptyState } from "../shared/EmptyState.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.js";
import { usePolling } from "../../hooks/usePolling.js";
import { api } from "../../api/client.js";

export function ActiveSessions() {
  const fetcher = useCallback(() => api.sessions(), []);
  const { data, error, loading, refresh } = usePolling({ fetcher, delay: 800 });
  const [cleanupTarget, setCleanupTarget] = useState<{ id: string; agent: string } | null>(null);

  const handleCleanup = async () => {
    if (!cleanupTarget) return;
    await api.cleanupSession(cleanupTarget.id, cleanupTarget.agent);
    setCleanupTarget(null);
    refresh();
  };

  const formatRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const columns = [
    { key: "agent", header: "Agent", render: (s: any) => <Badge label={s.agent} variant="blue" />, width: "100px" },
    { key: "id", header: "Session", render: (s: any) => (
      <span style={{ fontSize: "var(--font-size-xs)" }}>{s.id.slice(0, 12)}...</span>
    )},
    { key: "lastActivity", header: "Last Activity", render: (s: any) => formatRelative(s.lastActivity), width: "100px" },
    { key: "status", header: "Status", render: (s: any) => (
      <Badge label={s.isStale ? "stale" : "active"} variant={s.isStale ? "yellow" : "green"} />
    ), width: "80px" },
    { key: "actions", header: "", render: (s: any) => s.isStale ? (
      <button
        style={{ padding: "2px 8px", background: "var(--yellow-dim)", color: "var(--yellow)", borderRadius: "4px", fontSize: "var(--font-size-xs)" }}
        onClick={() => setCleanupTarget({ id: s.id, agent: s.agent })}
      >
        Clean
      </button>
    ) : null, width: "60px" },
  ];

  return (
    <Panel title="Active Sessions" icon="[S]" loading={loading} error={error}>
      {data && data.length > 0 ? (
        <DataTable columns={columns} data={data} rowKey={(s: any) => s.id} compact />
      ) : (
        <EmptyState message="No active sessions" />
      )}

      <ConfirmDialog
        open={!!cleanupTarget}
        title="Cleanup Session"
        message={`Remove stale session ${cleanupTarget?.id?.slice(0, 12)}... from agent "${cleanupTarget?.agent}"?`}
        onConfirm={handleCleanup}
        onCancel={() => setCleanupTarget(null)}
        confirmLabel="Clean Up"
      />
    </Panel>
  );
}
