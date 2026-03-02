import { useState, useCallback } from "react";
import { api } from "../../api/client.js";
import { FindingsSection } from "./FindingsSection.js";
import { DispatchFixDialog } from "./DispatchFixDialog.js";
import { Badge } from "../shared/Badge.js";
import styles from "./DeterminismAudit.module.css";

interface LlmReview {
  isNonDeterministic: string;
  reasoning: string;
  suggestedRewrite: string | null;
  confidence: string;
}

interface Finding {
  id: string;
  category: string;
  severity: "high" | "medium" | "low" | "info";
  file: string | null;
  line: number | null;
  excerpt: string;
  context: string;
  suggestedAction: string;
  hasCrontabMatch?: boolean;
  hasMechanismReference?: boolean;
  mechanismNote?: string;
  crontabEntry?: string;
  estimatedIdleCost?: string;
  missingRules?: string[];
  llmReview?: LlmReview;
}

interface ScanResult {
  scanTimestamp: string;
  target: string;
  workspacesScanned: string[];
  filesScanned: number;
  findings: Finding[];
  summary: { high: number; medium: number; low: number; info: number };
}

export function DeterminismAudit() {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [deepScanning, setDeepScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dispatchFinding, setDispatchFinding] = useState<Finding | null>(null);
  const [copied, setCopied] = useState(false);

  const runScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await api.determinismScan();
      if (res.ok && res.data) {
        setScanResult(res.data);
      } else {
        setError(res.error ?? "Scan failed");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  }, []);

  const runDeepScan = useCallback(async (findingIds?: string[]) => {
    setDeepScanning(true);
    setError(null);
    try {
      const res = await api.determinismDeepScan(findingIds);
      if (res.ok && res.data) {
        // Merge reviewed findings back into scan result
        setScanResult((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, findings: [...prev.findings] };
          for (const reviewed of res.data.findings) {
            const idx = updated.findings.findIndex((f: Finding) => f.id === reviewed.id);
            if (idx >= 0) updated.findings[idx] = reviewed;
          }
          return updated;
        });
      } else {
        setError(res.error ?? "Deep scan failed");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeepScanning(false);
    }
  }, []);

  const buildCsv = useCallback(() => {
    if (!scanResult) return "";
    const headers = ["ID", "Severity", "Category", "File", "Line", "Excerpt", "Context", "Suggested Action", "LLM Verdict", "LLM Reasoning"];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = scanResult.findings.map((f) => [
      f.id,
      f.severity,
      f.category,
      f.file ?? "",
      f.line != null ? String(f.line) : "",
      f.excerpt,
      f.context,
      f.suggestedAction,
      f.llmReview?.isNonDeterministic ?? "",
      f.llmReview?.reasoning ?? "",
    ]);
    return [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
  }, [scanResult]);

  const handleCopyCsv = useCallback(async () => {
    const csv = buildCsv();
    if (!csv) return;
    try {
      await navigator.clipboard.writeText(csv);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no clipboard access
    }
  }, [buildCsv]);

  const handleDownloadCsv = useCallback(() => {
    const csv = buildCsv();
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `determinism-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [buildCsv]);

  const totalFindings = scanResult
    ? scanResult.summary.high + scanResult.summary.medium + scanResult.summary.low + scanResult.summary.info
    : 0;

  const nonInfoFindings = scanResult
    ? scanResult.findings.filter((f) => f.severity !== "info")
    : [];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerTitle}>Determinism Audit</span>
          {scanResult && (
            <div className={styles.badges}>
              {scanResult.summary.high > 0 && (
                <Badge label={`${scanResult.summary.high} high`} variant="red" />
              )}
              {scanResult.summary.medium > 0 && (
                <Badge label={`${scanResult.summary.medium} med`} variant="yellow" />
              )}
              {scanResult.summary.low > 0 && (
                <Badge label={`${scanResult.summary.low} low`} variant="blue" />
              )}
              {scanResult.summary.info > 0 && (
                <Badge label={`${scanResult.summary.info} info`} variant="muted" />
              )}
            </div>
          )}
        </div>
        <div className={styles.headerActions}>
          {scanResult && (
            <>
              <button
                className={styles.actionBtn}
                onClick={handleCopyCsv}
              >
                {copied ? "Copied!" : "Copy CSV"}
              </button>
              <button
                className={styles.actionBtn}
                onClick={handleDownloadCsv}
              >
                Download CSV
              </button>
              {nonInfoFindings.length > 0 && (
                <button
                  className={`${styles.actionBtn} ${styles.deepScanBtn}`}
                  onClick={() => runDeepScan()}
                  disabled={deepScanning}
                >
                  {deepScanning ? "Reviewing..." : "Deep Scan (OC)"}
                </button>
              )}
            </>
          )}
          <button
            className={styles.scanBtn}
            onClick={runScan}
            disabled={scanning}
          >
            {scanning ? "Scanning..." : scanResult ? "Re-scan" : "Run Scan"}
          </button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {!scanResult && !scanning && (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>No scan results</div>
          <div className={styles.emptyDesc}>
            Run a scan to check OC workspace files for non-deterministic patterns —
            schedule language, action imperatives, missing safeguards, and more.
          </div>
        </div>
      )}

      {scanning && (
        <div className={styles.loading}>Scanning workspace files...</div>
      )}

      {scanResult && !scanning && (
        <>
          <div className={styles.meta}>
            <span>Target: {scanResult.target}</span>
            <span>Workspaces: {scanResult.workspacesScanned.join(", ") || "none"}</span>
            <span>Files scanned: {scanResult.filesScanned}</span>
            <span>Findings: {totalFindings}</span>
            <span>Scanned: {new Date(scanResult.scanTimestamp).toLocaleTimeString()}</span>
          </div>

          {totalFindings === 0 ? (
            <div className={styles.clean}>
              All clear — no non-deterministic patterns detected.
            </div>
          ) : (
            <FindingsSection
              findings={scanResult.findings}
              onDispatch={setDispatchFinding}
              onDeepScan={(id) => runDeepScan([id])}
              deepScanning={deepScanning}
            />
          )}
        </>
      )}

      {dispatchFinding && (
        <DispatchFixDialog
          finding={dispatchFinding}
          onClose={() => setDispatchFinding(null)}
        />
      )}
    </div>
  );
}
