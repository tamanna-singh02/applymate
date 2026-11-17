import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { fail, serverError } from "@/lib/http";
import { getResumes, MASTER_DIR, saveResumes } from "@/lib/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// Only name and role can change. The stored text and original file are never modified.
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await req.json();
    const resumes = await getResumes();
    const r = resumes.find((x) => x.id === id);
    if (!r) return fail("Resume not found.", 404);
    if (typeof body.name === "string" && body.name.trim()) r.name = body.name.trim();
    if (typeof body.role === "string") r.role = body.role.trim();
    await saveResumes(resumes);
    return NextResponse.json(r);
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const resumes = await getResumes();
    const r = resumes.find((x) => x.id === id);
    if (!r) return fail("Resume not found.", 404);
    await saveResumes(resumes.filter((x) => x.id !== id));
    await fs.rm(path.join(MASTER_DIR, path.basename(r.storedFile)), { force: true });
    if (r.pdfStoredFile) await fs.rm(path.join(MASTER_DIR, path.basename(r.pdfStoredFile)), { force: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
