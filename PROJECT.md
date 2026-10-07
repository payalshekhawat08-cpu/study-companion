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