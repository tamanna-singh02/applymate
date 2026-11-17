import { promises as fs } from "fs";
import path from "path";
import { fail } from "@/lib/http";
import { SAFE_PDF_NAME } from "@/lib/naming";
import { OUTPUT_DIR } from "@/lib/store";

export const runtime = "nodejs";

// Opens a saved tailored resume (.pdf inline, .tex as a download). Linked from the Job Tracker.
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!SAFE_PDF_NAME.test(file)) return fail("Invalid file name.", 400);
  try {
    const bytes = await fs.readFile(path.join(OUTPUT_DIR, file));
    const isTex = file.endsWith(".tex");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": isTex ? "application/x-tex; charset=utf-8" : "application/pdf",
        "Content-Disposition": `${isTex ? "attachment" : "inline"}; filename="${file}"`,
      },
    });
  } catch {
    return fail("File not found. It may have been moved or deleted from output/tailored-resumes.", 404);
  }
}
