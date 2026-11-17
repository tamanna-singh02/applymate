import { NextResponse } from "next/server";
import { getApplications, newId, saveApplications } from "@/lib/store";
import type { Application } from "@/lib/types";
import { fail, pickAppFields as pickFields, serverError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getApplications());
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: Request) {
  try {
    const data = pickFields(await req.json());
    if (!data.company?.trim()) return fail("Company name is required.");
    const now = new Date().toISOString();
    const app: Application = {
      company: "", jobTitle: "", applyDate: "", followUpDate: "", outreachPerson: "",
      status: "Not Applied", platform: "", notes: "", jd: "", resumeFile: "", resumeText: "",
      ...data,
      id: newId(),
      createdAt: now,
      updatedAt: now,
    };
    const apps = await getApplications();
    apps.unshift(app);
    await saveApplications(apps);
    return NextResponse.json(app, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
