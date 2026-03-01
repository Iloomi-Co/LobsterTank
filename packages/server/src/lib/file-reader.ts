import { readFile, readdir, stat, mkdir } from "fs/promises";

export async function readJsonFile<T>(path: string): Promise<{ data: T | null; error: string | null }> {
  try {
    const content = await readFile(path, "utf-8");
    const data = JSON.parse(content) as T;
    return { data, error: null };
  } catch (e: any) {
    if (e.code === "ENOENT") {
      return { data: null, error: "File not found" };
    }
    if (e instanceof SyntaxError) {
      return { data: null, error: `Invalid JSON: ${e.message}` };
    }
    return { data: null, error: e.message ?? "Unknown error" };
  }
}

export async function readTextFile(path: string): Promise<{ data: string | null; error: string | null }> {
  try {
    const content = await readFile(path, "utf-8");
    return { data: content, error: null };
  } catch (e: any) {
    if (e.code === "ENOENT") {
      return { data: null, error: "File not found" };
    }
    return { data: null, error: e.message ?? "Unknown error" };
  }
}

export async function listDir(
  path: string,
  limit = 1000
): Promise<{ entries: string[]; error: string | null }> {
  try {
    const entries = await readdir(path);
    return { entries: entries.slice(0, limit), error: null };
  } catch (e: any) {
    if (e.code === "ENOENT") {
      return { entries: [], error: "Directory not found" };
    }
    return { entries: [], error: e.message ?? "Unknown error" };
  }
}

export async function fileStat(path: string) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

export async function ensureDir(path: string) {
  await mkdir(path, { recursive: true });
}
