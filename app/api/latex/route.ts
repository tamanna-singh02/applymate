import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { fail, serverError } from "@/lib/http";
import { compileLatex, LatexError } from "@/lib/latex";
import { buildPdfFileName } from "@/lib/naming";
import { ensureOutputDir, OUTPUT_DIR } from "@/lib/store";
import type { ResumeCategory } from "@/lib/types";

export const runtime = "nodejs";

// Compiles the edited LaTeX resume. Saves both .tex and .pdf to output/tailored-resumes
// and returns the PDF. With ?preview=1 it only compiles (nothing is written).
export async function POST(req: Request) {
  try {
    const preview = new URL(req.url).searchParams.get("preview") === "1";
    const { tex, company, category } = await req.json();
    if (!tex?.trim()) return fail("LaTeX source is empty.");
    if (!preview && !company?.trim()) return fail("Company name is required to name the files.");
    if (category !== "web_dev" && category !== "ai") return fail("Invalid resume category.");

    const { pdf, engine } = await compileLatex(tex);
    const pdfName = buildPdfFileName(category as ResumeCategory, company || "preview", "pdf");
    const texName = buildPdfFileName(category as ResumeCategory, company || "preview", "tex");
    if (!preview) {
      await ensureOutputDir();
      await fs.writeFile(path.join(OUTPUT_DIR, texName), tex, "utf8");
      await fs.writeFile(path.join(OUTPUT_DIR, pdfName), pdf);
    }

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${pdfName}"`,
        "X-File-Name": pdfName,
        "X-Tex-File-Name": texName,
        "X-Latex-Engine": engine,
      },
    });
  } catch (e) {
    if (e instanceof LatexError) return NextResponse.json({ error: e.message, log: e.log }, { status: 422 });
    return serverError(e);
  }
}
