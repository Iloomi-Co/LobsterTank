import { useState, useEffect } from "react";
import { api, getProfileSlug } from "../../api/client.js";
import styles from "./IdentityCard.module.css";

export function IdentityCard() {
  const [name, setName] = useState("--");
  const [title, setTitle] = useState<string | null>(null);
  const [hasAvatar, setHasAvatar] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.identity().then((res) => {
      if (res.ok && res.data) {
        setName(res.data.name);
        setTitle(res.data.title);
        setHasAvatar(!!res.data.avatar);
      }
      setLoaded(true);
    });
  }, []);

  return (
    <div className={styles.card}>
      {loaded && hasAvatar && <img className={styles.avatar} src={`/api/${getProfileSlug()}/identity/avatar`} alt={name} />}
      <div className={styles.overlay}>
        <div className={styles.name}>{name}</div>
        {title && <div className={styles.title}>{title}</div>}
      </div>
    </div>
  );
}
