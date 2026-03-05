import { useState, useEffect } from "react";
import { api } from "../../api/client.js";
import styles from "./IdentityCard.module.css";

export function IdentityCard() {
  const [name, setName] = useState("--");
  const [title, setTitle] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.identity().then((res) => {
      if (res.ok && res.data) {
        setName(res.data.name);
        setTitle(res.data.title);
      }
      setLoaded(true);
    });
  }, []);

  return (
    <div className={styles.card}>
      {loaded && <img className={styles.avatar} src="/api/identity/avatar" alt={name} />}
      <div className={styles.overlay}>
        <div className={styles.name}>{name}</div>
        {title && <div className={styles.title}>{title}</div>}
      </div>
    </div>
  );
}
