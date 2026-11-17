"use client";

import { useEffect, useMemo, useState } from "react";
import ApplicationForm, { emptyDraft, type AppDraft } from "@/components/ApplicationForm";
import { api, jsonInit, today } from "@/lib/client";
import { CLOSED_STATUSES, PLATFORMS, STATUSES, type Application } from "@/lib/types";

const isOverdue = (a: Application, now: string) => Boolean(a.followUpDate) && a.followUpDate < now && !CLOSED_STATUSES.includes(a.status);

export default function TrackerPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Application | "new" | null>(null);
  const [viewJd, setViewJd] = useState<Application | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [platform, setPlatform] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const now = today();

  useEffect(() => {
    api<Application[]>("/api/applications")
      .then(setApps)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const platforms = useMemo(() => Array.from(new Set([...PLATFORMS, ...apps.map((a) => a.platform).filter(Boolean)])), [apps]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return apps.filter((a) => {
      if (status && a.status !== status) return false;
      if (platform && a.platform !== platform) return false;
      if (overdueOnly && !isOverdue(a, now)) return false;
      if (!needle) return true;
      return [a.company, a.jobTitle, a.outreachPerson, a.notes, a.platform, a.status].some((v) => v.toLowerCase().includes(needle));
    });
  }, [apps, q, status, platform, overdueOnly, now]);

  const overdueCount = apps.filter((a) => isOverdue(a, now)).length;

  const create = async (d: AppDraft) => {
    const created = await api<Application>("/api/applications", jsonInit("POST", d));
    setApps((prev) => [created, ...prev]);
    setEditing(null);
  };

  const update = async (id: string, patch: Partial<AppDraft>) => {
    const updated = await api<Application>(`/api/applications/${id}`, jsonInit("PUT", patch));
    setApps((prev) => prev.map((a) => (a.id === id ? updated : a)));
    return updated;
  };

  const quickStatus = async (a: Application, s: string) => {
    setError("");
    try {
      await update(a.id, { status: s });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (a: Application) => {
    if (!confirm(`Delete the application for ${a.company}?`)) return;
    setError("");
    try {
      await api(`/api/applications/${a.id}`, { method: "DELETE" });
      setApps((prev) => prev.filter((x) => x.id !== a.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Job Tracker</h1>
          <p className="text-sm text-slate-500">
            {apps.length} application{apps.length === 1 ? "" : "s"}
            {overdueCount > 0 && <span className="ml-2 font-medium text-red-600">· {overdueCount} overdue follow-up{overdueCount === 1 ? "" : "s"}</span>}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setEditing("new")}>
          + Add application
        </button>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {editing && (
        <div className="card mb-4">
          <div className="card-title">{editing === "new" ? "New application" : `Edit: ${editing.company}`}</div>
          <ApplicationForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? { ...emptyDraft(), applyDate: now } : editing}
            submitLabel={editing === "new" ? "Add application" : "Save changes"}
            onSubmit={async (d) => {
              if (editing === "new") await create(d);
              else {
                await update(editing.id, d);
                setEditing(null);
              }
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Search company, title, person, notes…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="input w-auto" value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="">All platforms</option>
          {platforms.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" className="accent-slate-900" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          Overdue only
        </label>
        {(q || status || platform || overdueOnly) && (
          <button
            className="btn"
            onClick={() => {
              setQ("");
              setStatus("");
              setPlatform("");
              setOverdueOnly(false);
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {["Company", "Job Title", "Apply Date", "Follow-up", "Outreach Person", "Status", "Platform", "Notes", "Tailored Resume", ""].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                  {apps.length ? "No applications match the filters." : "No applications yet."}
                </td>
              </tr>
            )}
            {filtered.map((a) => {
              const overdue = isOverdue(a, now);
              return (
                <tr key={a.id} className={`border-b border-slate-100 align-top last:border-0 ${overdue ? "bg-red-50" : "hover:bg-slate-50"}`}>
                  <td className="px-3 py-2 font-medium text-slate-900">{a.company}</td>
                  <td className="px-3 py-2">{a.jobTitle}</td>
                  <td className="whitespace-nowrap px-3 py-2">{a.applyDate}</td>
                  <td className={`whitespace-nowrap px-3 py-2 ${overdue ? "font-semibold text-red-600" : ""}`}>
                    {a.followUpDate}
                    {overdue && <div className="text-[10px] uppercase">Overdue</div>}
                  </td>
                  <td className="px-3 py-2">{a.outreachPerson}</td>
                  <td className="px-3 py-2">
                    <select className="rounded border border-slate-200 bg-transparent px-1 py-0.5 text-sm" value={a.status} onChange={(e) => quickStatus(a, e.target.value)}>
                      {STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">{a.platform}</td>
                  <td className="max-w-xs px-3 py-2 text-slate-600">
                    <div className="line-clamp-3 whitespace-pre-wrap">{a.notes}</div>
                  </td>
                  <td className="px-3 py-2">
                    {a.resumeFile ? (
                      <a className="text-blue-700 underline" href={`/api/output/${encodeURIComponent(a.resumeFile)}`} target="_blank" rel="noreferrer">
                        {a.resumeFile}
                      </a>
                    ) : null}
                    {a.resumeFile && a.resumeText.includes("\\documentclass") && (
                      <a className="block text-xs text-blue-700 underline" href={`/api/output/${encodeURIComponent(a.resumeFile.replace(/\.pdf$/, ".tex"))}`}>
                        .tex source
                      </a>
                    )}
                    {!a.resumeFile && (
                      <span className="text-slate-400">—</span>
                    )}
                    {a.jd && (
                      <button className="block text-xs text-slate-500 underline" onClick={() => setViewJd(a)}>
                        View JD
                      </button>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button className="btn mr-1" onClick={() => setEditing(a)}>
                      Edit
                    </button>
                    <button className="btn-danger" onClick={() => remove(a)}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {viewJd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setViewJd(null)}>
          <div className="card max-h-[80vh] w-full max-w-3xl overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="card-title mb-0">
                {viewJd.company} · {viewJd.jobTitle}
              </div>
              <button className="btn" onClick={() => setViewJd(null)}>
                Close
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">{viewJd.jd}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
