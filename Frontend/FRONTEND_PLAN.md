# AI Study Companion: Frontend Build Plan

Read this whole file before writing any code. It is the single source of truth for building the frontend. It was written to match the project's backend (Python, FastAPI, ChromaDB, Gemini) and the hackathon requirements, so follow it exactly.

The product: a student uploads course material (PDFs, slide decks, lecture videos). The app answers questions using only that material, with citations that open the exact page, slide or video timestamp. It also runs adaptive quizzes and shows per-topic mastery.

---

## 0. Binding rules (these override everything else in this file)

1. Work ONLY inside `Frontend/`. Never create, edit or delete anything in `backend/`. Never edit `requirements.txt`, `.env`, `.env.example` (in the project root), `.gitignore`, `PROJECT.md` or `.github/`.
2. If `Frontend/` already contains a Vite project, do NOT recreate it. Inspect it, tell me what already exists, and continue from it. Delete only the old plain-HTML starter files (`index.html`, `script.js`, `style.css`) if they are still the old starter. Keep this file.
3. The frontend is only a user interface. It never calls an AI model, never creates embeddings, never touches a vector database, and never contains an API key. All intelligence lives in the backend.
4. All communication with the backend goes through ONE file: `src/api.js`. Screens and components never call `fetch` directly.
5. Build with mock data first. `src/api.js` has two modes chosen by `VITE_USE_MOCK`. The default (when the variable is missing) is mock mode, which returns fake data from `src/mock/`. Real mode calls the backend at `VITE_API_URL` (default `http://127.0.0.1:8000`). Both modes return exactly the same shapes, defined in Section 3. Do not switch to real mode until I ask. Only variables starting with `VITE_` are used, and they are public, so never put secrets in them.
6. Use ONLY the packages in Section 2. Install everything in one go, because my internet is very limited. Ask me before adding anything else.
7. JavaScript only (no TypeScript). No router library: navigation between screens uses simple React state. No Markdown library: render answer text as plain text, keeping line breaks.
8. Never use `dangerouslySetInnerHTML`. Text that comes from the backend (answers, questions, feedback, excerpts) must always be rendered as plain text.
9. No external URLs at runtime: no CDN scripts, no Google Fonts link, no hotlinked images. Icons come from `lucide-react`. The font comes from an `@fontsource` package. The pdf.js worker used by react-pdf must be loaded from the installed package, never from a CDN.
10. Do not run `git commit` or `git push`. At the end of every phase, run `git status` and show me the result. Never commit `node_modules/` or `dist/` (the root `.gitignore` already ignores them; just verify, do not edit it).
11. Do NOT build any of these (they are not part of the project): leaderboard, friends, badges, XP or levels, Netflix-style course cards, login or accounts, a "PDF plus outside knowledge" toggle, voice input, flashcard/summary/ELI5 buttons that call endpoints not listed in Section 3.
12. If this file conflicts with `PROJECT.md`, `PROJECT.md` wins. Tell me about the conflict instead of guessing. If anything is unclear, ask before coding.
13. Work one phase at a time (Section 7). Finish a phase, run the app, report, then STOP and wait for me to say "next".
14. Keep code simple and readable, with short comments. Explain what you did in simple words, because I am a beginner. Do not modify files I have not asked you to change.

---

## 1. Hackathon requirements this frontend must support

The UI exists to serve these requirements. If a feature is not here, it is not needed.

| Requirement | What the frontend must provide |
|---|---|
| 1a. Ingest PDFs, slides and videos | Library screen: upload PDF, PPTX and video files, or add a YouTube link; show processing status |
| 1b, 1c. Topics and concepts, linked to origin | Show the topics found in each source; every chunk shown anywhere has a citation |
| 2a. Cited excerpts that open the exact page, slide or timestamp | Citation chips open a source viewer at the exact location |
| 2b. Decline or flag uncovered questions | A clearly different "not covered in your material" state |
| 3a. Quizzes (MCQ, short answer, numerical) with topic, source and difficulty tags | Quiz setup and quiz screens show these tags |
| 3c. Cited feedback per answer and a post-assessment report | Feedback with a citation after each answer; results screen with weak topics and likely misconceptions |
| 4a. Per-topic mastery | Dashboard shows mastery per topic and progress over sessions |
| 4b. New students with no history | First-run flow with a short diagnostic quiz |
| Dashboard deliverable | Dashboard screen |
| Optional 6a | Course map of topics and prerequisites (last phase, optional) |

---

## 2. Tech stack (fixed, do not change)

