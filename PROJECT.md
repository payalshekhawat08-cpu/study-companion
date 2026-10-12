# AI Study Companion (Multimodal AI Hackathon 2026, Track D)

Goal: a web app that turns lecture videos, textbook PDFs and slide decks into a
source-cited knowledge base, then runs grounded tutoring chat, adaptive quizzes,
and a learner model.

## Must-have features
1. Ingest PDFs, slides (.pptx) and videos. Every chunk keeps its origin:
   PDF page, slide number, or video timestamp. Tag chunks with topic/concepts.
2. Grounded chat: answer ONLY from retrieved chunks, cite exact page/slide/timestamp.
   If the material doesn't cover the question, say so clearly (never answer from outside knowledge silently).
3. Quizzes (MCQ, short answer, numerical) on a topic the student chooses. Each question is
   tagged with topic, source location, difficulty. Verify answers with a second AI call.
   Never repeat questions. Give cited feedback and a weak-topics report.
4. Learner model: per-topic mastery that updates after each answer (simple Bayesian
   Knowledge Tracing). New students start with a short diagnostic quiz.
5. Evaluation: RAGAS metrics (faithfulness, answer relevancy, context precision/recall)
   on a test set, plus simulated students across sessions.

## Tech stack (final)
- Frontend: React + Vite + Tailwind CSS, shadcn/ui, Framer Motion, Recharts, react-confetti, react-pdf (folder: Frontend/). Full build plan: Frontend/FRONTEND_PLAN.md. The frontend never calls an AI model and never holds an API key. It talks to the backend only through the API contract below.
- Backend: Python + FastAPI (folder: backend/)
- AI + embeddings: Gemini API (free tier), key stored in .env, never committed
- Vector DB: ChromaDB (local). Learner data: SQLite
- PDF: PyMuPDF. Slides: python-pptx. Video: youtube-transcript-api first, Gemini video/audio second
- Evaluation: RAGAS

## Constraints
- Beginner team. Keep code simple, with short comments explaining each part.
- Very limited internet: do not add packages beyond requirements.txt without asking.
- Do not use local embedding models or anything that downloads PyTorch.
- Frontend packages are limited to the list in Frontend/FRONTEND_PLAN.md. Backend packages are limited to requirements.txt.
- Backend must allow CORS from the frontend (http://localhost:5173 and
  http://127.0.0.1:5173), including the X-Student-Id header. Use FastAPI's built-in
  CORSMiddleware (no new package).
- File upload in FastAPI needs the `python-multipart` package. Check it is in
  requirements.txt before using /upload.
- Frontend settings (VITE_USE_MOCK, VITE_API_URL) live in Frontend/.env.local, which  must be git-ignored. It holds the backend address only. Never commit it. NEVER put the Gemini key, or any secret, in a variable starting with VITE_ (the browser can read it).
- Cost safety: use a Gemini key from a project on the free tier (no billing linked).
  Do not retry automatically after a 429. Test with small files first. Run RAGAS
  evaluation on a small test set only (it makes many AI calls).
## Team rules
- Backend owner works only in backend/. Frontend owner works only in Frontend/.
  Never edit the other person's folder.
- Never commit .env or any API key.
- Do not add packages without asking the team first.
- Do not change the API contract below on your own. Tell the other person first,
  then update this file.
- Run git pull before starting work and git push when finished.
- If Frontend/FRONTEND_PLAN.md and this file disagree, this file wins. Tell the other person and fix whichever one is wrong.
- Only the backend decides whether a quiz answer is correct. Question data never contains the answer; it is sent back only after the student answers.
- AI assistants (Copilot) never run git commit or git push and never edit PROJECT.md.
  The human owner does git pull / git push, updates "Current status", and edits
  the API contract here after agreeing with the other person.

## API contract (frontend <-> backend) - change only by agreement
Every request carries the header X-Student-Id (a random id from the frontend; the
backend may ignore it). Errors: the backend returns a normal HTTP error status;
use 429 for quota limits.

Citation object (used everywhere):
{ id, label, file_id, source_file, source_type: "pdf" | "slide" | "video",
  location, excerpt }
location = page number (pdf), slide number (slide), seconds (video).
Example labels: "Textbook p.12", "Lecture 1, 14:32".

- POST /upload  (multipart "file", OR JSON {youtube_url})
    -> { file_id, status: "processing" }
- GET  /library
    -> list of { file_id, name, source_type, status: "processing"|"ready"|"failed",
                 topics: [...], video_url (YouTube only, else null) }
- GET  /files/{file_id}
    -> the original uploaded file (used by the frontend source viewer)
- POST /ask { question, source_ids: [] }   (empty list = all sources)
    -> { answer, grounded, citations: [citation, ...] }
    If not covered: grounded: false, citations: [], answer says it isn't covered.
- POST /quiz { topics: [], source_ids: [], types: ["mcq","short","numerical"],
               count, difficulty: "easy"|"medium"|"hard"|"mixed", diagnostic: false }
    -> list of { id, type, question, options (mcq only), topic, difficulty,
                 source: citation }       (never contains the correct answer)
- POST /quiz/answer { question_id, answer }
    answer = option index (mcq), text (short), number (numerical)
    -> { correct, feedback, citation, correct_answer (optional),
         misconception (optional) }
- GET  /mastery
    -> { topics: [{ name, mastery 0..1 }], weak: [...],
         has_history (optional), history: [{ date, mastery }] (optional),
         streak_days (optional) }
- GET  /topics  (optional, only for the course map)
    -> list of { name, prerequisites: [names] }
    ### Contract clarifications (agreed, not new endpoints)
- `source_ids` (in /ask and /quiz) are `file_id` values from GET /library.
  Empty list = all sources. `topics` are topic names exactly as returned by GET /library.
- Starter quiz: when `diagnostic: true`, the backend ignores `count`, `types` and
  `difficulty`, and returns exactly 5 MCQ questions covering the topics of all
  "ready" sources. (MCQ only keeps it fast and cheap.)
- `count` is limited to 3-15. The backend must reject or cap anything above 15.
- GET /files/{file_id} is loaded directly by the browser (PDF viewer, video player),
  which cannot send custom headers. The backend must NOT require X-Student-Id there.
- These endpoints only read stored data and must NEVER call the Gemini API:
  GET /library, GET /files/{file_id}, GET /mastery, GET /topics.
- X-Student-Id: the backend must use it to keep each student's mastery separate
  (needed for simulated students in the evaluation).

- ## Current status (update after every finished step)
- Backend: ingestion (PDF, slides, YouTube), /ask, /quiz, /quiz/answer, learner model, /mastery and the starter quiz are built and tested. Evaluation scripts are ready; the real RAGAS-style run is pending the daily Gemini reset.
- Frontend: building from Frontend/FRONTEND_PLAN.md, phase by phase, with mock data (teammate updates this line).