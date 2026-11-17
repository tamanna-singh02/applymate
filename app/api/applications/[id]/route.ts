import { NextResponse } from "next/server";
import { getApplications, saveApplications } from "@/lib/store";
import { fail, pickAppFields as pickFields, serverError } from "@/lib/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const apps = await getApplications();
    const i = apps.findIndex((a) => a.id === id);
    if (i === -1) return fail("Application not found.", 404);
    const data = pickFields(await req.json());
    if (data.company !== undefined && !data.company.trim()) return fail("Company name is required.");
    apps[i] = { ...apps[i], ...data, updatedAt: new Date().toISOString() };
    await saveApplications(apps);
    return NextResponse.json(apps[i]);
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const apps = await getApplications();
    const next = apps.filter((a) => a.id !== id);
    if (next.length === apps.length) return fail("Application not found.", 404);
    await saveApplications(next);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
