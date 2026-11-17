"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { jsonInit } from "@/lib/client";

interface Props {
  value: string;
  onChange: (tex: string) => void;
  generated: string; // the AI's version, for "Revert"
  category: string;
}

/**
 * Side-by-side LaTeX editor: code on the left, compiled PDF on the right.
 * Recompile uses /api/latex?preview=1, which compiles without saving anything.
 */
export default function LatexEditor({ value, onChange, generated, category }: Props) {
  const [pdfUrl, setPdfUrl] = useState("");
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState("");
  const [log, setLog] = useState("");
  const [compiledText, setCompiledText] = useState<string | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const urlRef = useRef("");
  const valueRef = useRef(value);
  valueRef.current = value;

  const compile = useCallback(async () => {
    const tex = valueRef.current;
    if (!tex.trim()) return;
    setCompiling(true);
    setError("");
    setLog("");
    const started = Date.now();
    try {
      const res = await fetch("/api/latex?preview=1", jsonInit("POST", { tex, company: "", category }));
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Compile failed.");
        setLog(data.log || "");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setPdfUrl(url);
      setCompiledText(tex);
    } catch {
      setError("Could not reach the local server. Is `npm run dev` still running?");
    } finally {
      setSeconds(Math.round((Date.now() - started) / 100) / 10);
      setCompiling(false);
    }
  }, [category]);

  // Compile once when the editor first gets content.
  const didInitial = useRef(false);
  useEffect(() => {
    if (!didInitial.current && value.trim()) {
      didInitial.current = true;
      compile();
    }
  }, [value, compile]);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.key === "s")) {
      e.preventDefault();
      compile();
      return;
    }
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: s, selectionEnd: end } = el;
      onChange(value.slice(0, s) + "  " + value.slice(end));
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
    }
  };

  const goToLine = (line: number) => {
    const el = textRef.current;
    if (!el) return;
    const lines = value.split("\n");
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
    const end = start + (lines[line - 1]?.length ?? 0);
    el.focus();
    el.setSelectionRange(start, end);
    const lineHeight = 20; // matches leading-5
    el.scrollTop = Math.max(0, (line - 5) * lineHeight);
  };

  const errorLine = Number(log.match(/resume\.tex:(\d+):/)?.[1] || error.match(/l\.(\d+)/)?.[1] || 0) || null;
  const lineCount = value.split("\n").length;
  const dirty = compiledText !== null && compiledText !== value;
  const edited = generated !== "" && value !== generated;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={compile} disabled={compiling || !value.trim()}>
          {compiling ? "Compiling…" : "Recompile"}
        </button>
        <span className="text-xs text-slate-500">Ctrl+Enter or Ctrl+S</span>
        <span className="ml-auto flex items-center gap-3 text-xs">
          {compiling ? (
            <span className="text-blue-700">Compiling…</span>
          ) : error ? (
            <span className="font-medium text-red-700">Compile failed</span>
          ) : dirty ? (
            <span className="font-medium text-amber-700">Edited since last compile</span>
          ) : compiledText !== null ? (
            <span className="text-green-700">Up to date{seconds !== null && ` · compiled in ${seconds}s`}</span>
          ) : null}
          <button className="text-slate-600 underline" onClick={() => navigator.clipboard.writeText(value)}>
            Copy code
          </button>
          {edited && (
            <button
              className="text-slate-600 underline"
              onClick={() => confirm("Discard your edits and go back to the AI-generated .tex?") && onChange(generated)}
            >
              Revert to generated
            </button>
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {/* Code */}
        <div className="flex h-[75vh] overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
          <div
            ref={gutterRef}
            aria-hidden
            className="select-none overflow-hidden border-r border-slate-200 bg-slate-50 px-2 py-3 text-right font-mono text-xs leading-5 text-slate-400"
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i} className={errorLine === i + 1 ? "rounded bg-red-100 font-semibold text-red-700" : ""}>
                {i + 1}
              </div>
            ))}
          </div>
          <textarea
            ref={textRef}
            className="h-full flex-1 resize-none overflow-auto whitespace-pre bg-transparent px-3 py-3 font-mono text-xs leading-5 text-slate-800 outline-none"
            value={value}
            wrap="off"
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onScroll={(e) => {
              if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
            }}
          />
        </div>

        {/* PDF */}
        <div className="relative h-[75vh] overflow-hidden rounded-md border border-slate-300 bg-slate-100">
          {pdfUrl ? (
            <iframe title="Compiled resume" src={pdfUrl} className={`h-full w-full ${compiling ? "opacity-60" : ""}`} />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
              {compiling ? "Compiling…" : error ? "Fix the error and recompile to see the PDF." : "Click Recompile to see the PDF."}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div className="flex flex-wrap items-center gap-2">
            <span>{error}</span>
            {errorLine && (
              <button className="rounded border border-red-300 bg-white px-2 py-0.5 text-xs font-medium" onClick={() => goToLine(errorLine)}>
                Go to line {errorLine}
              </button>
            )}
          </div>
          {log && <pre className="mt-2 max-h-56 overflow-auto rounded bg-slate-900 p-3 font-mono text-xs text-slate-100">{log}</pre>}
        </div>
      )}
    </div>
  );
}
