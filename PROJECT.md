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

- ## Current status (update after every finished step)
- Backend: /health works, Gemini key is set up locally. Next: PDF ingestion.
- Frontend: building from Frontend/FRONTEND_PLAN.md, phase by phase, with mock data (teammate updates this line).