| Purpose | Tool |
|---|---|
| Framework | React + Vite (JavaScript) |
| Styling | Tailwind CSS |
| Components | shadcn/ui (the packages it requires itself, such as Radix primitives, class-variance-authority, clsx, tailwind-merge and sonner for toasts, are allowed) |
| Icons | lucide-react |
| Animations | Framer Motion |
| Charts | Recharts |
| Celebration | react-confetti (used only on the quiz results screen) |
| PDF viewer | react-pdf |
| Font | One font family from an `@fontsource` package (Space Grotesk) with a system-font fallback |

No other packages. Use the current official setup instructions for Vite, Tailwind and shadcn/ui.

---

## 3. Backend contract (frontend must match exactly)

The backend owner builds these endpoints. Mock mode must return identical shapes. If you need a new field or endpoint, ask me; do not invent one.

Every request sends the header `X-Student-Id`, a random id created once and kept in `localStorage`. The backend may ignore it.

### Citation object (used everywhere)

```json
{
  "id": "c1",
  "label": "Textbook p.12",
  "file_id": "f_01",
  "source_file": "textbook.pdf",
  "source_type": "pdf",
  "location": 12,
  "excerpt": "A stack is a last-in, first-out structure..."
}
```

- `source_type` is `"pdf"`, `"slide"` or `"video"`.
- `location` is a page number for pdf, a slide number for slide, and a number of seconds for video.
- A video label looks like `"Lecture 1, 14:32"` with `location` 872.

### Endpoints

**POST /upload**
- Request: multipart form with a `file` field, OR JSON `{ "youtube_url": "..." }`.
- Response: `{ "file_id": "f_01", "status": "processing" }`

**GET /library**
- Response: list of `{ "file_id", "name", "source_type", "status", "topics": ["Stacks", "Queues"], "video_url": null }`
- `status` is `"processing"`, `"ready"` or `"failed"`. `video_url` is set only for YouTube sources.

**GET /files/{file_id}**
- Returns the original uploaded file, used by the source viewer.

**POST /ask**
- Request: `{ "question": "...", "source_ids": [] }` (empty list means all sources).
- Response when covered: `{ "answer": "...", "grounded": true, "citations": [ ...citation objects ] }`
- Response when not covered: `{ "answer": "This isn't covered in your material.", "grounded": false, "citations": [] }`
- The frontend never shows outside knowledge. `grounded: false` always triggers the "not covered" state.

**POST /quiz**
- Request: `{ "topics": [], "source_ids": [], "types": ["mcq", "short", "numerical"], "count": 5, "difficulty": "mixed", "diagnostic": false }`
- `difficulty` is `"easy"`, `"medium"`, `"hard"` or `"mixed"`. Empty `topics` or `source_ids` means all.
- Response: a list of questions:
```json
{
  "id": "q1",
  "type": "mcq",
  "question": "Which structure is last-in, first-out?",
  "options": ["Queue", "Stack", "Tree", "Graph"],
  "topic": "Stacks",
  "difficulty": "easy",
  "source": { "...citation object..." }
}
```
- `options` exists only for `mcq`. Questions NEVER contain the correct answer.

**POST /quiz/answer**
- Request: `{ "question_id": "q1", "answer": 1 }`. The answer is an option index for mcq, text for short, and a number for numerical.
- Response:
```json
{
  "correct": false,
  "correct_answer": "Stack",
  "feedback": "A stack removes the most recently added item first.",
  "citation": { "...citation object..." },
  "misconception": "Confusing stack order with queue order."
}
```
- `correct_answer` and `misconception` are optional. Only the backend decides whether an answer is correct.

**GET /mastery**
- Response:
```json
{
  "topics": [{ "name": "Stacks", "mastery": 0.72 }],
  "weak": ["Queues"],
  "has_history": true,
  "history": [{ "date": "2026-10-08", "mastery": 0.55 }],
  "streak_days": 3
}
```
- `mastery` is between 0 and 1. `has_history`, `history` and `streak_days` are optional. If `has_history` is missing, treat an empty `topics` list as a new student.

**GET /topics** (optional, only for the course map in the last phase)
- Response: list of `{ "name": "Stacks", "prerequisites": ["Arrays"] }`

### Error handling (all endpoints)
- Show a friendly toast, never a crash or a raw error. For HTTP 429 or quota errors show: "The AI is busy. Please wait a moment and try again."
- Show loading states for every request and disable the related button while waiting.
- If the backend is unreachable in real mode, show: "Can't reach the study server. Is it running?"

---

## 4. Design

Goal: a dark-first interface that feels calm, modern and hand-made. It must NOT look AI-generated.

**Do**
- Dark theme only. Define colours as tokens (CSS variables used by Tailwind):
  - background `#0E1013`, surface `#16191E`, raised surface `#1D2128`, border `#2A2F37`
  - text `#E8EAED`, muted text `#9AA3AF`
  - ONE accent colour: amber `#F2A65A`, used for primary buttons, active navigation and citation chips
  - success `#4CAF7A` and error `#E5534B`, used only for correct and wrong states
