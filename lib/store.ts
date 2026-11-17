import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_PROMPTS } from "./defaults";
import type { Application, MasterResume, Prompt } from "./types";

export const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, "data");
export const MASTER_DIR = path.join(ROOT, "uploads", "master-resumes");
export const OUTPUT_DIR = path.join(ROOT, "output", "tailored-resumes");

const FILES = {
  prompts: path.join(DATA_DIR, "prompts.json"),
  applications: path.join(DATA_DIR, "applications.json"),
  resumes: path.join(DATA_DIR, "resumes.json"),
};

async function ensureDirs() {
  await Promise.all([DATA_DIR, MASTER_DIR, OUTPUT_DIR].map((d) => fs.mkdir(d, { recursive: true })));
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  await ensureDirs();
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw new Error(`Could not read ${path.basename(file)}: ${(err as Error).message}`);
  }
}

// Write to a temp file then rename, so a crash mid-write never leaves a half-written JSON file.
async function writeJson(file: string, data: unknown) {
  await ensureDirs();
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

export const newId = () => crypto.randomUUID();

// Prompts
export async function getPrompts(): Promise<Prompt[]> {
  const prompts = await readJson<Prompt[] | null>(FILES.prompts, null);
  if (prompts) return prompts;
  await writeJson(FILES.prompts, DEFAULT_PROMPTS);
  return structuredClone(DEFAULT_PROMPTS);
}
export const savePrompts = (prompts: Prompt[]) => writeJson(FILES.prompts, prompts);

// Applications
export const getApplications = () => readJson<Application[]>(FILES.applications, []);
export const saveApplications = (apps: Application[]) => writeJson(FILES.applications, apps);

// Master resumes
export const getResumes = () => readJson<MasterResume[]>(FILES.resumes, []);
export const saveResumes = (resumes: MasterResume[]) => writeJson(FILES.resumes, resumes);

export async function ensureOutputDir() {
  await ensureDirs();
}
