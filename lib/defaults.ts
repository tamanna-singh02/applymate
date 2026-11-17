import type { Prompt } from "./types";

export const DEFAULT_PROMPTS: Prompt[] = [
  {
    id: "recruiter-analysis",
    name: "Recruiter Analysis",
    enabled: true,
    isDefault: true,
    text: `Act as a senior recruiter for this exact company. Analyze my resume against this job description and give me:
- Match score out of 100.
- Top 5 missing keywords.
- 3 red flags a hiring manager would spot in under 10 seconds.
- Specific recommendations.`,
  },
  {
    id: "experience-optimization",
    name: "Experience Optimization",
    enabled: true,
    isDefault: true,
    text: `Rewrite my experience section to naturally incorporate relevant keywords and remove identified red flags.

Use Google's XYZ formula:
Accomplished X, as measured by Y, by doing Z.

Keep everything authentic. Never invent achievements, metrics, responsibilities, or technologies.`,
  },
  {
    id: "ats-review",
    name: "ATS Review",
    enabled: true,
    isDefault: true,
    text: `Act as an ATS filter and a hiring manager reviewing 200 resumes in one sitting.

Identify which sections would get skipped, which bullet points are generic, and what needs improvement.

Rewrite weak sections to make the resume ATS-friendly, concise, impactful, and recruiter-friendly.`,
  },
];

// Applied to every AI step. Not editable from the UI on purpose: it is the factual-accuracy guardrail.
export const SYSTEM_PROMPT = `You are a resume-tailoring assistant helping a job seeker adapt their resume to a specific job description.

Hard rules:
- Use only facts present in the ORIGINAL RESUME. Never invent employers, titles, dates, degrees, achievements, metrics, responsibilities, tools, or technologies.
- If a metric would strengthen a bullet but none exists in the original resume, do not make one up. You may write the bullet without a number, or add a placeholder in square brackets like [add metric] only if asked for suggestions.
- You may rephrase, reorder, condense, and emphasize existing content, and use job-description keywords only where the original resume supports them.
- When you give a match score, write it on its own line exactly as: Match Score: NN/100
- Respond in plain Markdown. Do not wrap the answer in code fences. Do not ask follow-up questions; do the task with the information given.`;

export const FINAL_STEP_NAME = "Final Tailored Resume";

export const RESCORE_STEP_NAME = "Tailored Resume Score";

// Runs after the final step so the user can compare the match score before and after tailoring.
export const RESCORE_PROMPT = `Act as the same senior recruiter for this exact company. Score the TAILORED RESUME against the job description using the same criteria you would use for the original resume.

Be strict and consistent. Do not inflate the score because the resume was rewritten: credit only skills and experience the resume actually shows. Wording changes alone are worth little; real evidence matters.

Output exactly this structure:

Match Score: NN/100

## What improved
- up to 4 short bullets

## Remaining gaps
- up to 4 short bullets: requirements the candidate's real experience still doesn't cover (these cannot be fixed by rewording)`;

export const FINAL_STEP_PROMPT = `Using the analysis and rewrites from the previous steps, produce the complete final tailored resume.

Output ONLY the resume, with no commentary before or after it. Use exactly this plain-text format:

# Full Name
Contact line (phone | email | LinkedIn | location, exactly as in the original resume)

## SECTION NAME
### Job Title | Company | Location | Start - End
- Bullet point
- Bullet point

Plain paragraphs are allowed (for example a summary). For skills, use lines like "Languages: Python, TypeScript".

Requirements:
- Keep every section of the original resume that is relevant (summary, skills, experience, projects, education, certifications).
- Keep all employers, titles, dates, and education exactly as in the original resume.
- Never add facts that are not in the original resume.
- Aim for a concise one-to-two page resume.`;

// Used instead of FINAL_STEP_PROMPT when the original resume is LaTeX (e.g. pasted from Overleaf).
export const FINAL_STEP_PROMPT_LATEX = `Using the analysis and rewrites from the previous steps, produce the complete final tailored resume as LaTeX source.

The ORIGINAL RESUME is LaTeX. Output ONLY the full .tex document, starting with \\documentclass and ending with \\end{document}. No commentary and no code fences.

Requirements:
- Keep the preamble exactly as in the original: document class, packages, custom commands, macros, spacing, and layout. Do not add new packages.
- Use the original document's own commands and environments for every section and entry.
- Change only the content: wording of summary, bullets, and skills, and the order of items where it helps.
- Keep all employers, titles, dates, links, contact details, and education exactly as in the original resume.
- Never add facts that are not in the original resume.
- Escape LaTeX special characters in any text you write: \\& \\% \\$ \\# \\_ \\{ \\}.
- Keep the length close to the original (normally one page).`;
