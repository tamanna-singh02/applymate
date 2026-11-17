import { promises as fs } from "fs";
import path from "path";
import { fail, serverError } from "@/lib/http";
import { buildPdfFileName } from "@/lib/naming";
import { renderResumePdf } from "@/lib/pdf";
import { ensureOutputDir, OUTPUT_DIR } from "@/lib/store";
import type { ResumeCategory } from "@/lib/types";

export const runtime = "nodejs";

// Renders the edited resume to PDF, saves it in output/tailored-resumes, and returns the file.
// With ?preview=1 it only renders (nothing is written to disk).
export async function POST(req: Request) {
  try {
    const preview = new URL(req.url).searchParams.get("preview") === "1";
    const { text, company, category } = await req.json();
    if (!text?.trim()) return fail("Resume text is empty.");
    if (!preview && !company?.trim()) return fail("Company name is required to name the PDF.");
    if (category !== "web_dev" && category !== "ai") return fail("Invalid resume category.");

    const fileName = buildPdfFileName(category as ResumeCategory, company || "preview");
    const bytes = await renderResumePdf(text);
    if (!preview) {
      await ensureOutputDir();
      // Output folder only. Master resumes live in uploads/ and are never written here.
      await fs.writeFile(path.join(OUTPUT_DIR, fileName), bytes);
    }

    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${fileName}"`,
        "X-File-Name": fileName,
      },
    });
  } catch (e) {
    return serverError(e);
  }
}
