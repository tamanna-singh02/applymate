// Shared by client and server.

/** Returns an error message if the text is not a complete single LaTeX document, else null. */
export function checkLatexDocument(tex: string): string | null {
  const begin = tex.indexOf("\\begin{document}");
  const end = tex.lastIndexOf("\\end{document}");
  if (!tex.includes("\\documentclass")) return "The LaTeX is missing \\documentclass.";
  if (begin === -1) return "The LaTeX is missing \\begin{document}. The paste may have been cut off. Copy the whole file again.";
  if (end === -1 || end < begin) return "The LaTeX is missing \\end{document}. The paste may have been cut off. Copy the whole file again.";
  if (tex.slice(begin + 16, end).trim().length < 50) return "The LaTeX document body is empty.";
  return null;
}
