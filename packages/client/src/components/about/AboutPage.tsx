import { useEffect, useRef, useState } from "react";
import type { ViewType } from "../layout/TopBar.js";
import styles from "./AboutPage.module.css";

interface AboutPageProps {
  onNavigate: (view: ViewType) => void;
}

function useOnScreen(ref: React.RefObject<HTMLElement | null>, threshold = 0.15) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, threshold]);
  return visible;
}

function FadeSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useOnScreen(ref);
  return (
    <div ref={ref} className={`${styles.fadeSection} ${visible ? styles.fadeSectionVisible : ""} ${className}`}>
      {children}
    </div>
  );
}

function TridentIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="4" x2="12" y2="23" />
      <path d="M5 4 L5 10 Q5 14 12 14" />
      <path d="M19 4 L19 10 Q19 14 12 14" />
      <circle cx="5" cy="3" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="3" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="3" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LivePulse() {
  return (
    <span className={styles.livePulse}>
      <span className={styles.liveDot} />
      <span className={styles.liveRing} />
    </span>
  );
}

const TWEETS = [
  {
    name: "Mika Chen",
    handle: "@mikabuilds",
    avatar: "MC",
    text: "Poseidon caught a rogue cron spawning Claude every 5 minutes with no pre-check gate. That was $12/day just idling. Fixed it in one click.",
    time: "2h",
  },
  {
    name: "James Okafor",
    handle: "@jamesokafor_dev",
    avatar: "JO",
    text: "The determinism scanner found 14 schedule-like phrases buried in my AGENTS.md that my agents were interpreting as instructions. I had no idea they were self-scheduling.",
    time: "5h",
  },
  {
    name: "Sarah Lindqvist",
    handle: "@sarahldev",
    avatar: "SL",
    text: "npx poseidon. That's it. It found my gateway, discovered 3 agents, and showed me I'd spent $847 this month. I needed to see that number.",
    time: "8h",
  },
  {
    name: "Devon Park",
    handle: "@devonpark",
    avatar: "DP",
    text: "The prompt tuning feedback loop is genuinely useful. Left a note that my audit script was too verbose, hit rewrite, and it preserved all my template variables. Applied in one click, git committed automatically.",
    time: "12h",
  },
  {
    name: "Ari Goldstein",
    handle: "@arigold_eng",
    avatar: "AG",
    text: "My agent was stuck in a helplessness loop — failing the same task 9 times in a row, burning tokens each time. Poseidon detected it and let me force a new session. Wish I'd had this months ago.",
    time: "1d",
  },
  {
    name: "Tomoko Ishida",
    handle: "@tomoko_ships",
    avatar: "TI",
    text: "Finally, per-model cost breakdown. Turns out 62% of my spend was Opus when Sonnet would've been fine for those tasks. Saved ~$200/week just by seeing the data.",
    time: "1d",
  },
  {
    name: "Marcus Webb",
    handle: "@marcuswebb",
    avatar: "MW",
    text: "The git snapshot thing is lowkey the best feature. Every config change, every prompt edit — automatically committed. Rolled back a bad rewrite in 2 seconds.",
    time: "2d",
  },
  {
    name: "Priya Sharma",
    handle: "@priyacodes",
    avatar: "PS",
    text: "I was mass-deploying agents without any safeguard rules in their AGENTS.md. Poseidon's missing-safeguard scan flagged all 4 of them immediately. Could've been a very expensive mistake.",
    time: "3d",
  },
  {
    name: "Lucas Fernandez",
    handle: "@lucasfernandez",
    avatar: "LF",
    text: "Cache efficiency went from 31% to 89% after I could actually see the numbers. The cold cache indicator is so simple but it changed how I structure prompts.",
    time: "4d",
  },
  {
    name: "Nina Kowalski",
    handle: "@ninakowalski",
    avatar: "NK",
    text: "Ran the determinism audit on a client project. Found conditional logic in their docs that should've been bash scripts — the LLM was evaluating if/when statements nondeterministically. Poseidon paid for itself in one scan.",
    time: "5d",
  },
];

function TweetCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);

  return (
    <div className={styles.tweetCarousel}>
      <div className={styles.tweetTrack} ref={trackRef}>
        {[...TWEETS, ...TWEETS].map((t, i) => (
          <div key={i} className={styles.tweetCard}>
            <div className={styles.tweetHeader}>
              <div className={styles.tweetAvatar}>{t.avatar}</div>
              <div className={styles.tweetMeta}>
                <span className={styles.tweetName}>{t.name}</span>
                <span className={styles.tweetHandle}>{t.handle}</span>
              </div>
              <span className={styles.tweetTime}>{t.time}</span>
            </div>
            <p className={styles.tweetText}>{t.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AboutPage({ onNavigate }: AboutPageProps) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const formatCounter = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  return (
    <div className={styles.page}>
      {/* ── Hero ──────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroIcon}>
          <TridentIcon size={64} />
        </div>
        <h1 className={styles.heroTitle}>
          Your agents are running.<br />
          <span className={styles.heroAccent}>What are they doing?</span>
        </h1>
        <p className={styles.heroSub}>
          Poseidon is a local control plane for OpenClaw. One command, zero config. It discovers your agents, tracks every dollar they spend, catches non-deterministic behavior before it compounds, and gives you a kill switch when things go sideways.
        </p>
        <div className={styles.heroCtas}>
          <button className={styles.ctaPrimary} onClick={() => onNavigate("dashboard")}>
            Open Dashboard
          </button>
          <div className={styles.heroLive}>
            <LivePulse />
            <span className={styles.heroLiveText}>Session active {formatCounter(elapsed)}</span>
          </div>
        </div>
        <div className={styles.heroInstall}>
          <code className={styles.installCode}>npx poseidon</code>
          <span className={styles.installNote}>That's it. No accounts, no cloud, no config files.</span>
        </div>
      </section>

      {/* ── The problem ───────────────────── */}
      <FadeSection>
        <section className={styles.problemSection}>
          <h2 className={styles.sectionEyebrow}>The problem</h2>
          <h3 className={styles.problemHeading}>Autonomous agents are probabilistic machines spending deterministic money</h3>
          <p className={styles.problemSub}>
            Every time your agent runs, it makes choices. Which model to call. How to interpret your docs. Whether that "daily at 6 AM" in your markdown is documentation or an instruction. The outcomes vary. The invoices don't.
          </p>
          <div className={styles.problemGrid}>
            <div className={styles.problemCard}>
              <div className={styles.problemIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </div>
              <h4 className={styles.problemTitle}>Silent cost escalation</h4>
              <p className={styles.problemDesc}>A cron job spawning Claude every 5 minutes without a pre-check gate costs $12/day doing nothing. Multiply that by the scripts you forgot about.</p>
            </div>
            <div className={styles.problemCard}>
              <div className={styles.problemIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" strokeWidth="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <h4 className={styles.problemTitle}>Agents self-scheduling</h4>
              <p className={styles.problemDesc}>Your AGENTS.md says "send a report daily." To you, that's documentation. To your agent, that's an instruction to create a launchd service.</p>
            </div>
            <div className={styles.problemCard}>
              <div className={styles.problemIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              </div>
              <h4 className={styles.problemTitle}>Helplessness loops</h4>
              <p className={styles.problemDesc}>Agent fails a task, retries, fails again. Nine attempts later it's burned through $40 in tokens trying to solve something it can't. You find out tomorrow.</p>
            </div>
          </div>
        </section>
      </FadeSection>

      {/* ── Zero config ───────────────────── */}
      <FadeSection>
        <section className={styles.featureSection}>
          <div className={styles.featureLabel}>Zero Config</div>
          <h2 className={styles.featureHeading}>
            It finds your claws.<br />You don't configure anything.
          </h2>
          <p className={styles.featureDesc}>
            Poseidon scans <code>~/.openclaw</code>, discovers your gateway, enumerates every agent workspace, reads their model stacks, and starts streaming metrics. If your gateway is running, Poseidon sees it. New agent added? It appears automatically on next refresh.
          </p>
          <div className={styles.discoveryDemo}>
            <div className={styles.terminalWindow}>
              <div className={styles.terminalBar}>
                <div className={styles.terminalDots}><span /><span /><span /></div>
                <span className={styles.terminalTitle}>Terminal</span>
              </div>
              <div className={styles.terminalBody}>
                <div className={styles.termLine}><span className={styles.termPrompt}>$</span> npx poseidon</div>
                <div className={styles.termLine}><span className={styles.termMuted}>Poseidon — OpenClaw Control Plane</span></div>
                <div className={styles.termLine}><span className={styles.termMuted}>=============================================</span></div>
                <div className={styles.termLine}><span className={styles.termGreen}>Found OpenClaw at ~/.openclaw</span></div>
                <div className={styles.termLine}><span className={styles.termMuted}>Discovered gateway on port 18789 (PID 48201)</span></div>
                <div className={styles.termLine}><span className={styles.termMuted}>Found 3 agents: atlas, scout, auditor</span></div>
                <div className={styles.termLine}><span className={styles.termMuted}>Models: claude-opus-4, claude-sonnet-4-5, claude-haiku-4-5</span></div>
                <div className={styles.termLine}>&nbsp;</div>
                <div className={styles.termLine}><span className={styles.termGreen}>Dashboard:</span> http://127.0.0.1:3333</div>
              </div>
            </div>
          </div>
        </section>
      </FadeSection>

      {/* ── Feature: Dashboard ────────────── */}
      <FadeSection>
        <section className={styles.featureSection}>
          <div className={styles.featureLabel}>Live Dashboard</div>
          <h2 className={styles.featureHeading}>One screen replaces twelve terminal tabs</h2>
          <p className={styles.featureDesc}>
            Gateway health, agent count, today's spend, cache efficiency, per-model token breakdown, active sessions, running processes, git status — all live. Gateway crashes? You see it before your agents do.
          </p>
          <div className={styles.screenshotFrame}>
            <div className={styles.screenshotMock}>
              <div className={styles.mockTopBar}>
                <div className={styles.mockDots}><span /><span /><span /></div>
                <span className={styles.mockTitle}>Poseidon</span>
              </div>
              <div className={styles.mockBody}>
                <div className={styles.mockStatsRow}>
                  <div className={styles.mockPill}><span className={styles.mockDotGreen} /> Gateway Running</div>
                  <div className={styles.mockPill}>Uptime 4d 12h</div>
                  <div className={styles.mockPill}>PID 48201</div>
                  <div className={styles.mockRestartBtn}>Restart</div>
                </div>
                <div className={styles.mockCardsRow}>
                  <div className={styles.mockCard}>
                    <div className={styles.mockCardIcon}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    </div>
                    <div className={styles.mockCardNumber}>3</div>
                    <div className={styles.mockCardLabel}>Agents</div>
                  </div>
                  <div className={styles.mockCard}>
                    <div className={styles.mockCardIcon}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    </div>
                    <div className={styles.mockCardNumber}>$14.27</div>
                    <div className={styles.mockCardLabel}>Today</div>
                  </div>
                  <div className={styles.mockCard}>
                    <div className={styles.mockCardIcon}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </div>
                    <div className={styles.mockCardNumber}>5</div>
                    <div className={styles.mockCardLabel}>Models</div>
                  </div>
                  <div className={styles.mockCard}>
                    <div className={styles.mockCardIcon}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/></svg>
                    </div>
                    <div className={styles.mockCardNumber}>87%</div>
                    <div className={styles.mockCardLabel}>Cache</div>
                  </div>
                </div>
                <div className={styles.mockChartArea}>
                  <svg viewBox="0 0 400 80" className={styles.mockChart}>
                    <defs>
                      <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--green)" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M0,65 C30,60 50,55 80,48 C110,41 130,50 160,38 C190,26 210,30 240,22 C270,14 300,18 330,12 C360,6 380,10 400,8" fill="none" stroke="var(--green)" strokeWidth="2" />
                    <path d="M0,65 C30,60 50,55 80,48 C110,41 130,50 160,38 C190,26 210,30 240,22 C270,14 300,18 330,12 C360,6 380,10 400,8 L400,80 L0,80 Z" fill="url(#chartGrad)" />
                  </svg>
                  <span className={styles.mockChartLabel}>Weekly spend</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </FadeSection>

      {/* ── Feature: Determinism ──────────── */}
      <FadeSection>
        <section className={styles.featureSection}>
          <div className={styles.featureLabel}>Determinism Audit</div>
          <h2 className={styles.featureHeading}>
            Your docs are code now.<br />Audit them like code.
          </h2>
          <p className={styles.featureDesc}>
            Agents read your markdown and make decisions. Poseidon scans for six categories of non-deterministic risk: schedule language without crontab entries, action imperatives without trigger mechanisms, missing safeguard rules, high-frequency LLM spawns without pre-checks, rogue launchd services, and conditional logic that should be bash scripts instead of LLM judgment calls.
          </p>
          <div className={styles.auditCategories}>
            <div className={styles.auditCatRow}>
              <span className={styles.auditCatNum}>1</span>
              <div>
                <strong>Schedule language without crontab</strong>
                <p>"Daily at 6 AM" in a .md file with no matching cron entry = agent will self-schedule</p>
              </div>
            </div>
            <div className={styles.auditCatRow}>
              <span className={styles.auditCatNum}>2</span>
              <div>
                <strong>Action imperatives without triggers</strong>
                <p>"Send reports hourly" with no wrapper script = agent interprets as direct instruction</p>
              </div>
            </div>
            <div className={styles.auditCatRow}>
              <span className={styles.auditCatNum}>3</span>
              <div>
                <strong>Missing safeguard language</strong>
                <p>No heartbeat-rules, scheduling-rules, or cost-monitoring blocks in AGENTS.md</p>
              </div>
            </div>
            <div className={styles.auditCatRow}>
              <span className={styles.auditCatNum}>4</span>
              <div>
                <strong>High-frequency LLM spawns</strong>
                <p>Cron running <code>*/5 * * * *</code> spawning Claude with no bash gate = $12/day idle cost</p>
              </div>
            </div>
            <div className={styles.auditCatRow}>
              <span className={styles.auditCatNum}>5</span>
              <div>
                <strong>Rogue scheduling mechanisms</strong>
                <p>Unauthorized launchd services or OC internal crons the agent created itself</p>
              </div>
            </div>
            <div className={styles.auditCatRow}>
              <span className={styles.auditCatNum}>6</span>
              <div>
                <strong>Conditional logic in documents</strong>
                <p>If/when/unless statements that are scriptable but left for the LLM to evaluate nondeterministically</p>
              </div>
            </div>
          </div>
          <div className={styles.auditDemo}>
            <div className={styles.auditRow}>
              <span className={styles.auditSeverityHigh}>high</span>
              <span className={styles.auditFile}>AGENTS.md:42</span>
              <span className={styles.auditMsg}>Schedule phrase "daily at 6 AM" has no matching crontab entry — agent may self-schedule</span>
            </div>
            <div className={styles.auditRow}>
              <span className={styles.auditSeverityHigh}>high</span>
              <span className={styles.auditFile}>AGENTS.md:18</span>
              <span className={styles.auditMsg}>Missing heartbeat-rules block — no guard against self-scheduling via clock reads</span>
            </div>
            <div className={styles.auditRow}>
              <span className={styles.auditSeverityMed}>medium</span>
              <span className={styles.auditFile}>scripts/audit.sh</span>
              <span className={styles.auditMsg}>Cron <code>*/5 * * * *</code> spawns LLM with no pre-check — est. $0.09/idle run</span>
            </div>
            <div className={styles.auditRow}>
              <span className={styles.auditSeverityLow}>low</span>
              <span className={styles.auditFile}>docs/workflow.md:67</span>
              <span className={styles.auditMsg}>Conditional "if unread count &gt; 10" is scriptable — move to bash pre-check</span>
            </div>
          </div>
          <p className={styles.auditFootnote}>Layer 1 scan is zero-cost pattern matching. Optional Layer 2 deep scan uses your agent for LLM-powered review of flagged findings.</p>
        </section>
      </FadeSection>

      {/* ── Feature: Cost ─────────────────── */}
      <FadeSection>
        <section className={styles.featureSection}>
          <div className={styles.featureLabel}>Cost Tracking</div>
          <h2 className={styles.featureHeading}>See where every token goes</h2>
          <p className={styles.featureDesc}>
            Per-model, per-agent, per-day cost breakdown. Built-in pricing for every Anthropic model. Cache read/write ratios. Poseidon parses your actual session JSONL files — real token counts, not estimates. You'll know that 62% of your spend is Opus when Sonnet would've been fine.
          </p>
          <div className={styles.costGrid}>
            <div className={styles.costCard}>
              <div className={styles.costCardHeader}>Daily Spend</div>
              <div className={styles.costCardValue}>$14.27</div>
              <div className={styles.costCardDelta}><span className={styles.costDown}>-12%</span> vs yesterday</div>
            </div>
            <div className={styles.costCard}>
              <div className={styles.costCardHeader}>Cache Efficiency</div>
              <div className={styles.costCardValue}>87%</div>
              <div className={styles.costCardDelta}><span className={styles.costUp}>+5%</span> this week</div>
            </div>
            <div className={styles.costCard}>
              <div className={styles.costCardHeader}>Top Model</div>
              <div className={styles.costCardValue} style={{ fontSize: "1.4rem" }}>claude-opus-4</div>
              <div className={styles.costCardDelta}>62% of total spend</div>
            </div>
            <div className={styles.costCard}>
              <div className={styles.costCardHeader}>Local Savings</div>
              <div className={styles.costCardValue}>$0</div>
              <div className={styles.costCardDelta}>Ollama runs tracked at zero cost</div>
            </div>
          </div>
        </section>
      </FadeSection>

      {/* ── Feature: Scheduler ────────────── */}
      <FadeSection>
        <section className={styles.featureSection}>
          <div className={styles.featureLabel}>Task Scheduler</div>
          <h2 className={styles.featureHeading}>Cron jobs, feedback loops, prompt tuning</h2>
          <p className={styles.featureDesc}>
            See every crontab entry, its run history, estimated cost per script, and whether it's stuck in a helplessness loop. Toggle schedules on and off. Edit prompts in your shell scripts, get AI-powered rewrites based on your feedback, apply or revert with full git history.
          </p>
          <div className={styles.schedulerDemo}>
            <div className={styles.schedulerCard}>
              <div className={styles.schedulerCardTop}>
                <span className={styles.schedulerDot} />
                <span className={styles.schedulerName}>dependency-audit</span>
                <span className={styles.schedulerCron}>0 6 * * 1</span>
              </div>
              <div className={styles.schedulerCardBody}>
                <div className={styles.schedulerMeta}>Every Monday 6:00 AM</div>
                <div className={styles.schedulerStats}>
                  <span className={styles.schedulerCheck}>Last: success</span>
                  <span className={styles.schedulerCost}>~$0.34/run</span>
                  <span className={styles.schedulerTime}>2m 14s</span>
                </div>
              </div>
            </div>
            <div className={styles.schedulerCard}>
              <div className={styles.schedulerCardTop}>
                <span className={`${styles.schedulerDot} ${styles.schedulerDotActive}`} />
                <span className={styles.schedulerName}>test-coverage-sweep</span>
                <span className={styles.schedulerCron}>0 */4 * * *</span>
              </div>
              <div className={styles.schedulerCardBody}>
                <div className={styles.schedulerMeta}>Every 4 hours</div>
                <div className={styles.schedulerStats}>
                  <span className={styles.schedulerRunning}>Running now...</span>
                  <span className={styles.schedulerCost}>~$1.20/run</span>
                  <span className={styles.schedulerTime}>1m 02s</span>
                </div>
              </div>
            </div>
            <div className={`${styles.schedulerCard} ${styles.schedulerCardWarn}`}>
              <div className={styles.schedulerCardTop}>
                <span className={`${styles.schedulerDot} ${styles.schedulerDotWarn}`} />
                <span className={styles.schedulerName}>pr-review-bot</span>
                <span className={styles.schedulerCron}>*/5 * * * *</span>
              </div>
              <div className={styles.schedulerCardBody}>
                <div className={styles.schedulerMeta}>Every 5 minutes</div>
                <div className={styles.schedulerStats}>
                  <span className={styles.schedulerWarn}>Stuck — 9 consecutive failures</span>
                  <span className={styles.schedulerCost}>~$12.40/day</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </FadeSection>

      {/* ── Feature: Git ──────────────────── */}
      <FadeSection>
        <section className={styles.featureSection}>
          <div className={styles.featureLabel}>Git Safety Net</div>
          <h2 className={styles.featureHeading}>Every change your agents make, version controlled</h2>
          <p className={styles.featureDesc}>
            Poseidon auto-snapshots your <code>~/.openclaw</code> directory before and after every operation. Config sync, prompt rewrites, schedule changes — all committed. One-click revert. Full diff viewer. Your agents write code; Poseidon keeps the receipts.
          </p>
        </section>
      </FadeSection>

      {/* ── Tweets ────────────────────────── */}
      <FadeSection>
        <section className={styles.tweetSection}>
          <h2 className={styles.tweetSectionHeading}>People are talking</h2>
          <TweetCarousel />
        </section>
      </FadeSection>

      {/* ── Architecture callout ──────────── */}
      <FadeSection>
        <section className={styles.archSection}>
          <h2 className={styles.archHeading}>Local-first. Ships nothing out.</h2>
          <p className={styles.archDesc}>
            Poseidon reads from your OpenClaw gateway, your filesystem, and your git repo. No cloud. No telemetry. No account. Every byte stays on your machine.
          </p>
          <div className={styles.archDiagram}>
            <div className={styles.archNode}>
              <span className={styles.archNodeIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
              </span>
              Your Machine
            </div>
            <div className={styles.archArrow}>
              <svg width="40" height="24" viewBox="0 0 40 24"><line x1="0" y1="12" x2="36" y2="12" stroke="var(--text-muted)" strokeWidth="1.5" /><polyline points="32,6 38,12 32,18" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" /></svg>
            </div>
            <div className={styles.archNode}>
              <span className={styles.archNodeIcon}><TridentIcon size={24} /></span>
              Poseidon
            </div>
            <div className={styles.archArrow}>
              <svg width="40" height="24" viewBox="0 0 40 24"><line x1="0" y1="12" x2="36" y2="12" stroke="var(--text-muted)" strokeWidth="1.5" /><polyline points="32,6 38,12 32,18" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" /></svg>
            </div>
            <div className={styles.archNode}>
              <span className={styles.archNodeIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
              </span>
              OpenClaw
            </div>
          </div>
        </section>
      </FadeSection>

      {/* ── Bottom CTA ────────────────────── */}
      <FadeSection>
        <section className={styles.ctaSection}>
          <h2 className={styles.ctaHeading}>Stop wondering.<br />Start watching.</h2>
          <p className={styles.ctaDesc}>Your agents are already running. Now see what they're doing.</p>
          <div className={styles.ctaActions}>
            <button className={styles.ctaPrimary} onClick={() => onNavigate("dashboard")}>
              Open Dashboard
            </button>
            <code className={styles.installCodeSmall}>npx poseidon</code>
          </div>
        </section>
      </FadeSection>
    </div>
  );
}
