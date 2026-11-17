# Resume Tailor (local)

A small local web app for tailoring a resume to a job description and tracking job applications.
Everything runs on your laptop. Data lives in JSON files and local folders. There is no login, database, or cloud service.

AI steps run through your installed **Claude Code CLI** in headless mode (`claude -p`), so no API key is needed.
Each step uses your Claude Code account's usage, just like a normal Claude Code prompt.

## Requirements

- Node.js 20 or newer (tested on Node 24)
- Optional, for LaTeX resumes: MiKTeX or TeX Live (`pdflatex --version`)
- Claude Code installed and logged in. Check with:
  ```
  claude --version
  claude -p "say hi"
  ```

## Setup

```
npm install
```

Optional: copy `.env.example` to `.env.local` to change these settings:

| Variable | Default | Purpose |
|---|---|---|
| `CLAUDE_CLI_PATH` | `claude` | Full path to the CLI if `claude` is not on your PATH (e.g. `C:\Users\<you>\.local\bin\claude.exe`) |
| `CLAUDE_MODEL` | Claude Code default | Model passed to `claude --model` (e.g. `opus`, `sonnet`) |
| `CLAUDE_TIMEOUT_SECONDS` | `600` | Maximum time for one AI step |
| `LATEX_BIN_DIR` | on PATH | Folder containing `pdflatex`/`xelatex` if they are not on PATH |
| `LATEX_ENGINE` | auto | Force `pdflatex` or `xelatex` |
| `LATEX_TIMEOUT_SECONDS` | `240` | Maximum time for one LaTeX compile |

Restart `npm run dev` after changing `.env.local`.

## Run

```
npm run dev
```

Open http://localhost:3000.

## How it works

### Tailor Resume
1. **Job description.** Upload a PDF, DOCX, or TXT file, or paste the text. Company and job title are auto-detected (you can edit them).
2. **Resume.** Pick a saved master resume, or upload a new one. Uploads can be saved as master resumes, so you can keep several (for example Web Dev and AI).
3. **Prompts.** Enable, disable, edit, or reorder prompts. Changes save to `data/prompts.json`.
4. **Generate Tailored Resume** runs each enabled prompt in order, then a final step that assembles the complete resume. Progress and the recruiter analysis (with match score) are shown as steps finish.
5. Review and edit the final resume. Choose the resume type to set the file name, then click **Download PDF**.
6. **Add to Job Tracker** saves the PDF and opens a form prefilled with company, title, JD, resume, and today's date.

Every AI step gets the original resume as the source of truth and is told not to invent experience, metrics, or technologies. Still read the final resume carefully before sending it.

### LaTeX / Overleaf resumes
In step 2, choose **LaTeX (Overleaf)** and add both versions of the same resume:
1. the `.tex` source: paste your full `main.tex` (from `\documentclass` to `\end{document}`) or load the file, and
2. the PDF of that resume (in Overleaf, **Download PDF**). This is required.

Both are saved with the master resume. The **PDF text** is what the analysis prompts (Recruiter Analysis, Experience Optimization, ATS Review) compare with the job description. The **.tex** is what the final step edits. It keeps your preamble, packages, and custom commands and changes only the content. You can then:
- edit the `.tex` in the page, or copy it back into Overleaf,
- **Preview** the compiled PDF,
- **Download .tex**, or
- **Download PDF**, which compiles locally and saves both `tamanna_<type>_<company>.pdf` and `.tex` to `output/tailored-resumes/`.

Compiling needs a local TeX distribution (MiKTeX or TeX Live) with `pdflatex` on PATH. Documents that load `fontspec` are compiled with `xelatex`. Shell escape is disabled.
Limits: single-file documents only. A custom `.cls`, images, or `\input` files from your Overleaf project are not available. The first compile after MiKTeX installs a missing package can take a few minutes.
If compiling fails, the LaTeX error is shown below the buttons. Fix the `.tex` and try again.

### PDF file names
- Web Dev / Backend / Full Stack: `tamanna_web_dev_<company>.pdf`
- AI Engineer: `tamanna_ai_<company>.pdf`

The type is guessed from the job title. You can change it in the dropdown before downloading. The company name is lowercased with spaces and symbols removed (`Tata Consultancy Services` becomes `tataconsultancyservices`).
Generating again for the same company and type replaces the earlier PDF in `output/tailored-resumes/`. Master resumes are never modified.

### Job Tracker
Add, edit, and delete applications. You can search, filter by status or platform, and change status inline. Follow-up dates in the past are highlighted in red unless the status is Offer, Rejected, or Withdrawn. Choose **Custom…** in the platform dropdown to enter a platform that isn't listed.

## Where data is stored

```
data/
  prompts.json          your prompts (created on first run)
  applications.json     job tracker
  resumes.json          master resume list + extracted text
uploads/master-resumes/ original uploaded resume files
output/tailored-resumes/ generated PDFs
```

All of these are in `.gitignore`, along with `.env*`. Back them up yourself if they matter to you.
The Tailor page also keeps your current work in the browser's localStorage, so switching pages doesn't lose it. **Start over** clears it.

## Troubleshooting

- **"Could not find the Claude Code CLI"**: set `CLAUDE_CLI_PATH` in `.env.local` to the full path of `claude` / `claude.exe`.
- **A step fails with an auth or usage error**: run `claude` in a terminal and make sure you're logged in and within your usage limits.
- **"No text could be extracted"**: the PDF is probably a scanned image. Paste the text instead.
- **Generation stops if you leave the Tailor page.** Stay on the page until all steps finish. Use **Cancel generation** to stop early.

## Scripts

- `npm run dev`: start the app at http://localhost:3000
- `npm run build` / `npm start`: production build and run
- `npm run typecheck`: TypeScript check
