import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { extractTextFromFile, fileExtension, UploadError } from "@/lib/extract";
import { fail, serverError } from "@/lib/http";
import { checkLatexDocument } from "@/lib/latexCheck";
import { getResumes, MASTER_DIR, newId, saveResumes } from "@/lib/store";
import type { MasterResume } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getResumes());
  } catch (e) {
    return serverError(e);
  }
}

// Save a new master resume (multipart form):
//  - plain resume:  "file" (PDF/DOCX/TXT), "name", "role"
//  - LaTeX resume:  "latex" (full .tex source), "pdf" (the compiled PDF of that .tex), "name", "role"
// Files are written with flag "wx", so an existing master resume is never overwritten.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const name = String(form.get("name") || "").trim();
    const role = String(form.get("role") || "").trim();
    const id = newId();
    const createdAt = new Date().toISOString();
    let resume: MasterResume;

    if (form.has("latex")) {
      const tex = String(form.get("latex") || "").replace(/\r\n/g, "\n").trim();
      const texError = checkLatexDocument(tex);
      if (texError) return fail(texError);
      const pdf = form.get("pdf");
      if (!(pdf instanceof File)) return fail("Add the PDF version of this resume too. It is used to compare against the job description.");
      if (fileExtension(pdf.name) !== ".pdf") return fail("The resume PDF must be a .pdf file.");
      const { text: pdfText, buffer: pdfBuffer } = await extractTextFromFile(pdf);

      const storedFile = `${id}.tex`;
      const pdfStoredFile = `${id}.pdf`;
      await fs.writeFile(path.join(MASTER_DIR, storedFile), tex, { encoding: "utf8", flag: "wx" });
      await fs.writeFile(path.join(MASTER_DIR, pdfStoredFile), pdfBuffer, { flag: "wx" });
      resume = {
        id,
        name: name || pdf.name.replace(/\.[^.]+$/, "") || "LaTeX resume",
        role,
        originalFileName: pdf.name,
        storedFile,
        text: tex,
        format: "latex",
        pdfText,
        pdfStoredFile,
        createdAt,
      };
    } else {
      const file = form.get("file");
      if (!(file instanceof File)) return fail("No file uploaded.");
      if (fileExtension(file.name) === ".tex") {
        return fail("For a .tex resume, use the “LaTeX (Overleaf)” tab so you can add its PDF too.");
      }
      const { text, buffer, ext } = await extractTextFromFile(file);
      const storedFile = `${id}${ext}`;
      await fs.writeFile(path.join(MASTER_DIR, storedFile), buffer, { flag: "wx" });
      resume = {
        id,
        name: name || file.name.replace(/\.[^.]+$/, ""),
        role,
        originalFileName: file.name,
        storedFile,
        text,
        format: "text",
        createdAt,
      };
    }

    const resumes = await getResumes();
    resumes.push(resume);
    await saveResumes(resumes);
    return NextResponse.json(resume, { status: 201 });
  } catch (e) {
    if (e instanceof UploadError) return fail(e.message);
    return serverError(e);
  }
}
