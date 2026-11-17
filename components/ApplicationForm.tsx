"use client";

import { useState } from "react";
import { PLATFORMS, STATUSES, type Application } from "@/lib/types";

export type AppDraft = Omit<Application, "id" | "createdAt" | "updatedAt">;

export const emptyDraft = (): AppDraft => ({
  company: "",
  jobTitle: "",
  applyDate: "",
  followUpDate: "",
  outreachPerson: "",
  status: "Not Applied",
  platform: "LinkedIn",
  notes: "",
  jd: "",
  resumeFile: "",
  resumeText: "",
});

interface Props {
  initial: AppDraft;
  submitLabel: string;
  onSubmit: (draft: AppDraft) => Promise<void>;
  onCancel: () => void;
}

export default function ApplicationForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [d, setD] = useState<AppDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isCustomPlatform = d.platform !== "" && !(PLATFORMS as readonly string[]).includes(d.platform);
  const [customMode, setCustomMode] = useState(isCustomPlatform);

  const set = <K extends keyof AppDraft>(k: K, v: AppDraft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!d.company.trim()) return setError("Company name is required.");
    if (d.followUpDate && d.applyDate && d.followUpDate < d.applyDate) return setError("Follow-up date is before the apply date.");
    setSaving(true);
    setError("");
    try {
      await onSubmit({ ...d, company: d.company.trim(), jobTitle: d.jobTitle.trim(), platform: d.platform.trim() });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <div>
        <label className="label">Company *</label>
        <input className="input" value={d.company} onChange={(e) => set("company", e.target.value)} autoFocus />
      </div>
      <div>
        <label className="label">Job title</label>
        <input className="input" value={d.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} />
      </div>
      <div>
        <label className="label">LinkedIn outreach person</label>
        <input className="input" value={d.outreachPerson} onChange={(e) => set("outreachPerson", e.target.value)} />
      </div>
      <div>
        <label className="label">Apply date</label>
        <input type="date" className="input" value={d.applyDate} onChange={(e) => set("applyDate", e.target.value)} />
      </div>
      <div>
        <label className="label">Follow-up date</label>
        <input type="date" className="input" value={d.followUpDate} onChange={(e) => set("followUpDate", e.target.value)} />
      </div>
      <div>
        <label className="label">Status</label>
        <select className="input" value={d.status} onChange={(e) => set("status", e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Platform</label>
        <select
          className="input"
          value={customMode ? "__custom" : d.platform}
          onChange={(e) => {
            if (e.target.value === "__custom") {
              setCustomMode(true);
              set("platform", "");
            } else {
              setCustomMode(false);
              set("platform", e.target.value);
            }
          }}
        >
          {PLATFORMS.map((p) => (
            <option key={p}>{p}</option>
          ))}
          <option value="__custom">Custom…</option>
        </select>
        {customMode && (
          <input className="input mt-2" placeholder="Platform name" value={d.platform} onChange={(e) => set("platform", e.target.value)} />
        )}
      </div>
      <div className="md:col-span-2">
        <label className="label">Notes</label>
        <textarea className="input min-h-[38px]" rows={2} value={d.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
      {(d.resumeFile || d.jd) && (
        <div className="text-xs text-slate-500 md:col-span-3">
          {d.resumeFile && <>Tailored resume: <span className="font-mono">{d.resumeFile}</span>. </>}
          {d.jd && <>Job description attached ({d.jd.length.toLocaleString()} characters).</>}
        </div>
      )}
      {error && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 md:col-span-3">{error}</div>}
      <div className="flex gap-2 md:col-span-3">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
