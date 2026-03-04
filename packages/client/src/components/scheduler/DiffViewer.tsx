import styles from "./DiffViewer.module.css";

interface DiffViewerProps {
  originalContent: string;
  rewrittenContent: string;
}

interface DiffLine {
  type: "added" | "removed" | "context";
  content: string;
  lineNum: number | null;
}

function computeDiff(original: string, rewritten: string): DiffLine[] {
  const origLines = original.split("\n");
  const newLines = rewritten.split("\n");
  const result: DiffLine[] = [];

  // Simple line-by-line diff (longest common subsequence based)
  const lcs = buildLCS(origLines, newLines);
  let oi = 0;
  let ni = 0;
  let li = 0;

  while (li < lcs.length) {
    const [origIdx, newIdx] = lcs[li];

    // Lines removed before this match
    while (oi < origIdx) {
      result.push({ type: "removed", content: origLines[oi], lineNum: oi + 1 });
      oi++;
    }
    // Lines added before this match
    while (ni < newIdx) {
      result.push({ type: "added", content: newLines[ni], lineNum: ni + 1 });
      ni++;
    }
    // Context line
    result.push({ type: "context", content: origLines[oi], lineNum: oi + 1 });
    oi++;
    ni++;
    li++;
  }

  // Remaining removed
  while (oi < origLines.length) {
    result.push({ type: "removed", content: origLines[oi], lineNum: oi + 1 });
    oi++;
  }
  // Remaining added
  while (ni < newLines.length) {
    result.push({ type: "added", content: newLines[ni], lineNum: ni + 1 });
    ni++;
  }

  return result;
}

function buildLCS(a: string[], b: string[]): [number, number][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const pairs: [number, number][] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      pairs.unshift([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return pairs;
}

export function DiffViewer({ originalContent, rewrittenContent }: DiffViewerProps) {
  if (originalContent === rewrittenContent) {
    return <div className={styles.empty}>No changes</div>;
  }

  const lines = computeDiff(originalContent, rewrittenContent);

  return (
    <div className={styles.container}>
      {lines.map((line, idx) => {
        const cls =
          line.type === "added" ? styles.lineAdded :
          line.type === "removed" ? styles.lineRemoved :
          styles.lineContext;

        const prefix = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";

        return (
          <div key={idx} className={cls}>
            <span className={styles.lineNumber}>{line.lineNum ?? ""}</span>
            <span className={styles.lineContent}>{prefix} {line.content}</span>
          </div>
        );
      })}
    </div>
  );
}