- Flat surfaces with 1px borders. Very light shadows or none.
- A consistent 4px spacing scale, left-aligned layouts, a clear visual hierarchy. Not everything is a centred card.
- Corner radius 8 to 12px, used consistently.
- One font family (Space Grotesk) with clear sizes: page title, section title, body, caption.
- Short, plain copy. Friendly but not slangy.
- Icons from lucide-react only, used sparingly.
- Motion with Framer Motion only where it helps: a panel sliding open, a message appearing, a correct or wrong state, a screen change. Keep it 150 to 250 ms. Respect `prefers-reduced-motion`.
- Confetti only on the quiz results screen, only when the score is 80 percent or higher.

**Do not**
- No purple, blue or neon gradients. No glow or glassmorphism effects. No emoji in headings or buttons. No mascot. No identical rounded boxes with the same shadow everywhere.

**Layout**
- Desktop: left sidebar (Home, Library, Chat, Quiz, Progress), slim top bar with the page title.
- Mobile (under 768px): the sidebar becomes a bottom navigation bar, and the source viewer opens as a full-screen drawer.
- Accessibility: visible keyboard focus, `aria-label` on icon-only buttons, readable contrast.

---

## 5. Screens

Navigation between screens is React state. Keep the student's name and chosen goal in `localStorage` (the goal is only used for the greeting and is never sent to the backend).

### 5.1 Welcome and first run (requirement 4b)
- Shown when no name is saved. Asks for a first name and a goal (exam prep, learn a topic, homework help).
- Then: if the library has no ready source, send the student to Library. If it has sources and the student has no history, offer "Take a 5-question starter quiz" (calls `POST /quiz` with `diagnostic: true`). When the starter quiz finishes, go to the dashboard.

### 5.2 Library
- A large drag-and-drop zone. Accepted files: `.pdf`, `.pptx`, and video files `.mp4`, `.mkv`, `.webm`, `.mov`. Reject anything else with a clear message. Warn if a file is over 200 MB that processing may be slow.
- A field to add a YouTube link (sent as `youtube_url`).
- A list of sources from `GET /library`: name, type icon, status badge (processing, ready, failed) and the topics found as small chips. While any source is "processing", refresh the list every 3 seconds, and stop when none are.
- Per source: "Open" (opens the source viewer at the start) and "Ask about this" (goes to Chat with the source filter set to it).

### 5.3 Chat (requirements 2a, 2b)
- Desktop: source viewer on the left, chat on the right. The viewer is empty (with a hint) until a citation is clicked.
- A source filter above the chat: "All sources" is the default. The student may select specific sources, which are sent as `source_ids`.
- User and assistant messages. The assistant's answer is typed out word by word as an animation over the text already received (the backend does not stream). Render as plain text.
- Under every grounded answer: citation chips (icon by type plus `label`). Never show a grounded answer without its chips.
- Clicking a chip opens the source viewer (5.4) at that citation.
- When `grounded` is false, show a visibly different "Not covered in your material" card instead of a normal answer, with the backend's message and two buttons: "Rephrase" (focuses the input) and "Browse library". No outside search button.
- Follow-up chips after an answer: "Explain simpler" and "Give an example" send an ordinary question to `POST /ask` (for example, "Explain more simply: <previous question>"). "Quiz me on this" opens Quiz setup with the sources from that answer's citations preselected.
- Loading text such as "Searching your material..." while waiting. Input disabled while waiting.

### 5.4 Source viewer (requirement 2a)
Opens from any citation chip, anywhere in the app.
- `pdf`: show the page `location` using react-pdf, loading the file from `GET /files/{file_id}`. Best effort: highlight the `excerpt` text on the page. If the text cannot be found, just show the page.
- `slide`: show "Slide N", the excerpt text, and the slide image only if the source provides one.
- `video`: an HTML5 video loaded from `GET /files/{file_id}` that jumps to `location` seconds. If the library item has a `video_url` (YouTube), show an embedded player starting at that second instead.
- Also show the file name, the location label and the excerpt as plain text.
- If a file is missing (always the case for some mock items), show a friendly placeholder, not an error.

