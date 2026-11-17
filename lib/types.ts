export interface Prompt {
  id: string;
  name: string;
  text: string;
  enabled: boolean;
  isDefault?: boolean;
}

export interface MasterResume {
  id: string;
  name: string; // e.g. "Full Stack Resume"
  role: string; // free-text tag, e.g. "Web Dev", "AI"
  originalFileName: string;
  storedFile: string; // file name inside uploads/master-resumes
  text: string; // extracted plain text, or LaTeX source when format is "latex"
  format?: ResumeFormat; // missing = "text"
  // LaTeX resumes only: the compiled PDF the user uploaded alongside the .tex.
  // Its text is what gets analyzed against the JD; the .tex is what gets edited.
  pdfText?: string;
  pdfStoredFile?: string;
  createdAt: string;
}

export const STATUSES = [
  "Not Applied",
  "Applied",
  "Assessment",
  "Recruiter Screening",
  "Interview Scheduled",
  "Technical Interview",
  "HR Interview",
  "Offer",
  "Rejected",
  "On Hold",
  "Withdrawn",
] as const;

export const PLATFORMS = [
  "LinkedIn",
  "Naukri",
  "Wellfound",
  "Instahyre",
  "Indeed",
  "Cutshort",
  "Foundit",
  "Hirist",
  "Company Careers Page",
  "Referral",
  "Other",
] as const;

// Follow-ups are not considered overdue once the application reaches one of these.
export const CLOSED_STATUSES = ["Offer", "Rejected", "Withdrawn"];

export interface Application {
  id: string;
  company: string;
  jobTitle: string;
  applyDate: string; // YYYY-MM-DD
  followUpDate: string; // YYYY-MM-DD
  outreachPerson: string;
  status: string;
  platform: string;
  notes: string;
  jd: string;
  resumeFile: string; // file name inside output/tailored-resumes
  resumeText: string;
  createdAt: string;
  updatedAt: string;
}

export type ResumeCategory = "web_dev" | "ai";

export type ResumeFormat = "text" | "latex";
