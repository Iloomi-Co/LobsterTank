import { type ReactNode } from "react";
import styles from "./DataTable.module.css";

interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (item: T) => string;
  onRowClick?: (item: T) => void;
  compact?: boolean;
}

export function DataTable<T>({ columns, data, rowKey, onRowClick, compact }: DataTableProps<T>) {
  return (
    <div className={styles.wrapper}>
      <table className={`${styles.table} ${compact ? styles.compact : ""}`}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr
              key={rowKey(item)}
              onClick={onRowClick ? () => onRowClick(item) : undefined}
              className={onRowClick ? styles.clickable : ""}
            >
              {columns.map((col) => (
                <td key={col.key}>{col.render(item)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
