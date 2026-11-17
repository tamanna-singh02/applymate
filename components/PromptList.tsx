"use client";

import { useCallback, useEffect, useState } from "react";
import { api, jsonInit } from "@/lib/client";
import type { Prompt } from "@/lib/types";

/** Loads prompts and saves every change to data/prompts.json. */
export function usePrompts() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Prompt[]>("/api/prompts")
      .then(setPrompts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async (next: Prompt[]) => {
    setError("");
    const prev = prompts;
    setPrompts(next); // optimistic
    try {
      setPrompts(await api<Prompt[]>("/api/prompts", jsonInit("PUT", next)));
      return true;
    } catch (e) {
      setPrompts(prev);
      setError((e as Error).message);
      return false;
    }
  }, [prompts]);

  const restoreDefaults = useCallback(async () => {
    setError("");
    try {
      setPrompts(await api<Prompt[]>("/api/prompts/reset", { method: "POST" }));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  return { prompts, loading, error, save, restoreDefaults };
}

interface Props {
  prompts: Prompt[];
  save: (next: Prompt[]) => Promise<boolean>;
  expanded?: boolean; // show full prompt text (Prompt Library) vs. one-line preview (Tailor page)
  disabled?: boolean;
}

export default function PromptList({ prompts, save, expanded = false, disabled = false }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftText, setDraftText] = useState("");

  const startEdit = (p: Prompt) => {
    setEditingId(p.id);
    setDraftName(p.name);
    setDraftText(p.text);
  };

  const commitEdit = async () => {
    if (!draftName.trim() || !draftText.trim()) return;
    const ok = await save(prompts.map((p) => (p.id === editingId ? { ...p, name: draftName.trim(), text: draftText.trim() } : p)));
    if (ok) setEditingId(null);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= prompts.length) return;
    const next = [...prompts];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };

  const remove = (p: Prompt) => {
    if (confirm(`Delete prompt "${p.name}"?`)) save(prompts.filter((x) => x.id !== p.id));
  };

  if (!prompts.length) return <p className="text-sm text-slate-500">No prompts. Add one or restore the defaults.</p>;

  let order = 0;
  return (
    <ol className="flex flex-col gap-2">
      {prompts.map((p, i) => {
        const editing = editingId === p.id;
        const stepNo = p.enabled ? ++order : null;
        return (
          <li key={p.id} className={`rounded-md border p-3 ${p.enabled ? "border-slate-200 bg-white" : "border-dashed border-slate-200 bg-slate-50"}`}>
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-slate-900"
                checked={p.enabled}
                disabled={disabled}
                title={p.enabled ? "Enabled" : "Disabled"}
                onChange={() => save(prompts.map((x) => (x.id === p.id ? { ...x, enabled: !x.enabled } : x)))}
              />
              <div className="min-w-0 flex-1">
                {editing ? (
                  <div className="flex flex-col gap-2">
                    <input className="input" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Prompt name" />
                    <textarea className="input min-h-40 font-mono text-xs" value={draftText} onChange={(e) => setDraftText(e.target.value)} />
                    <div className="flex gap-2">
                      <button className="btn-primary" onClick={commitEdit} disabled={!draftName.trim() || !draftText.trim()}>
                        Save
                      </button>
                      <button className="btn" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">
                        {stepNo ? `${stepNo}. ` : ""}
                        {p.name}
                      </span>
                      {!p.enabled && <span className="rounded bg-slate-200 px-1.5 text-[10px] uppercase text-slate-600">off</span>}
                    </div>
                    <p className={`mt-1 whitespace-pre-wrap text-xs text-slate-600 ${expanded ? "" : "line-clamp-2"}`}>{p.text}</p>
                  </>
                )}
              </div>
              {!editing && (
                <div className="flex shrink-0 items-center gap-1">
                  <button className="btn px-2" title="Move up" onClick={() => move(i, -1)} disabled={disabled || i === 0}>
                    ↑
                  </button>
                  <button className="btn px-2" title="Move down" onClick={() => move(i, 1)} disabled={disabled || i === prompts.length - 1}>
                    ↓
                  </button>
                  <button className="btn" onClick={() => startEdit(p)} disabled={disabled}>
                    Edit
                  </button>
                  {expanded && (
                    <button className="btn-danger" onClick={() => remove(p)} disabled={disabled}>
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
