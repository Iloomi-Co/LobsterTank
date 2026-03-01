import { useState } from "react";
import { api } from "../../api/client.js";
import styles from "./CrontabEditor.module.css";

interface CrontabEditorProps {
  initialContent: string;
  onSave: () => void;
  onClose: () => void;
}

export function CrontabEditor({ initialContent, onSave, onClose }: CrontabEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const res = await api.schedulerEditCrontab(content);
    setSaving(false);
    if (res.ok) {
      onSave();
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Edit Crontab</h3>
        </div>
        <textarea
          className={styles.editor}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
        />
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
