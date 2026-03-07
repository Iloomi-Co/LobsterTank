import { useState, useEffect } from "react";
import { api } from "../../api/client.js";
import styles from "./WelcomeRow.module.css";

export function WelcomeRow() {
  const [agentName, setAgentName] = useState("--");

  useEffect(() => {
    api.agents().then(async (res) => {
      if (res.ok && res.data?.agents) {
        const main = res.data.agents.find((a: any) => a.id === "main");
        const name = main?.name !== "main" ? main?.name : undefined;
        if (name) {
          setAgentName(name);
          return;
        }
      }
      // Fall back to identity endpoint (reads IDENTITY.md)
      const id = await api.identity();
      if (id.ok && id.data?.name) {
        setAgentName(id.data.name);
      }
    });
  }, []);

  return (
    <div className={styles.welcome}>
      <h1 className={styles.heading}>You're managing {agentName}</h1>
    </div>
  );
}
