import { NextResponse } from "next/server";
import { DEFAULT_PROMPTS } from "@/lib/defaults";
import { savePrompts } from "@/lib/store";
import { serverError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST() {
  try {
    await savePrompts(DEFAULT_PROMPTS);
    return NextResponse.json(DEFAULT_PROMPTS);
  } catch (e) {
    return serverError(e);
  }
}
