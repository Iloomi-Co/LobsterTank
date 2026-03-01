import plist from "plist";
import { readTextFile } from "./file-reader.js";

export interface PlistData {
  Label?: string;
  ProgramArguments?: string[];
  RunAtLoad?: boolean;
  KeepAlive?: boolean | Record<string, unknown>;
  StandardOutPath?: string;
  StandardErrorPath?: string;
  EnvironmentVariables?: Record<string, string>;
  [key: string]: unknown;
}

export async function parsePlistFile(path: string): Promise<{ data: PlistData | null; error: string | null }> {
  const { data: content, error } = await readTextFile(path);
  if (error || !content) {
    return { data: null, error: error ?? "Empty file" };
  }
  try {
    const parsed = plist.parse(content) as PlistData;
    return { data: parsed, error: null };
  } catch (e: any) {
    return { data: null, error: `Plist parse error: ${e.message}` };
  }
}
