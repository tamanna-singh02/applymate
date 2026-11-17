import { NextResponse } from "next/server";
import { extractTextFromFile, UploadError } from "@/lib/extract";
import { fail, serverError } from "@/lib/http";

export const runtime = "nodejs";

// Returns plain text from an uploaded PDF/DOCX/TXT without storing it (used for JDs and one-off resumes).
export async function POST(req: Request) {
  try {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return fail("No file uploaded.");
    const { text } = await extractTextFromFile(file);
    return NextResponse.json({ text, fileName: file.name });
  } catch (e) {
    if (e instanceof UploadError) return fail(e.message);
    return serverError(e);
  }
}
