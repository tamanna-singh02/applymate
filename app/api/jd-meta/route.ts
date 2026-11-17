import { NextResponse } from "next/server";
import { fail } from "@/lib/http";
import { runClaude } from "@/lib/llm";

export const runtime = "nodejs";

function heuristic(jd: string) {
  const grab = (re: RegExp) => jd.match(re)?.[1]?.trim().replace(/[.,;]+$/, "") ?? "";
  const company =
    grab(/^\s*(?:company(?:\s*name)?|organi[sz]ation|employer)\s*[:\-]\s*(.+)$/im) ||
    grab(/\babout\s+([A-Z][\w&.\- ]{1,40}?)\s*(?:\n|:|$)/m) ||
    grab(/\b(?:at|join)\s+([A-Z][\w&.\-]+(?:\s+[A-Z][\w&.\-]+){0,3})\b/);
  const jobTitle =
    grab(/^\s*(?:job\s*title|position|role|designation)\s*[:\-]\s*(.+)$/im) ||
    grab(/^\s*([A-Z][^\n]{3,60}(?:engineer|developer|scientist|analyst|architect|lead|manager|intern)[^\n]{0,20})$/im);
  return { company, jobTitle };
}

export async function POST(req: Request) {
  const { jd } = await req.json().catch(() => ({ jd: "" }));
  if (!jd || typeof jd !== "string") return fail("Job description text is required.");
  const guess = heuristic(jd);

  try {
    const out = await runClaude(
      `Extract the hiring company's name and the job title from this job description.\nReply with JSON only, no code fences: {"company": "...", "jobTitle": "..."}. Use "" for anything not stated.\n\n<job_description>\n${jd.slice(0, 20000)}\n</job_description>`,
      "You extract structured fields from text. Output only valid JSON.",
      req.signal,
    );
    const json = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    return NextResponse.json({
      company: String(json.company || guess.company || "").trim(),
      jobTitle: String(json.jobTitle || guess.jobTitle || "").trim(),
      source: "ai",
    });
  } catch (e) {
    // AI detection is a convenience; fall back to the regex guess instead of failing.
    return NextResponse.json({ ...guess, source: "heuristic", warning: (e as Error).message });
  }
}
