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
  "gpt-4o-mini": "#3A7CA5",
  "gpt-4o": "#001F54",
  "gpt-4-turbo": "#0B3D6B",
  "gpt-4": "#001F54",
  // Local / Ollama
  "llama3": "#B4E33D",
  "llama3.1": "#8ACC26",
  "llama3.2": "#6DB51E",
  "mistral": "#A5CC6B",
  "codellama": "#04724D",
  "deepseek-coder": "#1A8F6E",
  "deepseek-r1": "#0E7C5F",
  "qwen3": "#D4A03C",
  "qwen2.5": "#C28B2D",
  "gemma3": "#9B59B6",
  "gemma2": "#8E44AD",
  "phi4": "#2E86AB",
  "phi3": "#3498A2",
  "minimax": "#E07B53",
  "kimi": "#C45BA0",
  "glm": "#5E81AC",
  "command-r": "#E74C6F",
  "starcoder": "#6C5CE7",
  "yi": "#D4845E",
  "internlm": "#5DADE2",
  "falcon": "#48C9B0",
  "vicuna": "#AF7AC5",
  "zephyr": "#45B7A0",
  "solar": "#F4A942",
  "nous-hermes": "#7FB069",
  "openchat": "#E06C75",
  "neural-chat": "#56B4D3",
  "dolphin": "#5B8C85",
  "wizard": "#8B5CF6",
  "orca": "#2D9CDB",
  "tinyllama": "#98D8A0",
  "stablelm": "#E8915A",
};

const DEFAULT_COLOR = "#A5CC6B";

/** Overflow palette for models not in the lookup table */
const PALETTE = [
  "#E84855",
  "#6C5CE7",
  "#FDCB6E",
  "#00B894",
  "#E17055",
  "#3A7CA5",
  "#D4A03C",
  "#9B59B6",
  "#48C9B0",
  "#AF7AC5",
  "#2E86AB",
  "#C45BA0",
  "#5E81AC",
  "#E74C6F",
  "#D4845E",
  "#5DADE2",
  "#7FB069",
  "#E06C75",
  "#56B4D3",
  "#5B8C85",
  "#8B5CF6",
  "#2D9CDB",
  "#F4A942",
  "#45B7A0",
  "#98D8A0",
  "#E8915A",
  "#8ACC26",
  "#C28B2D",
  "#1A8F6E",
  "#0E7C5F",
];

const dynamicAssignments = new Map<string, string>();
let paletteIdx = 0;

export function getModelColor(model: string, _isLocal = false): string {
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
