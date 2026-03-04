import { execFile as nodeExecFile } from "child_process";
import { basename } from "path";
import { ALLOWED_BINARIES, COMMAND_TIMEOUT_MS } from "../config.js";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function safeExec(
  binary: string,
  args: string[] = [],
  options: { timeout?: number; env?: Record<string, string> } = {}
): Promise<ExecResult> {
  const name = basename(binary);
  if (!ALLOWED_BINARIES.has(name)) {
    return Promise.reject(new Error(`Binary not in allowlist: ${name}`));
  }

  // Note: execFile does NOT invoke a shell, so args are passed directly
  // to the process — no shell injection risk. The binary allowlist above
  // is the security gate.

  const timeout = options.timeout ?? COMMAND_TIMEOUT_MS;

  return new Promise((resolve) => {
    nodeExecFile(
      binary,
      args,
      {
        timeout,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, ...options.env },
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: typeof stdout === "string" ? stdout : "",
          stderr: typeof stderr === "string" ? stderr : "",
          exitCode: error ? (error as NodeJS.ErrnoException & { code?: number | string }).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
            ? -2
            : (error as any).status ?? 1
            : 0,
        });
      }
    );
  });
}
