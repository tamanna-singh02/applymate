import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { checkLatexDocument } from "./latexCheck";

export class LatexError extends Error {
  constructor(message: string, public log = "") {
    super(message);
  }
}

/** fontspec / unicode-math need XeLaTeX; everything else uses pdfLaTeX (Overleaf's default). */
export function pickEngine(tex: string): "pdflatex" | "xelatex" {
  if (process.env.LATEX_ENGINE === "xelatex" || process.env.LATEX_ENGINE === "pdflatex") return process.env.LATEX_ENGINE;
  return /\\usepackage(\[[^\]]*\])?\{(fontspec|unicode-math|polyglossia)\}|\\setmainfont/.test(tex) ? "xelatex" : "pdflatex";
}

const lastLines = (text: string, n: number) =>
  text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(-n)
    .join("\n");

let miktexCheck: Promise<boolean> | null = null;

/** MiKTeX needs -enable-installer so missing packages install without a (hidden) confirmation dialog. */
function isMiktex(bin: string): Promise<boolean> {
  miktexCheck ??= new Promise((resolve) => {
    const child = spawn(bin, ["--version"], { windowsHide: true });
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.on("error", () => resolve(false));
    child.on("close", () => resolve(/MiKTeX/i.test(out)));
  });
  return miktexCheck;
}

function runEngine(bin: string, dir: string, timeoutMs: number, miktex: boolean): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    // -no-shell-escape: never let the document run shell commands.
    const args = ["-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", "-file-line-error"];
    if (miktex) args.push("-enable-installer");
    const child = spawn(bin, [...args, "resume.tex"], { cwd: dir, windowsHide: true });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => chunks.push(d));
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new LatexError(
          `LaTeX compile timed out after ${timeoutMs / 1000}s. MiKTeX may still be downloading packages for this template. Wait a minute and try again.`,
          lastLines(Buffer.concat(chunks).toString("utf8"), 20),
        ),
      );
    }, timeoutMs);
    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        new LatexError(
          err.code === "ENOENT"
            ? `Could not find "${bin}". Install MiKTeX or TeX Live, or set LATEX_BIN_DIR in .env.local.`
            : `Could not start ${bin}: ${err.message}`,
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, output: Buffer.concat(chunks).toString("utf8") });
    });
  });
}

const TEX_ERROR_LINE = /^!|^[^\s]+\.tex:\d+:/;

/** Pulls the useful part out of a TeX log: the first "!" or "file:line:" error, plus context. */
function summarizeLog(log: string): string {
  const lines = log.split(/\r?\n/);
  const idx = lines.findIndex((l) => TEX_ERROR_LINE.test(l));
  if (idx === -1) return lines.slice(-25).join("\n");
  return lines.slice(idx, idx + 12).join("\n");
}

/** Compiles a single-file LaTeX document in a temp folder and returns the PDF bytes. */
export async function compileLatex(tex: string): Promise<{ pdf: Buffer; engine: string }> {
  const problem = checkLatexDocument(tex);
  if (problem) throw new LatexError(problem);
  const engine = pickEngine(tex);
  const bin = process.env.LATEX_BIN_DIR ? path.join(process.env.LATEX_BIN_DIR, engine) : engine;
  const timeoutMs = (Number(process.env.LATEX_TIMEOUT_SECONDS) || 240) * 1000;

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "resume-tex-"));
  try {
    const miktex = await isMiktex(bin);
    await fs.writeFile(path.join(dir, "resume.tex"), tex, "utf8");
    let run = await runEngine(bin, dir, timeoutMs, miktex);
    let log = await fs.readFile(path.join(dir, "resume.log"), "utf8").catch(() => "");
    if (run.code === 0 && /Rerun to get|Label\(s\) may have changed/.test(log)) {
      run = await runEngine(bin, dir, timeoutMs, miktex);
      log = await fs.readFile(path.join(dir, "resume.log"), "utf8").catch(() => "");
    }
    const pdf = await fs.readFile(path.join(dir, "resume.pdf")).catch(() => null);
    if (run.code !== 0 || !pdf) {
      if (log.split(/\r?\n/).some((l) => TEX_ERROR_LINE.test(l))) {
        throw new LatexError(`LaTeX compile failed (${engine}). Fix the error below and try again.`, summarizeLog(log));
      }
      // No TeX error in the log: usually a package that could not be installed, or the engine itself failed.
      throw new LatexError(
        `LaTeX stopped without a LaTeX error (${engine}). This usually means a package the template needs is missing and could not be installed. Open MiKTeX Console, check for updates, set "Install missing packages" to Always, then try again.`,
        lastLines(run.output, 20) || summarizeLog(log),
      );
    }
    return { pdf, engine };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
