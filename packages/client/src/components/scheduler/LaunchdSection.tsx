import { useState } from "react";
import { DataTable } from "../shared/DataTable.js";
import { Badge } from "../shared/Badge.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.js";
import styles from "./LaunchdSection.module.css";

interface LaunchdEntry {
  label: string;
  pid: number | null;
  status: number;
  plistPath?: string;
  classification: "protected" | "rogue" | "unknown";
}

interface LaunchdSectionProps {
  entries: LaunchdEntry[];
  breadcrumbExists: boolean;
  onRemove: (label: string) => void;
}

export function LaunchdSection({ entries, breadcrumbExists, onRemove }: LaunchdSectionProps) {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const hasRogue = entries.some((e) => e.classification === "rogue" || e.classification === "unknown");
  const gatewayOnly = !hasRogue && entries.length > 0;

  const columns = [
    {
      key: "label",
      header: "Label",
      render: (e: LaunchdEntry) => <span>{e.label}</span>,
    },
    {
      key: "pid",
      header: "PID",
      width: "70px",
      render: (e: LaunchdEntry) => <span>{e.pid ?? "--"}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "80px",
      render: (e: LaunchdEntry) => (
        <Badge
          label={e.classification}
          variant={e.classification === "protected" ? "green" : e.classification === "rogue" ? "red" : "yellow"}
        />
      ),
    },
    {
      key: "actions",
      header: "",
      width: "80px",
      render: (e: LaunchdEntry) =>
        e.classification === "protected" ? (
          <span className={styles.protectedLabel}>protected</span>
        ) : (
          <button className={styles.removeBtn} onClick={() => setConfirmRemove(e.label)}>
            Remove
          </button>
        ),
    },
  ];

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>
          Launchd Services
          {gatewayOnly ? (
            <Badge label="Gateway only" variant="green" />
          ) : hasRogue ? (
            <Badge label="Rogue found" variant="red" />
          ) : (
            <Badge label="None" variant="default" />
          )}
        </div>
      </div>
      <div className={styles.body}>
        {entries.length > 0 ? (
          <DataTable columns={columns} data={entries} rowKey={(e) => e.label} compact />
        ) : (
          <span style={{ color: "var(--text-muted)", fontSize: "var(--font-size-sm)" }}>
            No OC-related launchd services found
          </span>
        )}
        {breadcrumbExists && (
          <div className={styles.breadcrumb}>
            A rogue service was previously blocked. See ~/.openclaw/ROGUE_SERVICE_BLOCKED.md
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmRemove}
        title="Remove Launchd Service"
        message={`Remove launchd service "${confirmRemove}"? This will unload it and delete its plist.`}
        onConfirm={() => {
          if (confirmRemove) onRemove(confirmRemove);
          setConfirmRemove(null);
        }}
        onCancel={() => setConfirmRemove(null)}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}
