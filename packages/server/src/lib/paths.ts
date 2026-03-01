import { homedir } from "os";
import { resolve, normalize } from "path";

export function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return resolve(homedir(), p.slice(2));
  }
  return resolve(p);
}

export function safePath(base: string, relative: string): string | null {
  const resolved = resolve(base, relative);
  const normalized = normalize(resolved);
  if (!normalized.startsWith(normalize(base))) {
    return null;
  }
  return normalized;
}
