import { useState } from "react";
import { DataTable } from "../shared/DataTable.js";
import { Badge } from "../shared/Badge.js";
import { EmptyState } from "../shared/EmptyState.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.js";
import styles from "./OcCronSection.module.css";

interface OcCron {
  id: string;
  schedule: string;
  command: string;
  label?: string;
}

interface OcCronSectionProps {
  entries: OcCron[];
  isEmpty: boolean;
  onRemove: (id: string) => void;
  onRemoveAll: () => void;
}

export function OcCronSection({ entries, isEmpty, onRemove, onRemoveAll }: OcCronSectionProps) {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);

  const columns = [
    {
      key: "id",
      header: "ID",
      width: "80px",
      render: (e: OcCron) => <span>{e.id}</span>,
    },
    {
      key: "schedule",
      header: "Schedule",
      width: "140px",
      render: (e: OcCron) => <code>{e.schedule}</code>,
    },
    {
      key: "command",
      header: "Command",
      render: (e: OcCron) => <span>{e.command}</span>,
    },
    {
      key: "actions",
      header: "",
      width: "80px",
      render: (e: OcCron) => (
        <button className={styles.removeBtn} onClick={() => setConfirmRemove(e.id)}>
          Remove
        </button>
      ),
    },
  ];

  const hasEntries = !isEmpty && entries.length > 0;

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>
          OC Internal Crons
          {hasEntries ? (
            <Badge label={`${entries.length} found`} variant="red" />
          ) : (
            <Badge label="Empty (correct)" variant="green" />
          )}
        </div>
        {hasEntries && (
          <button className={styles.dangerBtn} onClick={() => setConfirmRemoveAll(true)}>
            Remove All
          </button>
        )}
      </div>
      <div className={styles.body}>
        {hasEntries ? (
          <DataTable columns={columns} data={entries} rowKey={(e) => e.id} compact />
        ) : (
          <EmptyState message="No OC internal crons detected — this is the expected state" />
        )}
      </div>

      <ConfirmDialog
        open={!!confirmRemove}
        title="Remove OC Cron"
        message={`Remove internal cron job "${confirmRemove}"?`}
        onConfirm={() => {
          if (confirmRemove) onRemove(confirmRemove);
          setConfirmRemove(null);
        }}
        onCancel={() => setConfirmRemove(null)}
        confirmLabel="Remove"
        danger
      />

      <ConfirmDialog
        open={confirmRemoveAll}
        title="Remove All OC Crons"
        message={`Remove all ${entries.length} OC internal cron jobs?`}
        onConfirm={() => {
          onRemoveAll();
          setConfirmRemoveAll(false);
        }}
        onCancel={() => setConfirmRemoveAll(false)}
        confirmLabel="Remove All"
        danger
      />
    </div>
  );
}
