import { NextResponse } from "next/server";
import { FINAL_STEP_PROMPT, FINAL_STEP_PROMPT_LATEX, RESCORE_PROMPT, SYSTEM_PROMPT } from "@/lib/defaults";
import { fail } from "@/lib/http";
import { LlmError, runClaude } from "@/lib/llm";

export const runtime = "nodejs";

interface StepBody {
  stepName: string;
  promptText?: string;
  isFinal?: boolean;
  isRescore?: boolean; // score the tailored resume against the JD
  jd: string;
  resume: string; // original resume (plain text, or LaTeX for the final LaTeX step)
  format?: "text" | "latex";
  tailored?: string; // rescore only: the final tailored resume
  tailoredFormat?: "text" | "latex";
  previous?: { name: string; output: string }[];
}

// Runs a single step. The browser calls this once per step, in order, to show progress.
export async function POST(req: Request) {
  let body: StepBody;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request body.");
  }
  const { stepName, jd, resume, isFinal, isRescore } = body;
  const latex = body.format === "latex";
  const task = isRescore ? RESCORE_PROMPT : isFinal ? (latex ? FINAL_STEP_PROMPT_LATEX : FINAL_STEP_PROMPT) : body.promptText?.trim();
  if (!jd?.trim()) return fail("Job description is empty.");
  if (!resume?.trim()) return fail("Resume is empty.");
  if (isRescore && !body.tailored?.trim()) return fail("Tailored resume is empty.");
  if (!task) return fail(`Prompt "${stepName}" is empty.`);

  const previous = (body.previous ?? [])
    .map((p, i) => `### Step ${i + 1}: ${p.name}\n${p.output}`)
    .join("\n\n");

  const tailoredLatex = body.tailoredFormat === "latex";
  const message = [
    `<job_description>\n${jd}\n</job_description>`,
    `<original_resume${latex ? ' format="latex"' : ""}>\nThis is the source of truth for all facts.${latex ? " It is LaTeX source; judge the content, not the markup." : ""}\n\n${resume}\n</original_resume>`,
    isRescore
      ? `<tailored_resume${tailoredLatex ? ' format="latex"' : ""}>\n${tailoredLatex ? "LaTeX source; judge the content, not the markup.\n\n" : ""}${body.tailored}\n</tailored_resume>`
      : "",
    previous ? `<previous_steps>\n${previous}\n</previous_steps>` : "",
    `<task name="${stepName}">\n${task}\n</task>`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const output = await runClaude(message, SYSTEM_PROMPT, req.signal);
    return NextResponse.json({ output });
  } catch (e) {
    return fail((e as Error).message, e instanceof LlmError ? 502 : 500);
  }
}
