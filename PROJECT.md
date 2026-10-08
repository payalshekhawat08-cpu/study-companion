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
- Frontend: plain HTML, CSS, JavaScript (folder: frontend/), already started with fake data
- Backend: Python + FastAPI (folder: backend/)
- AI + embeddings: Gemini API (free tier), key stored in .env, never committed
- Vector DB: ChromaDB (local). Learner data: SQLite
- PDF: PyMuPDF. Slides: python-pptx. Video: youtube-transcript-api first, Gemini video/audio second
- Evaluation: RAGAS

## Constraints
- Beginner team. Keep code simple, with short comments explaining each part.
- Very limited internet: do not add packages beyond requirements.txt without asking.
- Do not use local embedding models or anything that downloads PyTorch.
## Team rules
- Backend owner works only in backend/. Frontend owner works only in Frontend/.
  Never edit the other person's folder.
- Never commit .env or any API key.
- Do not add packages without asking the team first.
- Do not change the API contract below on your own. Tell the other person first,
  then update this file.
- Run git pull before starting work and git push when finished.

## API contract (frontend <-> backend) - draft, change only by agreement
Every answer carries citations: { id, label, source_file,
source_type: "pdf" | "slide" | "video", location, excerpt }
(location = page number, slide number, or seconds for video).
If the material doesn't cover a question, the backend says grounded: false.

- POST /upload              -> { file_id, status }
- GET  /library             -> list of sources with their topics
- POST /ask {question}      -> { answer, grounded, citations: [...] }
- POST /quiz {topics, types, count} -> list of { id, type, question, options,
                                topic, source, difficulty }
- POST /quiz/answer {id, answer}    -> { correct, feedback, citation }
- GET  /mastery             -> { topics: [{ name, mastery }], weak: [...] }

## Current status (update after every finished step)
- Backend: /health works. Next: PDF ingestion.
- Frontend: (teammate fills in)