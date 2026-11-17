import type { ResumeCategory } from "./types";

// Shared by client and server.

const AI_PATTERN = /\b(ai|a\.i\.|ml|machine learning|deep learning|llm|genai|gen ai|generative|nlp|computer vision|data scien\w*|mlops)\b/i;

/** Best guess from the job title. The user can override it in the UI before downloading. */
export function detectCategory(jobTitle: string): ResumeCategory {
  return AI_PATTERN.test(jobTitle) ? "ai" : "web_dev";
}

/** "Tata Consultancy Services (TCS)" -> "tataconsultancyservicestcs" */
export function normalizeCompany(company: string): string {
  const slug = company
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return slug || "company";
}

export function buildPdfFileName(category: ResumeCategory, company: string, ext: "pdf" | "tex" = "pdf"): string {
  return `tamanna_${category}_${normalizeCompany(company)}.${ext}`;
}

/** Only allow the names this app generates; blocks path traversal in download/save routes. */
export const SAFE_PDF_NAME = /^tamanna_(web_dev|ai)_[a-z0-9]+\.(pdf|tex)$/;

/** Trims anything the model wrote around the LaTeX document. */
export function extractLatexDocument(s: string): string {
  const start = s.indexOf("\\documentclass");
  const endTag = "\\end{document}";
  const end = s.lastIndexOf(endTag);
  if (start === -1 || end === -1 || end < start) return s.replace(/^```\w*\n?|\n?```$/g, "").trim();
  return s.slice(start, end + endTag.length);
}

/** Finds "Match Score: 82/100" (or similar) in model output. */
export function parseMatchScore(text: string): number | null {
  const m =
    text.match(/match\s*score[^0-9\n]{0,20}(\d{1,3})\s*(?:\/\s*100|out of 100|%)?/i) ||
    text.match(/\b(\d{1,3})\s*\/\s*100\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 100 ? n : null;
}
