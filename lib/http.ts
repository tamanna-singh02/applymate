import { NextResponse } from "next/server";

export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export function serverError(err: unknown) {
  console.error(err);
  return fail((err as Error)?.message || "Unexpected server error", 500);
}

const APP_FIELDS = ["company", "jobTitle", "applyDate", "followUpDate", "outreachPerson", "status", "platform", "notes", "jd", "resumeFile", "resumeText"] as const;

/** Copies only known Application fields from a request body, coerced to strings. */
export function pickAppFields(body: Record<string, unknown>) {
  const out: Partial<Record<(typeof APP_FIELDS)[number], string>> = {};
  for (const f of APP_FIELDS) if (body[f] !== undefined) out[f] = String(body[f] ?? "");
  return out;
}
