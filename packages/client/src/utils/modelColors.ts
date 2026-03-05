/**
 * Shared model → color lookup used by all dashboard components.
 * Colors are from the user-specified palette.
 */

const MODEL_COLORS: Record<string, string> = {
  // Anthropic
  "sonnet-4-5": "#25CED1",
  "sonnet-4-6": "#25CED1",
  "haiku-4-5": "#F75C03",
  "haiku-4-6": "#F75C03",
  "opus-4-5": "#FF00FF",
  "opus-4-6": "#FF00FF",
  // OpenAI
  "gpt-4o": "#001F54",
  "gpt-4-turbo": "#001F54",
  "gpt-4": "#001F54",
  // Local / Ollama
  "llama3": "#B4E33D",
  "llama3.1": "#B4E33D",
  "mistral": "#A5CC6B",
  "codellama": "#04724D",
  "deepseek-coder": "#04724D",
};

const LOCAL_COLOR = "#B4E33D";
const DEFAULT_COLOR = "#A5CC6B";

/** Overflow palette for models not in the lookup table */
const PALETTE = [
  "#FF00FF",
  "#25CED1",
  "#F75C03",
  "#001F54",
  "#B4E33D",
  "#04724D",
  "#A5CC6B",
  "#E84855",
  "#6C5CE7",
  "#FDCB6E",
  "#00B894",
  "#E17055",
];

const dynamicAssignments = new Map<string, string>();
let paletteIdx = 0;

export function getModelColor(model: string, isLocal = false): string {
  if (isLocal) return LOCAL_COLOR;

  // Check explicit mapping
  const explicit = MODEL_COLORS[model];
  if (explicit) return explicit;

  // Check partial match (e.g. model string contains a key)
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (model.includes(key)) return color;
  }

  // Dynamic assignment — stable per session
  if (dynamicAssignments.has(model)) return dynamicAssignments.get(model)!;
  const color = PALETTE[paletteIdx % PALETTE.length];
  paletteIdx++;
  dynamicAssignments.set(model, color);
  return color;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