### 5.5 Quiz (requirements 3a, 3c)
**Setup:** choose scope (all material, specific sources, or specific topics taken from the library's topics), question types (MCQ, short answer, numerical; at least one), number of questions (3 to 15), and difficulty (easy, medium, hard, mixed). Button: "Start quiz" (calls `POST /quiz`).

**Taking the quiz:**
- One question per screen with a progress bar. Each question shows small tags for topic, difficulty and source (the source is a citation chip). An elapsed-time display is optional and is never sent anywhere.
- Input by type: option buttons for mcq, a text box for short, a number box for numerical.
- "Submit" calls `POST /quiz/answer`. Show the result state from the response only: green for correct, a short shake and red for wrong (no shake with reduced motion). Show `feedback`, the `correct_answer` if provided, the feedback's citation chip, and the `misconception` note if provided. Then a "Next" button.
- The frontend NEVER decides whether an answer is correct.

**Results:**
- Score, plus a per-topic breakdown computed from the quiz answers (count of correct and wrong per topic).
- "Weak topics": topics where any answer was wrong. "Likely misconceptions": the `misconception` texts received, if any.
- Buttons: "Retry weak topics" (a new `POST /quiz` with those topics), "Go to dashboard".
- Confetti only when the score is 80 percent or higher.

### 5.6 Dashboard / Progress (requirement 4a)
Data comes from `GET /mastery` and `GET /library`.
- Greeting with the saved name.
- "Continue learning": a shortcut back to the last screen used (kept in `localStorage`).
- "Mastery by topic": a Recharts horizontal bar chart (0 to 100 percent), sorted from weakest to strongest.
- "Weak topics": a list from `weak`, each with a "Practice" button that opens Quiz setup with that topic selected.
- "Progress over sessions": a Recharts line chart from `history` when it has at least 2 points; otherwise a short empty-state message.
- "Your material": count of ready sources with an "Add material" button.
- Show the streak ONLY if `streak_days` is present in the response. Never invent numbers.
- Every card has a proper empty state (for example, for a new student: "Take the starter quiz to see your progress").

### 5.7 Course map (optional, last phase)
A simple diagram of topics and their prerequisites from `GET /topics`, built with plain HTML and CSS or SVG (no new packages). Colour each topic by its mastery. Clicking a topic opens Quiz setup with that topic selected.

---

## 6. Mock data (`src/mock/`)

- Use a neutral sample course: Data Structures (stacks, queues, sorting).
- Library: three sources (a PDF, a PPTX and a video) with status "ready" and topics. Make one extra source "processing" so the status UI can be seen.
- `/ask`: if the question contains "stack", return a grounded answer with two citations (a PDF page and a video timestamp). If it contains "queue", return a grounded answer with a slide citation. Anything else returns `grounded: false`.
- `/quiz`: at least 8 questions across mcq, short and numerical, with varied topics and difficulties.
- `/quiz/answer`: the correct answers live only inside the mock layer, never inside the question data given to components. Include a `misconception` for some wrong answers.
- `/mastery`: several topics, one or two weak, a `history` of 4 or more points. Make the mock vary a little after answering so the dashboard visibly changes.
- Delay every mock call by 400 to 900 ms so loading states are visible.
- Sample files go in `public/samples/`. If `sample.pdf` or `sample.mp4` is missing, the viewer shows the friendly placeholder. Tell me which sample files to add.

---

## 7. Build phases (do one, report, stop, wait for "next")

**Phase 0: Setup**
- Follow rule 2 about existing work. Create or confirm the Vite React project in `Frontend/`, install the Section 2 packages in one go, set up Tailwind, shadcn/ui and the font, and add the design tokens from Section 4.
- Create `src/api.js` with both modes, the `X-Student-Id` header, the error handling from Section 3, and the mock data from Section 6.
- Run `npm run dev`, confirm a page opens, and give me the start command, the URL, and `git status`.

**Phase 1: App shell**
- Sidebar and top bar (bottom navigation on mobile), screen switching by state, and the Welcome flow from 5.1. Other screens may be simple placeholders.

**Phase 2: Chat and source viewer** (5.3 and 5.4)

**Phase 3: Library** (5.2)

**Phase 4: Quiz** (5.5), including the starter quiz from 5.1

**Phase 5: Dashboard** (5.6)

**Phase 6: Polish**
- Responsive layout checks, empty and error states, keyboard focus, reduced motion, and confetti on the results screen.

**Phase 7 (optional): Course map** (5.7)

At the end of each phase: run the app, fix errors yourself, list what now works and what is still a placeholder, show `git status`, and stop.

---

## 8. Final self-check before reporting any phase

- Did I touch anything outside `Frontend/`? (It must be no.)
- Does any screen call `fetch` outside `src/api.js`? (It must be no.)
- Is there any API key, AI call, or external URL in the frontend? (It must be no.)
- Does every grounded answer show citations that open the exact page, slide or timestamp?
- Is "not covered" visually different from a normal answer?
- Does the frontend decide whether a quiz answer is correct anywhere? (It must be no.)
- Did I add any package outside Section 2, or any feature from rule 11? (It must be no.)
