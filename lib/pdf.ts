import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

/**
 * Renders the simple Markdown-like resume format produced by the final step:
 *   # Name            -> large bold name
 *   (line after name) -> contact line
 *   ## Section        -> section heading with rule
 *   ### Role line     -> bold sub-heading
 *   - bullet          -> indented bullet
 *   other text        -> paragraph
 * Inline **bold** and *italic* markers are stripped.
 */

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN_X = 50;
const MARGIN_TOP = 48;
const MARGIN_BOTTOM = 48;
const TEXT_W = PAGE_W - MARGIN_X * 2;
const DARK = rgb(0.1, 0.1, 0.12);
const ACCENT = rgb(0.15, 0.25, 0.45);

// Standard PDF fonts only cover WinAnsi. Map common Unicode punctuation and drop the rest.
const REPLACEMENTS: Record<string, string> = {
  "→": "->", "←": "<-", "≤": "<=", "≥": ">=", "≈": "~",
  "−": "-", "‐": "-", "‑": "-", " ": " ", " ": " ", " ": " ",
  "●": "•", "▪": "•", "◦": "•", "✓": "", "✔": "",
};

function makeSanitizer(font: PDFFont) {
  const cache = new Map<string, string>();
  return (s: string) =>
    Array.from(s)
      .map((ch) => {
        if (REPLACEMENTS[ch] !== undefined) return REPLACEMENTS[ch];
        if (ch === "\t") return " ";
        const hit = cache.get(ch);
        if (hit !== undefined) return hit;
        let out = ch;
        try {
          font.encodeText(ch);
        } catch {
          out = "";
        }
        cache.set(ch, out);
        return out;
      })
      .join("");
}

const stripInline = (s: string) =>
  s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1$2").replace(/`/g, "");

export async function renderResumePdf(source: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const clean = makeSanitizer(regular);

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_TOP;

  const ensure = (h: number) => {
    if (y - h < MARGIN_BOTTOM) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN_TOP;
    }
  };

  const wrap = (text: string, font: PDFFont, size: number, width: number): string[] => {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // Hard-break a single word that is wider than the line (e.g. a long URL).
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    if (line) lines.push(line);
    return lines;
  };

  const write = (text: string, opts: { font?: PDFFont; size?: number; indent?: number; color?: ReturnType<typeof rgb>; gap?: number; center?: boolean }) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    const lh = size * 1.32;
    for (const ln of wrap(clean(stripInline(text)), font, size, TEXT_W - indent)) {
      ensure(lh);
      const x = opts.center ? (PAGE_W - font.widthOfTextAtSize(ln, size)) / 2 : MARGIN_X + indent;
      page.drawText(ln, { x, y: y - size, size, font, color: opts.color ?? DARK });
      y -= lh;
    }
    y -= opts.gap ?? 0;
  };

  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let sawName = false;
  let afterName = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();
    if (!t) {
      y -= 3;
      afterName = false;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) continue; // horizontal rules

    if (/^#\s+/.test(t) && !sawName) {
      sawName = true;
      afterName = true;
      write(t.replace(/^#\s+/, ""), { font: bold, size: 20, center: true, gap: 2 });
      continue;
    }
    if (afterName && !/^#/.test(t)) {
      write(t, { size: 9.5, center: true, color: rgb(0.3, 0.3, 0.35), gap: 2 });
      continue;
    }
    afterName = false;

    if (/^#{1,2}\s+/.test(t)) {
      y -= 6;
      ensure(28);
      write(t.replace(/^#{1,2}\s+/, "").toUpperCase(), { font: bold, size: 11, color: ACCENT });
      page.drawLine({ start: { x: MARGIN_X, y: y + 2 }, end: { x: PAGE_W - MARGIN_X, y: y + 2 }, thickness: 0.7, color: ACCENT });
      y -= 5;
      continue;
    }
    if (/^#{3,}\s+/.test(t)) {
      y -= 2;
      ensure(30);
      write(t.replace(/^#{3,}\s+/, ""), { font: bold, size: 10.5, gap: 1 });
      continue;
    }
    const bullet = t.match(/^([-*•]|\d+\.)\s+(.*)$/);
    if (bullet) {
      const size = 10;
      const lh = size * 1.32;
      const textLines = wrap(clean(stripInline(bullet[2])), regular, size, TEXT_W - 14);
      textLines.forEach((ln, i) => {
        ensure(lh);
        if (i === 0) page.drawText("•", { x: MARGIN_X + 3, y: y - size, size, font: regular, color: DARK });
        page.drawText(ln, { x: MARGIN_X + 14, y: y - size, size, font: regular, color: DARK });
        y -= lh;
      });
      y -= 1.5;
      continue;
    }
    // "Label: value" lines (e.g. skills) get a bold label.
    const label = t.match(/^\**([A-Za-z][A-Za-z0-9 &/+.-]{1,40}):\**\s+(.+)$/);
    if (label) {
      const size = 10;
      const lh = size * 1.32;
      const head = clean(`${label[1]}: `);
      const headW = bold.widthOfTextAtSize(head, size);
      const body = wrap(clean(stripInline(label[2])), regular, size, TEXT_W - headW);
      ensure(lh);
      page.drawText(head, { x: MARGIN_X, y: y - size, size, font: bold, color: DARK });
      body.forEach((ln, i) => {
        if (i > 0) ensure(lh);
        page.drawText(ln, { x: MARGIN_X + (i === 0 ? headW : 0), y: y - size, size, font: regular, color: DARK });
        y -= lh;
      });
      if (!body.length) y -= lh;
      y -= 1;
      continue;
    }
    write(t, { size: 10, gap: 2 });
  }

  doc.setTitle("Resume");
  doc.setCreator("Resume Tailor (local)");
  return doc.save();
}
