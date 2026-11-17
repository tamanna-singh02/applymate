"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ApplicationForm, { emptyDraft, type AppDraft } from "@/components/ApplicationForm";
import LatexEditor from "@/components/LatexEditor";
import Markdown from "@/components/Markdown";
import PromptList, { usePrompts } from "@/components/PromptList";
import { addDays, api, jsonInit, today, triggerDownload } from "@/lib/client";
import { FINAL_STEP_NAME, RESCORE_STEP_NAME } from "@/lib/defaults";
import { checkLatexDocument } from "@/lib/latexCheck";
import { buildPdfFileName, detectCategory, extractLatexDocument, parseMatchScore } from "@/lib/naming";
import type { MasterResume, ResumeCategory, ResumeFormat } from "@/lib/types";

type StepStatus = "pending" | "running" | "done" | "error" | "skipped";
interface Step {
  name: string;
  promptText?: string;
  isFinal?: boolean;
  isRescore?: boolean;
  status: StepStatus;
  output: string;
  error?: string;
  seconds?: number;
}

const ACCEPT = ".pdf,.docx,.txt";
const RESUME_ACCEPT = ".pdf,.docx,.txt,.tex"; // .tex is redirected to the LaTeX tab
const STORAGE_KEY = "resume-tailor:session";

const isLatexFile = (f: File) => f.name.toLowerCase().endsWith(".tex");

class CompileError extends Error {
  constructor(message: string, public log = "") {
    super(message);
  }
}

function ErrorBox({ msg }: { msg: string }) {
  if (!msg) return null;
  return <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{msg}</div>;
}

async function uploadForText(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  return (await api<{ text: string }>("/api/extract", { method: "POST", body: fd })).text;
}

const scoreTone = (n: number) =>
  n >= 75 ? "bg-green-100 text-green-800 ring-green-200" : n >= 50 ? "bg-amber-100 text-amber-800 ring-amber-200" : "bg-red-100 text-red-800 ring-red-200";

