"use client";

import { useState } from "react";
import PromptList, { usePrompts } from "@/components/PromptList";

export default function PromptsPage() {
  const { prompts, loading, error, save, restoreDefaults } = usePrompts();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");

  const add = async () => {
    const ok = await save([...prompts, { id: crypto.randomUUID(), name: name.trim(), text: text.trim(), enabled: true }]);
    if (ok) {
      setAdding(false);
      setName("");
      setText("");
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Prompt Library</h1>
          <p className="text-sm text-slate-500">Enabled prompts run top to bottom when you generate a tailored resume. Changes save automatically.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setAdding(true)}>
            + Add prompt
          </button>
          <button
            className="btn"
            onClick={() => confirm("Replace all prompts with the 3 defaults? Custom prompts and edits will be lost.") && restoreDefaults()}
          >
            Restore defaults
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {adding && (
        <div className="card mb-4 flex flex-col gap-2">
          <div className="card-title mb-0">New prompt</div>
          <input className="input" placeholder="Prompt name" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea className="input min-h-40 font-mono text-xs" placeholder="Prompt text" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-primary" onClick={add} disabled={!name.trim() || !text.trim()}>
              Save prompt
            </button>
            <button className="btn" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="card">
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : <PromptList prompts={prompts} save={save} expanded />}
        <p className="mt-4 text-xs text-slate-500">
          A final step always runs after your prompts to assemble the complete resume. Every step is instructed to use only facts from your original resume.
        </p>
      </div>
    </div>
  );
}
