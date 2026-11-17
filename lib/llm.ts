import { spawn } from "child_process";
import os from "os";

export class LlmError extends Error {}

/**
 * Runs one prompt through the local Claude Code CLI in headless mode (`claude -p`).
 * The prompt goes over stdin (avoids Windows command-line length limits), all tools are
 * disabled so the model only reads and writes text, and the default Claude Code system
 * prompt is replaced with ours.
 */
export function runClaude(prompt: string, systemPrompt: string, signal?: AbortSignal): Promise<string> {
  const bin = process.env.CLAUDE_CLI_PATH || "claude";
  const timeoutMs = (Number(process.env.CLAUDE_TIMEOUT_SECONDS) || 600) * 1000;

  const args = [
    "-p",
    "--output-format", "text",
    "--tools", "",
    "--no-session-persistence",
    "--system-prompt", systemPrompt,
  ];
  if (process.env.CLAUDE_MODEL) args.push("--model", process.env.CLAUDE_MODEL);

  return new Promise((resolve, reject) => {
    // Run from the OS temp dir so the CLI does not pick up this project's CLAUDE.md or settings.
    const child = spawn(bin, args, { cwd: os.tmpdir(), windowsHide: true });
    // Collect raw bytes and decode once; decoding per chunk corrupts multi-byte characters split across chunks.
    const out: Buffer[] = [];
    const errOut: Buffer[] = [];
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new LlmError(`Claude CLI timed out after ${timeoutMs / 1000}s.`)));
    }, timeoutMs);

    const onAbort = () => {
      child.kill();
      finish(() => reject(new LlmError("Cancelled.")));
    };
    signal?.addEventListener("abort", onAbort);

    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => errOut.push(d));

    child.on("error", (err: NodeJS.ErrnoException) => {
      const msg =
        err.code === "ENOENT"
          ? `Could not find the Claude Code CLI ("${bin}"). Install Claude Code and log in, or set CLAUDE_CLI_PATH in .env.local.`
          : `Could not start Claude CLI: ${err.message}`;
      finish(() => reject(new LlmError(msg)));
    });

    child.on("close", (code) => {
      finish(() => {
        const stdout = Buffer.concat(out).toString("utf8").trim();
        const stderr = Buffer.concat(errOut).toString("utf8").trim();
        if (code === 0 && stdout) return resolve(stdout);
        const detail = (stderr || stdout || `exit code ${code}`).slice(0, 800);
        reject(new LlmError(`Claude CLI failed: ${detail}`));
      });
    });

    child.stdin.on("error", () => {}); // process may exit before stdin drains; handled by "close"
    child.stdin.end(prompt, "utf8");
  });
}
