import { useState, useEffect } from "react";
import { api } from "../../api/client.js";
import styles from "./AgentCarousel.module.css";

interface Agent {
  id: string;
  name: string;
  workspace: string;
  model: {
    primary: string;
    fallbacks: string[];
  };
}

function shortModel(full: string): string {
  return full.split("/").pop() ?? full;
}

export function AgentCarousel() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    api.agents().then((res) => {
      if (res.ok && res.data?.agents) setAgents(res.data.agents);
    });
  }, []);

  if (agents.length === 0) {
    return (
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.title}>Agents</span>
          <span className={styles.counter}>--</span>
        </div>
      </div>
    );
  }

  const agent = agents[idx];
  const prev = () => setIdx((i) => (i - 1 + agents.length) % agents.length);
  const next = () => setIdx((i) => (i + 1) % agents.length);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>Agents</span>
        <span className={styles.counter}>{idx + 1}/{agents.length}</span>
      </div>

      <div className={styles.agentName}>{agent.name ?? agent.id}</div>
      <div className={styles.agentId}>{agent.id}</div>

      <div className={styles.details}>
        <div className={styles.row}>
          <span className={styles.label}>Primary</span>
          <span className={styles.value}>{shortModel(agent.model?.primary ?? "default")}</span>
        </div>
        {agent.model?.fallbacks?.length > 0 && (
          <div className={styles.row}>
            <span className={styles.label}>Fallbacks</span>
            <span className={styles.value}>
              {agent.model.fallbacks.map(shortModel).join(", ")}
            </span>
          </div>
        )}
        <div className={styles.row}>
          <span className={styles.label}>Workspace</span>
          <span className={styles.value}>
            {agent.workspace?.replace(/.*\.openclaw\//, "~/.openclaw/") ?? "--"}
          </span>
        </div>
      </div>

      <div className={styles.nav}>
        <button className={styles.navBtn} onClick={prev} aria-label="Previous agent">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div className={styles.dots}>
          {agents.map((_, i) => (
            <span key={i} className={`${styles.dot} ${i === idx ? styles.dotActive : ""}`} />
          ))}
        </div>
        <button className={styles.navBtn} onClick={next} aria-label="Next agent">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    </div>
  );
}
