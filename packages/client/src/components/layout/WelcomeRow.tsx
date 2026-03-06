import { useState, useEffect } from "react";
import { api } from "../../api/client.js";
import styles from "./WelcomeRow.module.css";

export function WelcomeRow() {
  const [agentName, setAgentName] = useState("--");

  useEffect(() => {
    api.agents().then((res) => {
      if (res.ok && res.data?.agents) {
        const main = res.data.agents.find((a: any) => a.id === "main");
        const name = main?.name !== "main" ? main?.name : "Unknown";
        setAgentName(name ?? res.data.agents[0]?.name ?? null);
      }
    });
  }, []);

  return (
    <div className={styles.welcome}>
      <h1 className={styles.heading}>You're managing {agentName}</h1>
    </div>
  );
}
