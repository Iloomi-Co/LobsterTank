export interface HeredocBlock {
  id: string;
  delimiter: string;
  isQuoted: boolean;
  startLine: number;
  endLine: number;
  content: string;
  isPromptLikely: boolean;
  containsVariables: boolean;
}

const PROMPT_HINTS = [
  /^#+\s/m,           // markdown headers
  /\bTask:/i,
  /\bInstructions?:/i,
  /\bYou are\b/i,
  /\bPlease\b/i,
  /\bAnalyz/i,
  /\bSummariz/i,
  /\bRespond\b/i,
  /\bOutput format/i,
  /\bContext:/i,
];

export function isPromptLikely(content: string): boolean {
  let hits = 0;
  for (const re of PROMPT_HINTS) {
    if (re.test(content)) hits++;
    if (hits >= 2) return true;
  }
  // Single long block of natural language is likely a prompt
  if (content.length > 200 && hits >= 1) return true;
  return false;
}

/**
 * Extract all heredoc blocks from a shell script.
 * Handles patterns like:
 *   cat <<'EOFMSG'    (quoted — no variable expansion)
 *   cat <<EOFMSG      (unquoted — variable expansion)
 *   cat <<-EOF         (indented)
 */
export function extractHeredocs(scriptContent: string): HeredocBlock[] {
  const lines = scriptContent.split("\n");
  const blocks: HeredocBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    // Match heredoc start: <<[-]?['"]?DELIMITER['"]?
    const match = lines[i].match(/<<-?\s*(['"]?)(\w+)\1/);
    if (!match) continue;

    const isQuoted = match[1] === "'" || match[1] === '"';
    const delimiter = match[2];
    const startLine = i + 1;

    // Find the closing delimiter
    let endLine = -1;
    const contentLines: string[] = [];
    for (let j = startLine; j < lines.length; j++) {
      if (lines[j].trim() === delimiter) {
        endLine = j;
        break;
      }
      contentLines.push(lines[j]);
    }

    if (endLine === -1) continue; // unclosed heredoc

    const content = contentLines.join("\n");
    const containsVariables = /\$[A-Z_{\(]/.test(content);

    blocks.push({
      id: `heredoc-${startLine}`,
      delimiter,
      isQuoted,
      startLine,
      endLine,
      content,
      isPromptLikely: isPromptLikely(content),
      containsVariables,
    });
  }

  return blocks;
}

/**
 * Return only heredoc blocks that look like LLM prompts.
 */
export function extractPrompts(scriptContent: string): HeredocBlock[] {
  return extractHeredocs(scriptContent).filter((b) => b.isPromptLikely);
}

/**
 * Replace the content of a specific heredoc block in a script.
 * Preserves the delimiter lines and surrounding script.
 */
export function replaceHeredocContent(
  scriptContent: string,
  heredocId: string,
  newContent: string,
): string {
  const lines = scriptContent.split("\n");
  const blocks = extractHeredocs(scriptContent);
  const target = blocks.find((b) => b.id === heredocId);
  if (!target) return scriptContent;

  const before = lines.slice(0, target.startLine);
  const after = lines.slice(target.endLine);
  const newLines = newContent.split("\n");

  return [...before, ...newLines, ...after].join("\n");
}
