
export const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".tex"];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export class UploadError extends Error {}

export function fileExtension(name: string) {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

/** Validates an uploaded file and returns its plain text. Throws UploadError with a user-facing message. */
export async function extractTextFromFile(file: File): Promise<{ text: string; buffer: Buffer; ext: string }> {
  const ext = fileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new UploadError(`Unsupported file type "${ext || "none"}". Upload a PDF, DOCX, TXT, or TEX file.`);
  }
  if (file.size === 0) throw new UploadError("The file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("The file is larger than 10 MB.");

  const buffer = Buffer.from(await file.arrayBuffer());
  let text = "";
  try {
    if (ext === ".tex") {
      // LaTeX source is used as-is (no whitespace cleanup, which could change its meaning).
      const tex = buffer.toString("utf8").replace(/\r\n/g, "\n").trim();
      if (!tex) throw new UploadError("The file is empty.");
      return { text: tex, buffer, ext };
    }
    if (ext === ".txt") {
      text = buffer.toString("utf8");
    } else if (ext === ".docx") {
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer })).value;
    } else {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      text = (await extractText(pdf, { mergePages: true })).text;
    }
  } catch (err) {
    if (err instanceof UploadError) throw err;
    throw new UploadError(`Could not read the ${ext.slice(1).toUpperCase()} file. It may be corrupted or password-protected. (${(err as Error).message})`);
  }

  text = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) {
    throw new UploadError("No text could be extracted. If this is a scanned PDF, paste the text instead.");
  }
  return { text, buffer, ext };
}
