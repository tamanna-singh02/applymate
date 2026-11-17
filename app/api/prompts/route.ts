import { NextResponse } from "next/server";
import { getPrompts, newId, savePrompts } from "@/lib/store";
import type { Prompt } from "@/lib/types";
import { fail, serverError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getPrompts());
  } catch (e) {
    return serverError(e);
  }
}

// Replaces the full ordered list (used for edit, toggle, reorder, add, delete).
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    if (!Array.isArray(body)) return fail("Expected an array of prompts.");
    const prompts: Prompt[] = [];
    for (const p of body) {
      const name = String(p?.name ?? "").trim();
      const text = String(p?.text ?? "").trim();
      if (!name) return fail("Every prompt needs a name.");
      if (!text) return fail(`Prompt "${name}" is empty.`);
      prompts.push({ id: String(p.id || newId()), name, text, enabled: Boolean(p.enabled), isDefault: Boolean(p.isDefault) });
    }
    await savePrompts(prompts);
    return NextResponse.json(prompts);
  } catch (e) {
    return serverError(e);
  }
}