function ScoreBadge({ label, score, pending }: { label: string; score: number | null; pending?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold ring-1 ${
          score !== null ? scoreTone(score) : "bg-white text-slate-400 ring-slate-200"
        } ${pending ? "animate-pulse" : ""}`}
      >
        {score ?? (pending ? "…" : "–")}
      </div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

/** Before/after match score, shown above the step results and the final resume. */
function ScoreComparison(props: {
  before: number | null;
  after: number | null;
  pending?: boolean;
  stale?: boolean;
  onRescore?: () => void;
  rescoring?: boolean;
}) {
  const { before, after, pending, stale, onRescore, rescoring } = props;
  const delta = before !== null && after !== null ? after - before : null;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <ScoreBadge label="Original" score={before} />
      <div className="text-2xl text-slate-300">→</div>
      <ScoreBadge label="Tailored" score={after} pending={pending || rescoring} />
      <div className="min-w-0 flex-1">
        {delta !== null ? (
          <>
            <div className={`text-lg font-semibold ${delta > 0 ? "text-green-700" : delta < 0 ? "text-red-700" : "text-slate-700"}`}>
              {delta > 0 ? `+${delta}` : delta} points
            </div>
            <div className="text-xs text-slate-500">
              Match score out of 100, before and after tailoring. Both scores are AI estimates and can vary between runs.
            </div>
          </>
        ) : pending || rescoring ? (
          <div className="text-sm text-slate-500">Scoring the tailored resume…</div>
        ) : (
          <div className="text-sm text-slate-500">Not scored yet. Click “Score tailored resume” to rate it against the job description.</div>
        )}
        {stale && !rescoring && <div className="mt-1 text-xs font-medium text-amber-700">You edited the resume after it was scored.</div>}
      </div>
      {onRescore && (
        <button className="btn" onClick={onRescore} disabled={rescoring}>
          {rescoring ? "Scoring…" : after === null ? "Score tailored resume" : stale ? "Re-score edited resume" : "Re-score"}
        </button>
      )}
    </div>
  );
}

export default function TailorPage() {
  // Job description
  const [jd, setJd] = useState("");
  const [jdError, setJdError] = useState("");
  const [jdBusy, setJdBusy] = useState(false);
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [metaBusy, setMetaBusy] = useState(false);
  const [metaNote, setMetaNote] = useState("");

  // Resume
  const [resumes, setResumes] = useState<MasterResume[]>([]);
  const [resumeMode, setResumeMode] = useState<"saved" | "upload" | "latex">("saved");
  const [selectedId, setSelectedId] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeFormat, setResumeFormat] = useState<ResumeFormat>("text");
  const [resumePdfText, setResumePdfText] = useState(""); // LaTeX resumes: text of the uploaded PDF, used for analysis
  const [pasteTex, setPasteTex] = useState("");
  const [texPdfFile, setTexPdfFile] = useState<File | null>(null);
  const [upName, setUpName] = useState("");
  const [upRole, setUpRole] = useState("");
  const [saveAsMaster, setSaveAsMaster] = useState(true);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const [showResumeText, setShowResumeText] = useState(false);

  // Prompts + run
  const { prompts, loading: promptsLoading, error: promptsError, save: savePrompts } = usePrompts();
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [activeResult, setActiveResult] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [generatedResume, setGeneratedResume] = useState(""); // AI output before manual edits
  const [scoredResume, setScoredResume] = useState(""); // the final-resume text the "after" score was computed on
  const [rescoring, setRescoring] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Output
  const [finalResume, setFinalResume] = useState("");
  const [outputFormat, setOutputFormat] = useState<ResumeFormat>("text"); // format of finalResume
  const [compileLog, setCompileLog] = useState("");
  const [savedTex, setSavedTex] = useState("");
  const [category, setCategory] = useState<ResumeCategory>("web_dev");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [savedFile, setSavedFile] = useState("");
  const [trackerDraft, setTrackerDraft] = useState<AppDraft | null>(null);
  const [trackerMsg, setTrackerMsg] = useState("");

  const [hydrated, setHydrated] = useState(false);

  // Load master resumes and restore the last session (so switching pages doesn't lose work).
  useEffect(() => {
    api<MasterResume[]>("/api/resumes")
      .then((list) => {
        setResumes(list);
        if (!list.length) setResumeMode("upload");
      })
      .catch((e) => setResumeError(e.message));
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (s) {
        setJd(s.jd ?? "");
        setCompany(s.company ?? "");
        setJobTitle(s.jobTitle ?? "");
        setSelectedId(s.selectedId ?? "");
        setResumeText(s.resumeText ?? "");
        setResumeFormat(s.resumeFormat === "latex" ? "latex" : "text");
        setResumePdfText(s.resumePdfText ?? "");
        setOutputFormat(s.outputFormat === "latex" ? "latex" : "text");
        setSavedTex(s.savedTex ?? "");
        setScoredResume(s.scoredResume ?? "");
        setGeneratedResume(s.generatedResume ?? s.finalResume ?? "");
        setSteps((s.steps ?? []).map((st: Step) => (st.status === "running" || st.status === "pending" ? { ...st, status: "skipped" } : st)));
        setFinalResume(s.finalResume ?? "");
        setCategory(s.category ?? "web_dev");
        setCategoryTouched(Boolean(s.categoryTouched));
        setSavedFile(s.savedFile ?? "");
      }
    } catch {
      /* ignore corrupt local state */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return; // never write before the saved session has been loaded
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ jd, company, jobTitle, selectedId, resumeText, resumeFormat, resumePdfText, steps, finalResume, outputFormat, category, categoryTouched, savedFile, savedTex, scoredResume, generatedResume }),
      );
    } catch {
      /* storage full or blocked; not critical */
    }
  }, [hydrated, jd, company, jobTitle, selectedId, resumeText, resumeFormat, resumePdfText, steps, finalResume, outputFormat, category, categoryTouched, savedFile, savedTex, scoredResume, generatedResume]);

  // Auto-pick the file-name category from the job title until the user picks one manually.
  useEffect(() => {
    if (!categoryTouched) setCategory(detectCategory(jobTitle));
  }, [jobTitle, categoryTouched]);

  // ---------- Job description ----------
  const detectMeta = async (text: string) => {
    if (!text.trim()) return;
    setMetaBusy(true);
    setMetaNote("");
    try {
      const r = await api<{ company: string; jobTitle: string; source: string; warning?: string }>("/api/jd-meta", jsonInit("POST", { jd: text }));
      if (r.company) setCompany(r.company);
      if (r.jobTitle) setJobTitle(r.jobTitle);
      if (!r.company || !r.jobTitle) setMetaNote("Some fields could not be detected. Please fill them in.");
      else if (r.source === "heuristic") setMetaNote("AI detection unavailable; used a basic text match. Please check.");
    } catch (e) {
      setMetaNote((e as Error).message);
    } finally {
      setMetaBusy(false);
    }
  };

  const onJdFile = async (file?: File) => {
    if (!file) return;
    setJdError("");
    setJdBusy(true);
    try {
      const text = await uploadForText(file);
      setJd(text);
      detectMeta(text);
    } catch (e) {
      setJdError((e as Error).message);
    } finally {
      setJdBusy(false);
    }
  };

  // ---------- Resume ----------
  const selectSaved = (id: string) => {
    const r = resumes.find((x) => x.id === id);
    setSelectedId(id);
    setResumeText(r?.text ?? "");
    setResumeFormat(r?.format === "latex" ? "latex" : "text");
    setResumePdfText(r?.pdfText ?? "");
  };

  const onResumeFile = async (file?: File) => {
    if (!file) return;
    if (isLatexFile(file)) {
      setResumeMode("latex");
      setPasteTex(await file.text());
      return setResumeError("Loaded the .tex here. Now add its PDF version, then click “Use this LaTeX resume”.");
    }
    setResumeError("");
    setResumeBusy(true);
    try {
      if (saveAsMaster) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("name", upName);
        fd.append("role", upRole);
        const r = await api<MasterResume>("/api/resumes", { method: "POST", body: fd });
        setResumes((prev) => [...prev, r]);
        setResumeMode("saved");
        setSelectedId(r.id);
        setResumeText(r.text);
        setResumeFormat("text");
        setResumePdfText("");
        setUpName("");
        setUpRole("");
      } else {
        setSelectedId("");
        setResumeText(await uploadForText(file));
        setResumeFormat("text");
        setResumePdfText("");
      }
    } catch (e) {
      setResumeError((e as Error).message);
    } finally {
      setResumeBusy(false);
    }
  };

  const loadTexFile = async (file?: File) => {
    if (!file) return;
    if (!isLatexFile(file)) return setResumeError("Choose a .tex file.");
    if (file.size > 2 * 1024 * 1024) return setResumeError("The .tex file is larger than 2 MB.");
    setResumeError("");
    setPasteTex(await file.text());
  };

  const usePastedLatex = async () => {
    const tex = pasteTex.replace(/\r\n/g, "\n").trim();
    const problem = checkLatexDocument(tex);
    if (problem) return setResumeError(`${problem} In Overleaf: open main.tex, press Ctrl+A, then Ctrl+C.`);
    if (!texPdfFile) return setResumeError("Add the PDF version of this resume (Overleaf: Download PDF). It is what gets compared with the job description.");
    if (!texPdfFile.name.toLowerCase().endsWith(".pdf")) return setResumeError("The resume PDF must be a .pdf file.");
    setResumeError("");
    setResumeBusy(true);
    try {
      if (saveAsMaster) {
        const fd = new FormData();
        fd.append("latex", tex);
        fd.append("pdf", texPdfFile);
        fd.append("name", upName);
        fd.append("role", upRole);
        const r = await api<MasterResume>("/api/resumes", { method: "POST", body: fd });
        setResumes((prev) => [...prev, r]);
        setResumeMode("saved");
        setSelectedId(r.id);
        setResumeText(r.text);
        setResumePdfText(r.pdfText ?? "");
      } else {
        setSelectedId("");
        setResumeText(tex);
        setResumePdfText(await uploadForText(texPdfFile));
      }
      setResumeFormat("latex");
      setPasteTex("");
      setTexPdfFile(null);
      setUpName("");
      setUpRole("");
    } catch (e) {
      setResumeError((e as Error).message);
    } finally {
      setResumeBusy(false);
    }
  };

  const deleteMaster = async (r: MasterResume) => {
    if (!confirm(`Delete master resume "${r.name}"? The stored file will be removed.`)) return;
    try {
      await api(`/api/resumes/${r.id}`, { method: "DELETE" });
      setResumes((prev) => prev.filter((x) => x.id !== r.id));
      if (selectedId === r.id) {
        setSelectedId("");
        setResumeText("");
      }
    } catch (e) {
      setResumeError((e as Error).message);
    }
  };

  // ---------- Generate ----------
  const enabledPrompts = prompts.filter((p) => p.enabled);
  const latexMissingPdf = resumeFormat === "latex" && resumeText.trim().length > 0 && !resumePdfText.trim();
  const canGenerate = !running && jd.trim().length > 0 && resumeText.trim().length > 0 && !latexMissingPdf;

  // Original resume as plain text: what the analysis and scoring steps read.
  const analysisResume = () => (resumeFormat === "latex" ? resumePdfText : resumeText);

  const rescoreBody = (tailored: string, tailoredFormat: ResumeFormat, done: { name: string; output: string }[]) => ({
    stepName: RESCORE_STEP_NAME,
    isRescore: true,
    jd,
    resume: analysisResume(),
    format: "text",
    tailored,
    tailoredFormat,
    // Give it the first analysis (which holds the original score) so both scores use the same yardstick.
    previous: done.slice(0, 1),
  });

  const generate = async () => {
    setRunError("");
    setTrackerDraft(null);
    setTrackerMsg("");
    setSavedFile("");
    setSavedTex("");
    setCompileLog("");
    setPdfError("");
    setScoredResume("");
    const format = resumeFormat;
    const plan: Step[] = [
      ...enabledPrompts.map((p) => ({ name: p.name, promptText: p.text, status: "pending" as StepStatus, output: "" })),
      { name: format === "latex" ? `${FINAL_STEP_NAME} (LaTeX)` : FINAL_STEP_NAME, isFinal: true, status: "pending", output: "" },
      { name: RESCORE_STEP_NAME, isRescore: true, status: "pending", output: "" },
    ];
    setSteps(plan);
    setActiveResult(null);
    setFinalResume("");
    setOutputFormat(format);
    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const done: { name: string; output: string }[] = [];
    let finalText = "";
    try {
      for (let i = 0; i < plan.length; i++) {
        const step = plan[i];
        setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, status: "running" } : s)));
        const started = Date.now();
        try {
          const body = step.isRescore
            ? rescoreBody(finalText, format, done.slice(0, enabledPrompts.length))
            : format === "latex" && !step.isFinal
              ? // LaTeX resumes: analysis steps read the PDF text; only the final step edits the .tex source.
                { stepName: step.name, promptText: step.promptText, jd, resume: resumePdfText, format: "text", previous: done }
              : { stepName: step.name, promptText: step.promptText, isFinal: step.isFinal, jd, resume: resumeText, format, previous: done };
          const { output } = await api<{ output: string }>("/api/llm", { ...jsonInit("POST", body), signal: ctrl.signal });
          const seconds = Math.round((Date.now() - started) / 1000);
          done.push({ name: step.name, output });
          setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, status: "done", output, seconds } : s)));
          if (step.isFinal) {
            finalText = format === "latex" ? extractLatexDocument(output) : output.replace(/^```\w*\n?|\n?```$/g, "").trim();
            setFinalResume(finalText);
            setGeneratedResume(finalText);
          }
          if (step.isRescore) setScoredResume(finalText);
        } catch (e) {
          const msg = (e as Error).name === "AbortError" ? "Cancelled." : (e as Error).message;
          setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, status: "error", error: msg } : j > i ? { ...s, status: "skipped" } : s)));
          setRunError(`Stopped at "${step.name}": ${msg}`);
          return;
        }
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  // Re-score the final resume after manual edits.
  // Score (or re-score) the current final resume. Also works for results generated before scoring existed.
  const rescore = async () => {
    if (!finalResume.trim()) return;
    const existing = steps.findIndex((s) => s.isRescore);
    const idx = existing === -1 ? steps.length : existing;
    setRunError("");
    setRescoring(true);
    setSteps((prev) =>
      existing === -1
        ? [...prev, { name: RESCORE_STEP_NAME, isRescore: true, status: "running", output: "" }]
        : prev.map((s, j) => (j === idx ? { ...s, status: "running", error: undefined } : s)),
    );
    const started = Date.now();
    const text = finalResume;
    try {
      const done = steps.filter((s) => !s.isFinal && !s.isRescore && s.status === "done").map((s) => ({ name: s.name, output: s.output }));
      const { output } = await api<{ output: string }>("/api/llm", jsonInit("POST", rescoreBody(text, outputFormat, done)));
      const seconds = Math.round((Date.now() - started) / 1000);
      setSteps((prev) => prev.map((s, j) => (j === idx ? { ...s, status: "done", output, seconds } : s)));
      setScoredResume(text);
    } catch (e) {
      const msg = (e as Error).message;
      setSteps((prev) => prev.map((s, j) => (j === idx ? { ...s, status: "error", error: msg } : s)));
      setRunError(`Re-scoring failed: ${msg}`);
    } finally {
      setRescoring(false);
    }
  };

  // Completed prompt steps (not the final resume), shown as tabs.
  const resultSteps = steps.map((step, index) => ({ step, index })).filter(({ step }) => step.status === "done" && !step.isFinal);
  const shownResult = resultSteps.find((r) => r.index === activeResult) ?? resultSteps[0] ?? null;

  const copyText = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked; ignore */
    }
  };

  // "Before" = first score found in the analysis prompts; "after" = the score of the tailored resume.
  const matchScore = steps.map((s) => (s.status === "done" && !s.isFinal && !s.isRescore ? parseMatchScore(s.output) : null)).find((n) => n !== null) ?? null;
  const rescoreStep = steps.find((s) => s.isRescore);
  const afterScore = rescoreStep?.status === "done" ? parseMatchScore(rescoreStep.output) : null;
  const scoreStale = afterScore !== null && scoredResume !== "" && scoredResume !== finalResume;

  // ---------- PDF / LaTeX ----------
  const isLatexOut = outputFormat === "latex";
  const fileName = buildPdfFileName(category, company || "companyname");
  const texFileName = buildPdfFileName(category, company || "companyname", "tex");

  // Text resumes are rendered by /api/pdf; LaTeX resumes are compiled by /api/latex (which also saves the .tex).
  const requestPdf = async (preview: boolean) => {
    const url = isLatexOut ? "/api/latex" : "/api/pdf";
    const body = isLatexOut ? { tex: finalResume, company, category } : { text: finalResume, company, category };
    const res = await fetch(`${url}${preview ? "?preview=1" : ""}`, jsonInit("POST", body));
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new CompileError(data.error || "PDF generation failed.", data.log || "");
    }
    return { blob: await res.blob(), name: res.headers.get("X-File-Name") || fileName, texName: res.headers.get("X-Tex-File-Name") || "" };
  };

  const showError = (e: unknown) => {
    setPdfError((e as Error).message);
    setCompileLog(e instanceof CompileError ? e.log : "");
  };

  const download = async () => {
    if (!company.trim()) return setPdfError("Enter the company name first; it is used in the file name.");
    setPdfError("");
    setCompileLog("");
    setPdfBusy(true);
    try {
      const { blob, name, texName } = await requestPdf(false);
      setSavedFile(name);
      setSavedTex(texName);
      triggerDownload(blob, name);
    } catch (e) {
      showError(e);
    } finally {
      setPdfBusy(false);
    }
  };

  const downloadTex = () => {
    if (!company.trim()) return setPdfError("Enter the company name first; it is used in the file name.");
    setPdfError("");
    triggerDownload(new Blob([finalResume], { type: "application/x-tex;charset=utf-8" }), texFileName);
  };

  const preview = async () => {
    setPdfError("");
    setCompileLog("");
    const win = window.open("", "_blank"); // open synchronously so popup blockers allow it
    try {
      const { blob } = await requestPdf(true);
      const url = URL.createObjectURL(blob);
      if (win) win.location.href = url;
      else window.open(url, "_blank");
    } catch (e) {
      win?.close();
      showError(e);
    }
  };

  // ---------- Tracker ----------
  const openTracker = async () => {
    if (!company.trim()) return setPdfError("Enter the company name first.");
    setPdfError("");
    setCompileLog("");
    setTrackerMsg("");
    setPdfBusy(true);
    try {
      // Save the current (possibly edited) version so the tracker links to it.
      const { name, texName } = await requestPdf(false);
      setSavedFile(name);
      setSavedTex(texName);
      const t = today();
      setTrackerDraft({
        ...emptyDraft(),
        company: company.trim(),
        jobTitle: jobTitle.trim(),
        applyDate: t,
        followUpDate: addDays(t, 7),
        status: "Applied",
        jd,
        resumeFile: name,
        resumeText: finalResume,
      });
    } catch (e) {
      showError(e);
    } finally {
      setPdfBusy(false);
    }
  };

  const clearSession = () => {
    if (!confirm("Clear the job description, results, and edited resume from this page?")) return;
    setJd("");
    setCompany("");
    setJobTitle("");
    setSteps([]);
    setFinalResume("");
    setSavedFile("");
    setSavedTex("");
    setCompileLog("");
    setPdfError("");
    setTrackerDraft(null);
    setTrackerMsg("");
    setCategoryTouched(false);
    setRunError("");
  };


  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Tailor Resume</h1>
          <p className="text-sm text-slate-500">Uses your local Claude Code CLI. Your master resumes are never modified.</p>
        </div>
        <button className="btn" onClick={clearSession} disabled={running}>
          Start over
        </button>
      </div>

      {/* 1. Job description */}
      <section className="card">
        <div className="card-title">1. Job description</div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <label className={`btn cursor-pointer ${jdBusy ? "opacity-50" : ""}`}>
            {jdBusy ? "Reading…" : "Upload JD (PDF, DOCX, TXT)"}
            <input type="file" accept={ACCEPT} className="hidden" disabled={jdBusy} onChange={(e) => { onJdFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <span className="text-xs text-slate-500">or paste the text below</span>
        </div>
        <textarea className="input min-h-44 text-xs" placeholder="Paste the job description here…" value={jd} onChange={(e) => setJd(e.target.value)} />
        <ErrorBox msg={jdError} />
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div>
            <label className="label">Company</label>
            <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Razorpay" />
          </div>
          <div>
            <label className="label">Job title</label>
            <input className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Full Stack Developer" />
          </div>
          <button className="btn" onClick={() => detectMeta(jd)} disabled={!jd.trim() || metaBusy}>
            {metaBusy ? "Detecting…" : "Auto-detect"}
          </button>
        </div>
        {metaNote && <p className="mt-2 text-xs text-amber-700">{metaNote}</p>}
      </section>

      {/* 2. Resume */}
      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <div className="card-title mb-0">2. Resume</div>
          <div className="flex gap-1">
            <button className={resumeMode === "saved" ? "tab-active" : "tab"} onClick={() => setResumeMode("saved")}>
              Saved master resumes ({resumes.length})
            </button>
            <button className={resumeMode === "upload" ? "tab-active" : "tab"} onClick={() => setResumeMode("upload")}>
              Upload new
            </button>
            <button className={resumeMode === "latex" ? "tab-active" : "tab"} onClick={() => setResumeMode("latex")}>
              LaTeX (Overleaf)
            </button>
          </div>
        </div>

        {resumeMode === "saved" ? (
          resumes.length === 0 ? (
            <p className="text-sm text-slate-500">No saved resumes yet. Use “Upload new”.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {resumes.map((r) => (
                <label key={r.id} className={`flex cursor-pointer items-center gap-3 rounded-md border p-2.5 ${selectedId === r.id ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
                  <input type="radio" name="resume" className="accent-slate-900" checked={selectedId === r.id} onChange={() => selectSaved(r.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900">
                      {r.name} {r.role && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">{r.role}</span>}
                      {r.format === "latex" && <span className="ml-1 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-normal text-blue-700">LaTeX + PDF</span>}
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.format === "latex" ? `.tex + ${r.originalFileName}` : r.originalFileName} · added {new Date(r.createdAt).toLocaleDateString()}
                    </div>
                    {r.format === "latex" && !r.pdfText && (
                      <div className="text-xs text-amber-700">PDF missing. Delete this and re-add it in the LaTeX tab with its PDF.</div>
                    )}
                  </div>
                  <button className="btn-danger" onClick={(e) => { e.preventDefault(); deleteMaster(r); }}>
                    Delete
                  </button>
                </label>
              ))}
            </div>
          )
        ) : resumeMode === "latex" ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-slate-500">
              Add both versions of the same resume. The <b>PDF</b> is compared with the job description; the <b>.tex</b> is what gets edited. You get both back at the end.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-700">1. LaTeX source</span>
              <label className="btn cursor-pointer">
                Load .tex file
                <input type="file" accept=".tex" className="hidden" onChange={(e) => { loadTexFile(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <span className="text-xs text-slate-500">or paste the full source of your Overleaf main.tex below</span>
              {pasteTex && <span className="text-xs text-slate-500">({pasteTex.length.toLocaleString()} characters)</span>}
            </div>
            <textarea
              className="input min-h-64 font-mono text-xs"
              placeholder={"\\documentclass[letterpaper,11pt]{article}\n...\n\\begin{document}\n...\n\\end{document}"}
              value={pasteTex}
              onChange={(e) => setPasteTex(e.target.value)}
              spellCheck={false}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-700">2. PDF of the same resume *</span>
              <label className="btn cursor-pointer">
                {texPdfFile ? "Change PDF" : "Choose PDF"}
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    setTexPdfFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
              <span className="text-xs text-slate-500">{texPdfFile ? texPdfFile.name : "In Overleaf: Download PDF"}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:items-end">
              <div>
                <label className="label">Name (optional)</label>
                <input className="input" value={upName} onChange={(e) => setUpName(e.target.value)} placeholder="e.g. AI Resume (LaTeX)" disabled={!saveAsMaster} />
              </div>
              <div>
                <label className="label">Role tag (optional)</label>
                <input className="input" value={upRole} onChange={(e) => setUpRole(e.target.value)} placeholder="e.g. Web Dev, AI" disabled={!saveAsMaster} />
              </div>
              <button className="btn-primary" onClick={usePastedLatex} disabled={resumeBusy || !pasteTex.trim() || !texPdfFile}>
                {resumeBusy ? "Saving…" : "Use this LaTeX resume"}
              </button>
              <label className="flex items-center gap-2 text-sm text-slate-600 md:col-span-3">
                <input type="checkbox" className="accent-slate-900" checked={saveAsMaster} onChange={(e) => setSaveAsMaster(e.target.checked)} />
                Save as a master resume for future use
              </label>
            </div>
            <p className="text-xs text-slate-500">
              Single-file documents only. If your Overleaf project uses extra files (a custom .cls, images, or \input files), those won&apos;t be available when compiling here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:items-end">
            <div>
              <label className="label">Name (optional)</label>
              <input className="input" value={upName} onChange={(e) => setUpName(e.target.value)} placeholder="e.g. Full Stack Resume" disabled={!saveAsMaster} />
            </div>
            <div>
              <label className="label">Role tag (optional)</label>
              <input className="input" value={upRole} onChange={(e) => setUpRole(e.target.value)} placeholder="e.g. Web Dev, AI" disabled={!saveAsMaster} />
            </div>
            <label className={`btn-primary cursor-pointer ${resumeBusy ? "opacity-50" : ""}`}>
              {resumeBusy ? "Reading…" : "Choose file (PDF, DOCX, TXT, TEX)"}
              <input type="file" accept={RESUME_ACCEPT} className="hidden" disabled={resumeBusy} onChange={(e) => { onResumeFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 md:col-span-3">
              <input type="checkbox" className="accent-slate-900" checked={saveAsMaster} onChange={(e) => setSaveAsMaster(e.target.checked)} />
              Save as a master resume for future use
            </label>
          </div>
        )}
        <ErrorBox msg={resumeError} />

        {resumeText && (
          <div className="mt-3">
            <button className="text-xs text-slate-600 underline" onClick={() => setShowResumeText((v) => !v)}>
              {showResumeText ? "Hide" : "Show"} resume used for this run
              {resumeFormat === "latex"
                ? ` (PDF text ${resumePdfText.length.toLocaleString()} + LaTeX ${resumeText.length.toLocaleString()} characters)`
                : ` (${resumeText.length.toLocaleString()} characters)`}
            </button>
            {showResumeText && (
              <>
                {resumeFormat === "latex" && (
                  <>
                    <div className="label mt-2">PDF text (compared with the job description)</div>
                    <textarea className="input min-h-40 font-mono text-xs" value={resumePdfText} onChange={(e) => setResumePdfText(e.target.value)} />
                    <div className="label mt-2">LaTeX source (edited by the final step)</div>
                  </>
                )}
                <textarea
                  className={`input min-h-56 font-mono text-xs ${resumeFormat === "latex" ? "" : "mt-2"}`}
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  spellCheck={resumeFormat !== "latex"}
                />
                <p className="mt-1 text-xs text-slate-500">Edits here apply to this run only. The saved master resume is not changed.</p>
              </>
            )}
          </div>
        )}
      </section>

      {/* 3. Prompts */}
      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <div className="card-title mb-0">3. Prompts</div>
          <Link href="/prompts" className="text-xs text-slate-600 underline">
            Open Prompt Library
          </Link>
        </div>
        {promptsLoading ? <p className="text-sm text-slate-500">Loading…</p> : <PromptList prompts={prompts} save={savePrompts} disabled={running} />}
        <ErrorBox msg={promptsError} />
        <p className="mt-2 text-xs text-slate-500">Enabled prompts run in order, then a final step assembles the complete resume.</p>
      </section>

      {/* Generate */}
      <section className="flex flex-col items-center gap-2">
        {running ? (
          <button className="btn-danger px-6 py-2.5" onClick={() => abortRef.current?.abort()}>
            Cancel generation
          </button>
        ) : (
          <button className="btn-primary px-8 py-3 text-base" onClick={generate} disabled={!canGenerate}>
            Generate Tailored Resume
          </button>
        )}
        {!running && !canGenerate && (
          <p className="text-xs text-slate-500">
            {latexMissingPdf
              ? "This LaTeX resume has no PDF. Re-add it in the LaTeX tab with its PDF to continue."
              : "Add a job description and choose a resume to continue."}
          </p>
        )}
        {running && <p className="text-xs text-slate-500">Each step can take a minute or two. Stay on this page until it finishes.</p>}
      </section>

      {/* Progress */}
      {steps.length > 0 && (
        <section className="card">
          <div className="card-title">Progress</div>
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li
                key={i}
                className={`flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm ${
                  s.status === "running"
                    ? "border-blue-300 bg-blue-50"
                    : s.status === "done"
                      ? "border-green-200 bg-green-50/60"
                      : s.status === "error"
                        ? "border-red-200 bg-red-50"
                        : "border-slate-200 bg-white"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    s.status === "done"
                      ? "bg-green-600 text-white"
                      : s.status === "error"
                        ? "bg-red-600 text-white"
                        : s.status === "running"
                          ? "animate-pulse bg-blue-600 text-white"
                          : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {s.status === "done" ? "✓" : s.status === "error" ? "!" : i + 1}
                </span>
                <div className="min-w-0">
                  <div className={`truncate font-medium ${s.status === "pending" || s.status === "skipped" ? "text-slate-400" : "text-slate-800"}`}>{s.name}</div>
                  <div className="text-xs text-slate-500">
                    {s.status === "running" ? "Running…" : s.status === "done" ? `Done in ${s.seconds ?? 0}s` : s.status === "error" ? "Failed" : s.status === "skipped" ? "Skipped" : "Waiting"}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <ErrorBox msg={runError} />
        </section>
      )}

      {/* Step results */}
      {resultSteps.length > 0 && shownResult && (
        <section className="card p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 pt-4">
            <div className="flex flex-wrap gap-1">
              {resultSteps.map(({ step, index }) => (
                <button
                  key={index}
                  onClick={() => setActiveResult(index)}
                  className={`-mb-px border-b-2 px-3 pb-3 text-sm font-medium ${
                    shownResult.index === index ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {step.name}
                </button>
              ))}
            </div>
            <button className="btn mb-3" onClick={() => copyText(shownResult.step.output, shownResult.index)}>
              {copied === shownResult.index ? "Copied" : "Copy"}
            </button>
          </div>

          {(matchScore !== null || afterScore !== null) && (
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
              <ScoreComparison before={matchScore} after={afterScore} pending={rescoreStep?.status === "running" || rescoreStep?.status === "pending"} stale={scoreStale} />
            </div>
          )}

          <div className="px-6 py-5">
            <div className="max-w-3xl">
              <Markdown>{shownResult.step.output}</Markdown>
            </div>
          </div>
        </section>
      )}

      {/* Final resume */}
      {finalResume !== "" || steps.some((s) => s.isFinal && s.status === "done") ? (
        <section className="card">
          <div className="card-title">Final tailored resume{isLatexOut && " (LaTeX)"}</div>
          {finalResume.trim() !== "" && (
            <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-4">
              <ScoreComparison
                before={matchScore}
                after={afterScore}
                pending={rescoreStep?.status === "running" || rescoreStep?.status === "pending"}
                stale={scoreStale}
                onRescore={!running && finalResume.trim() ? rescore : undefined}
                rescoring={rescoring}
              />
            </div>
          )}
          <p className="mb-2 text-xs text-slate-500">
            Review and edit before downloading. Check every line against your real experience.{" "}
            {isLatexOut ? (
              <>Edit the .tex on the left and recompile to update the PDF on the right. Downloads always use your latest edits.</>
            ) : (
              <>
                Format: <code># Name</code>, <code>## Section</code>, <code>### Role | Company | Dates</code>, <code>- bullet</code>.
              </>
            )}
          </p>
          {isLatexOut ? (
            <LatexEditor value={finalResume} onChange={setFinalResume} generated={generatedResume} category={category} />
          ) : (
            <textarea
              className="input min-h-[480px] font-mono text-xs leading-relaxed"
              value={finalResume}
              onChange={(e) => setFinalResume(e.target.value)}
            />
          )}

          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div>
              <label className="label">Resume type (file name)</label>
              <select
                className="input w-auto"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as ResumeCategory);
                  setCategoryTouched(true);
                }}
              >
                <option value="web_dev">Web Dev / Backend / Full Stack</option>
                <option value="ai">AI Engineer</option>
              </select>
            </div>
            <div className="min-w-0 flex-1">
              <label className="label">File name</label>
              <div className="truncate rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm">
                {isLatexOut ? `${fileName} + .tex` : fileName}
              </div>
            </div>
            {!isLatexOut && (
              <button className="btn" onClick={preview} disabled={pdfBusy || !finalResume.trim()}>
                Preview
              </button>
            )}
            {isLatexOut && (
              <button className="btn" onClick={downloadTex} disabled={!finalResume.trim()}>
                Download .tex
              </button>
            )}
            <button className="btn-primary" onClick={download} disabled={pdfBusy || !finalResume.trim()}>
              {pdfBusy ? (isLatexOut ? "Compiling…" : "Working…") : "Download PDF"}
            </button>
            <button className="btn" onClick={openTracker} disabled={pdfBusy || !finalResume.trim()}>
              Add to Job Tracker
            </button>
          </div>
          {savedFile && (
            <p className="mt-2 text-xs text-slate-500">
              Saved to output/tailored-resumes/{savedFile}
              {savedTex && ` and ${savedTex}`}
            </p>
          )}
          <ErrorBox msg={pdfError} />
          {compileLog && <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-slate-900 p-3 font-mono text-xs text-slate-100">{compileLog}</pre>}

          {trackerDraft && (
            <div className="mt-4 rounded-md border border-slate-200 p-4">
              <div className="card-title">Add to Job Tracker</div>
              <ApplicationForm
                initial={trackerDraft}
                submitLabel="Save to tracker"
                onSubmit={async (d) => {
                  await api("/api/applications", jsonInit("POST", d));
                  setTrackerDraft(null);
                  setTrackerMsg(`Added ${d.company} to the Job Tracker.`);
                }}
                onCancel={() => setTrackerDraft(null)}
              />
            </div>
          )}
          {trackerMsg && (
            <p className="mt-3 text-sm text-green-700">
              {trackerMsg}{" "}
              <Link href="/tracker" className="underline">
                Open tracker
              </Link>
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
