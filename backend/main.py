import json
import logging
import math
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from fastapi import (
    BackgroundTasks,
    FastAPI,
    File,
    Header,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from pptx import Presentation

from config import P_INIT, SIMILARITY_THRESHOLD, TEXT_DAILY_BUDGET, TOP_K
from gemini_client import (
    GeminiError,
    GeminiQuotaError,
    check_gemini_health,
    embed_query,
    generate_json,
)
from ingest import MAX_FILE_SIZE, MAX_VIDEO_FILE_SIZE, process_source
from prompts import GROUNDED_ANSWER_PROMPT, QUIZ_VERIFY_PROMPT, QUIZ_WRITE_PROMPT
from store import (
    create_source,
    get_available_mcq_questions,
    get_question,
    get_diagnostic_set_questions,
    get_diagnostic_set_size,
    get_quiz_chunks,
    get_ready_source_signature,
    get_recent_question_texts,
    get_source,
    get_student_question_status,
    get_topics,
    get_student_mastery,
    get_unseen_questions,
    initialize_store,
    mark_question_answered,
    fail_interrupted_sources,
    list_sources,
    save_quiz_questions,
    save_diagnostic_set,
    search_chunks,
    serve_questions,
    start_source_retry,
    TextBudgetExceeded,
    update_student_mastery,
)

BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
logger = logging.getLogger(__name__)
UNSUPPORTED_ANSWER = "This isn’t covered in your material."
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".webm", ".mov"}

app = FastAPI()


class AskRequest(BaseModel):
    question: str = Field(min_length=1)
    source_ids: list[str] = Field(default_factory=list)


class QuizRequest(BaseModel):
    topics: list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)
    types: list[str] = Field(default_factory=lambda: ["mcq", "short", "numerical"])
    count: int = 5
    difficulty: str = "mixed"
    diagnostic: bool = False


class QuizAnswerRequest(BaseModel):
    question_id: str
    answer: str | int | float


@app.on_event("startup")
def startup():
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    initialize_store()
    fail_interrupted_sources()


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/health/gemini")
def gemini_health():
    result = check_gemini_health()
    result["text_daily_budget"] = TEXT_DAILY_BUDGET
    return result


@app.get("/")
def root():
    return {"status": "ok", "docs": "/docs"}


def _youtube_video_id(url: str) -> str:
    try:
        parsed = urlparse(url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="The YouTube URL is invalid.") from exc
    host = (parsed.hostname or "").lower().rstrip(".")
    is_youtube_host = (
        host == "youtube.com"
        or host.endswith(".youtube.com")
        or host == "youtu.be"
        or host.endswith(".youtu.be")
    )
    if parsed.scheme not in {"http", "https"} or not is_youtube_host:
        raise HTTPException(
            status_code=400,
            detail="Only YouTube and youtu.be URLs are accepted.",
        )
    if host == "youtu.be" or host.endswith(".youtu.be"):
        video_id = parsed.path.strip("/").split("/", 1)[0]
    else:
        video_id = parse_qs(parsed.query).get("v", [""])[0]
        if not video_id:
            parts = [part for part in parsed.path.split("/") if part]
            if len(parts) >= 2 and parts[0] in {"embed", "shorts", "live"}:
                video_id = parts[1]
    if not re.fullmatch(r"[A-Za-z0-9_-]{6,20}", video_id):
        raise HTTPException(status_code=400, detail="The YouTube URL has no valid video ID.")
    return video_id


@app.post("/upload")
async def upload(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile | None = File(default=None),
):
    if file is None:
        if "application/json" in request.headers.get("content-type", ""):
            try:
                body = await request.json()
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="Invalid JSON body.") from exc
            if isinstance(body, dict) and isinstance(body.get("youtube_url"), str):
                video_id = _youtube_video_id(body["youtube_url"])
                file_id = str(uuid.uuid4())
                try:
                    create_source(
                        file_id,
                        f"YouTube {video_id}",
                        source_type="video",
                        video_url=body["youtube_url"],
                        storage_ext="",
                    )
                except sqlite3.Error as exc:
                    logger.error("Could not record YouTube source %s: %s", file_id, exc)
                    raise HTTPException(
                        status_code=500,
                        detail="The video could not be added to your library.",
                    ) from exc
                background_tasks.add_task(process_source, file_id)
                return {"file_id": file_id, "status": "processing"}
        raise HTTPException(
            status_code=400,
            detail="Upload a PDF, PPTX, or video file, or provide a YouTube URL.",
        )

    extension = Path(file.filename or "").suffix.lower()
    if extension == ".pdf":
        source_type = "pdf"
        max_size = MAX_FILE_SIZE
    elif extension == ".pptx":
        source_type = "slide"
        max_size = MAX_FILE_SIZE
    elif extension in VIDEO_EXTENSIONS:
        source_type = "video"
        max_size = MAX_VIDEO_FILE_SIZE
    else:
        raise HTTPException(
            status_code=400,
            detail="Supported files are PDF, PPTX, MP4, MKV, WEBM, and MOV.",
        )

    file_id = str(uuid.uuid4())
    upload_path = UPLOADS_DIR / f"{file_id}{extension}"
    total_size = 0
    first_bytes = b""
    try:
        with upload_path.open("wb") as saved_file:
            while True:
                content = await file.read(1024 * 1024)
                if not content:
                    break
                if not first_bytes:
                    first_bytes = content[:8]
                    if extension == ".pdf" and not first_bytes.startswith(b"%PDF"):
                        raise HTTPException(status_code=400, detail="The file is not a valid PDF.")
                    if extension == ".pptx" and not first_bytes.startswith(b"PK"):
                        raise HTTPException(status_code=400, detail="The file is not a valid PPTX.")
                total_size += len(content)
                if total_size > max_size:
                    limit = "300 MB" if source_type == "video" else "100 MB"
                    raise HTTPException(
                        status_code=400,
                        detail=f"The uploaded file is too large. Maximum size is {limit}.",
                    )
                saved_file.write(content)

        if not first_bytes:
            raise HTTPException(status_code=400, detail="The uploaded file is empty.")
        if source_type == "slide":
            try:
                Presentation(str(upload_path))
            except Exception as exc:
                raise HTTPException(
                    status_code=400,
                    detail="The uploaded file is not a readable PowerPoint presentation.",
                ) from exc

        source_name = Path(file.filename or f"uploaded{extension}").name
        create_source(
            file_id,
            source_name,
            source_type=source_type,
            storage_ext=extension,
        )
    except HTTPException:
        upload_path.unlink(missing_ok=True)
        raise
    except OSError as exc:
        upload_path.unlink(missing_ok=True)
        logger.error("Could not save uploaded file %s: %s", file_id, exc)
        raise HTTPException(
            status_code=500,
            detail="The uploaded file could not be saved. Please try again.",
        ) from exc
    except sqlite3.Error as exc:
        upload_path.unlink(missing_ok=True)
        logger.error("Could not record uploaded file %s: %s", file_id, exc)
        raise HTTPException(
            status_code=500,
            detail="The file could not be added to your library. Please try again.",
        ) from exc
    finally:
        await file.close()

    background_tasks.add_task(process_source, file_id)
    return {"file_id": file_id, "status": "processing"}


@app.get("/library")
def library():
    return list_sources()


@app.post("/sources/{file_id}/retry")
def retry_source(file_id: str, background_tasks: BackgroundTasks):
    try:
        normalized_id = str(uuid.UUID(file_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Source not found.") from exc

    source = get_source(normalized_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found.")
    if source["status"] != "failed":
        raise HTTPException(
            status_code=409,
            detail=f"Source cannot be retried while status is '{source['status']}'.",
        )
    if not start_source_retry(normalized_id):
        raise HTTPException(
            status_code=409,
            detail="Source status changed before retry could start. Refresh the library.",
        )
    background_tasks.add_task(process_source, normalized_id)
    return {"file_id": normalized_id, "status": "processing"}


@app.get("/topics")
def topics():
    return get_topics()


@app.get("/mastery")
def mastery(
    student_id: str = Header(default="anonymous", alias="X-Student-Id"),
):
    student_id = student_id.strip() or "anonymous"
    data = get_student_mastery(student_id)
    answered_topics = data["mastery"]
    topic_values = {
        topic: values["p_known"]
        for topic, values in answered_topics.items()
    }
    for source in list_sources():
        if source["status"] == "ready":
            for topic in source["topics"]:
                topic_values.setdefault(topic, P_INIT)

    weak = sorted(
        (
            (topic, values["p_known"])
            for topic, values in answered_topics.items()
            if values["answers_count"] > 0 and values["p_known"] < 0.5
        ),
        key=lambda item: (item[1], item[0].casefold()),
    )
    return {
        "topics": [
            {"name": topic, "mastery": topic_values[topic]}
            for topic in sorted(topic_values, key=str.casefold)
        ],
        "weak": [topic for topic, _ in weak],
        "has_history": bool(answered_topics),
        "history": data["history"],
        "streak_days": data["streak_days"],
    }


@app.get("/files/{file_id}")
def get_file(file_id: str):
    try:
        parsed_file_id = uuid.UUID(file_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="File not found.") from exc

    normalized_id = str(parsed_file_id)
    source = get_source(normalized_id)
    if source is None or not source["storage_ext"]:
        raise HTTPException(status_code=404, detail="File not found.")

    file_path = UPLOADS_DIR / f"{normalized_id}{source['storage_ext']}"
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    media_types = {
        ".pdf": "application/pdf",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".mp4": "video/mp4",
        ".mkv": "video/x-matroska",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
    }
    return FileResponse(
        file_path,
        media_type=media_types.get(source["storage_ext"], "application/octet-stream"),
        filename=source["name"],
    )


def _citation(chunk: dict) -> dict:
    metadata = chunk["metadata"]
    source_name = Path(metadata["source_file"]).stem
    location = metadata["location"]
    source_type = metadata["source_type"]
    if source_type == "pdf":
        label = f"{source_name} p.{location}"
    elif source_type == "slide":
        label = f"{source_name}, slide {location}"
    else:
        seconds = int(location)
        label = f"{source_name}, {seconds // 60}:{seconds % 60:02d}"

    excerpt = " ".join(chunk["text"].split())
    if len(excerpt) > 300:
        excerpt = excerpt[:297].rstrip() + "..."
    return {
        "id": chunk["chunk_id"],
        "label": label,
        "file_id": metadata["file_id"],
        "source_file": metadata["source_file"],
        "source_type": source_type,
        "location": location,
        "excerpt": excerpt,
    }


def _select_quiz_chunks(chunks: list[dict], limit: int = 30) -> list[dict]:
    by_topic: dict[str, list[dict]] = {}
    for chunk in chunks:
        topic = chunk["metadata"].get("topic") or "General"
        by_topic.setdefault(topic, []).append(chunk)

    selected = []
    while len(selected) < limit and any(by_topic.values()):
        for topic in sorted(by_topic):
            if by_topic[topic] and len(selected) < limit:
                selected.append(by_topic[topic].pop(0))
    return selected


def _spread_questions(
    questions: list[dict],
    limit: int = 5,
    unique_topics_only: bool = False,
) -> list[dict]:
    by_topic: dict[str, list[dict]] = {}
    seen_ids = set()
    for question in questions:
        if question["id"] in seen_ids:
            continue
        seen_ids.add(question["id"])
        by_topic.setdefault(question["topic"], []).append(question)

    selected = []
    topics = sorted(by_topic, key=str.casefold)
    for topic in topics:
        if by_topic[topic] and len(selected) < limit:
            selected.append(by_topic[topic].pop(0))
    if unique_topics_only:
        return selected

    while len(selected) < limit and any(by_topic.values()):
        for topic in topics:
            if by_topic[topic] and len(selected) < limit:
                selected.append(by_topic[topic].pop(0))
    return selected


def _verified_quiz_batch(
    chunks: list[dict],
    topics: list[str],
    types: list[str],
    difficulty: str,
    diagnostic: bool = False,
    diagnostic_source_signature: str | None = None,
) -> list[dict]:
    selected_chunks = _select_quiz_chunks(chunks)
    chunks_by_id = {chunk["chunk_id"]: chunk for chunk in selected_chunks}
    actual_topics = sorted(
        {chunk["metadata"].get("topic") or "General" for chunk in chunks}
    )
    recent = get_recent_question_texts(actual_topics)
    chunk_data = [
        {
            "chunk_id": chunk["chunk_id"],
            "topic": chunk["metadata"].get("topic") or "General",
            "text": chunk["text"],
        }
        for chunk in selected_chunks
    ]
    prompt = QUIZ_WRITE_PROMPT.format(
        types=json.dumps(types),
        difficulty=difficulty,
        topics=json.dumps(topics or actual_topics),
        diagnostic_instruction=(
            "Diagnostic: write ten candidate MCQs. The backend will select at "
            "most five; cover as many different available topics as possible "
            "and use each topic once before repeating."
            if diagnostic
            else ""
        ),
        chunks=json.dumps(chunk_data, ensure_ascii=False),
        recent=json.dumps(recent, ensure_ascii=False),
    )
    requested = 10
    try:
        write_text = generate_json(prompt, stage="quiz write")
    except (GeminiError, TextBudgetExceeded):
        logger.error(
            "QUIZ WRITE: asked for %s, Gemini returned no response, valid after reading the JSON 0",
            requested,
        )
        logger.info("QUIZ VERIFY: checked 0, OK 0, WRONG 0 (write call failed)")
        logger.exception("QUIZ WRITE: Gemini call failed.")
        raise
    try:
        write_result = json.loads(write_text)
    except json.JSONDecodeError as exc:
        logger.error("QUIZ WRITE: could not read JSON: %s", write_text[:200])
        logger.error(
            "QUIZ WRITE: asked for %s, Gemini returned unreadable JSON, valid after reading the JSON 0",
            requested,
        )
        logger.info("QUIZ VERIFY: checked 0, OK 0, WRONG 0 (write JSON was invalid)")
        raise HTTPException(
            status_code=502,
            detail=f"Gemini returned invalid JSON while writing quiz questions: {write_text[:200]}",
        ) from exc
    generated = (
        write_result.get("questions")
        if isinstance(write_result, dict)
        and isinstance(write_result.get("questions"), list)
        else []
    )
    returned_count = len(generated)
    if not generated:
        logger.info(
            "QUIZ WRITE: asked for %s, Gemini returned 0, valid after reading the JSON 0",
            requested,
        )
        logger.info("QUIZ VERIFY: checked 0, OK 0, WRONG 0 (no candidates to verify)")
        raise HTTPException(
            status_code=502,
            detail="Gemini returned no quiz questions in a valid questions list.",
        )

    generated = generated[:requested]
    valid_candidates = []
    allowed_topics = set(topics or actual_topics)
    for index, item in enumerate(generated):
        if not isinstance(item, dict):
            logger.warning("QUIZ WRITE: candidate %s skipped: not a JSON object", index)
            continue
        chunk_id = item.get("chunk_id")
        chunk = chunks_by_id.get(chunk_id) if isinstance(chunk_id, str) else None
        question_type = item.get("type")
        topic = item.get("topic")
        question_text = item.get("question")
        explanation = item.get("explanation")
        question_difficulty = item.get("difficulty")
        problem = ""
        if chunk is None:
            problem = "unknown chunk_id"
        elif not isinstance(question_type, str) or question_type not in types:
            problem = "unsupported question type"
        elif not isinstance(topic, str) or topic not in allowed_topics or topic != (
            chunk["metadata"].get("topic") or "General"
        ):
            problem = "topic does not match its source chunk"
        elif not isinstance(question_text, str) or not question_text.strip():
            problem = "missing question text"
        elif not isinstance(explanation, str) or not explanation.strip():
            problem = "missing explanation"
        elif not isinstance(question_difficulty, str) or question_difficulty not in {
            "easy",
            "medium",
            "hard",
        }:
            problem = "invalid difficulty"
        elif difficulty != "mixed" and question_difficulty != difficulty:
            problem = "difficulty does not match request"
        if problem:
            logger.warning("QUIZ WRITE: candidate %s skipped: %s", index, problem)
            continue

        options = None
        key_terms = item.get("key_terms", [])
        answer_value = item.get("correct_answer")
        if question_type == "mcq":
            options = item.get("options")
            correct_index = item.get("correct_index")
            if (
                not isinstance(options, list)
                or len(options) < 2
                or any(not isinstance(option, str) or not option.strip() for option in options)
                or not isinstance(correct_index, int)
                or isinstance(correct_index, bool)
                or correct_index < 0
                or correct_index >= len(options)
                or not isinstance(answer_value, str)
                or answer_value.strip() != options[correct_index].strip()
            ):
                logger.warning(
                    "QUIZ WRITE: candidate %s skipped: invalid MCQ options or correct answer",
                    index,
                )
                continue
            correct_answer = str(correct_index)
            key_terms = []
        elif question_type == "short":
            if (
                not isinstance(answer_value, (str, int, float))
                or isinstance(answer_value, bool)
                or not isinstance(key_terms, list)
                or not key_terms
                or any(not isinstance(term, str) or not term.strip() for term in key_terms)
            ):
                logger.warning(
                    "QUIZ WRITE: candidate %s skipped: missing short-answer key terms",
                    index,
                )
                continue
            correct_answer = str(answer_value)
        elif question_type == "numerical":
            if (
                not isinstance(answer_value, (str, int, float))
                or isinstance(answer_value, bool)
                or _extract_number(answer_value) is None
            ):
                logger.warning(
                    "QUIZ WRITE: candidate %s skipped: invalid numerical answer",
                    index,
                )
                continue
            correct_answer = str(answer_value)
            key_terms = []
        else:
            continue

        misconception = item.get("misconception_note")
        if not isinstance(misconception, str) or not misconception.strip():
            misconception = None
        normalized = {
            "id": str(uuid.uuid4()),
            "topic": topic,
            "type": question_type,
            "difficulty": question_difficulty,
            "question": question_text.strip(),
            "options": options,
            "correct_answer": correct_answer,
            "key_terms": key_terms,
            "explanation": explanation.strip(),
            "misconception_note": misconception,
            "source_citation": _citation(chunk),
            "source_file_id": chunk["metadata"]["file_id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_diagnostic": diagnostic,
            "diagnostic_source_signature": (
                diagnostic_source_signature if diagnostic else None
            ),
        }
        valid_candidates.append((index, item, chunk, normalized))

    logger.info(
        "QUIZ WRITE: asked for %s, Gemini returned %s, valid after reading the JSON %s",
        requested,
        returned_count,
        len(valid_candidates),
    )
    verification_data = [
        {
            "index": index,
            "question": item,
            "chunk_text": chunk["text"],
        }
        for index, item, chunk, _ in valid_candidates
    ]
    verify_prompt = QUIZ_VERIFY_PROMPT.format(
        questions=json.dumps(verification_data, ensure_ascii=False)
    )
    try:
        verify_text = generate_json(verify_prompt, stage="quiz verify")
    except GeminiError:
        logger.error(
            "QUIZ VERIFY: checked %s, OK 0, WRONG %s",
            len(valid_candidates),
            len(valid_candidates),
        )
        logger.exception("QUIZ VERIFY: Gemini call failed.")
        raise
    try:
        verify_result = json.loads(verify_text)
    except json.JSONDecodeError as exc:
        logger.error("QUIZ VERIFY: could not read JSON: %s", verify_text[:200])
        logger.error(
            "QUIZ VERIFY: checked %s, OK 0, WRONG %s",
            len(valid_candidates),
            len(valid_candidates),
        )
        raise HTTPException(
            status_code=502,
            detail=f"Gemini returned invalid JSON while verifying quiz questions: {verify_text[:200]}",
        ) from exc
    if not isinstance(verify_result, dict) or not isinstance(
        verify_result.get("results"), list
    ):
        logger.error("QUIZ VERIFY: returned invalid verification JSON: %s", verify_text[:200])
        logger.error(
            "QUIZ VERIFY: checked %s, OK 0, WRONG %s",
            len(valid_candidates),
            len(valid_candidates),
        )
        raise HTTPException(
            status_code=502,
            detail="Gemini returned an invalid quiz verification list.",
        )

    outcomes = {
        result.get("index"): result
        for result in verify_result["results"]
        if isinstance(result, dict)
        and isinstance(result.get("index"), int)
        and not isinstance(result.get("index"), bool)
    }
    saved = []
    wrong = []
    for index, _, _, normalized in valid_candidates:
        result = outcomes.get(index)
        if result and result.get("status") == "OK":
            saved.append(normalized)
        else:
            reason = result.get("reason") if result else None
            if not isinstance(reason, str) or not reason.strip():
                reason = "verification marked WRONG" if result else "no verification result"
            reason = re.sub(r"\s+", " ", str(reason)).strip()[:100]
            wrong.append((index, reason))
            logger.warning("QUIZ VERIFY: question %s WRONG: %s", index, reason)

    logger.info(
        "QUIZ VERIFY: checked %s, OK %s, WRONG %s",
        len(valid_candidates),
        len(saved),
        len(wrong),
    )
    if saved:
        save_quiz_questions(saved)
    logger.info("QUIZ BATCH: wrote %s, kept %s", len(generated), len(saved))
    return saved


def _extract_number(value) -> float | None:
    if not isinstance(value, (str, int, float)) or isinstance(value, bool):
        return None
    text = str(value).replace(",", "")
    match = re.search(r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?", text)
    if not match:
        return None
    try:
        number = float(match.group())
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def _public_question(question: dict) -> dict:
    response = {
        "id": question["id"],
        "type": question["type"],
        "question": question["question"],
        "topic": question["topic"],
        "difficulty": question["difficulty"],
        "source": json.loads(question["source_citation"]),
    }
    if question["type"] == "mcq":
        response["options"] = json.loads(question["options"])
    return response


@app.post("/quiz")
def quiz(
    body: QuizRequest,
    student_id: str = Header(default="anonymous", alias="X-Student-Id"),
):
    student_id = student_id.strip() or "anonymous"
    if body.diagnostic:
        source_signature = get_ready_source_signature()
        selected = get_diagnostic_set_questions(source_signature, student_id)
        set_size = get_diagnostic_set_size(source_signature)
        batch_reason = ""

        if set_size == 0:
            available = get_available_mcq_questions(student_id)
            chunks = get_quiz_chunks([], [])
            all_topics = {
                chunk["metadata"].get("topic") or "General"
                for chunk in chunks
            }
            all_topics.update(question["topic"] for question in available)
            selected = _spread_questions(available, 5, unique_topics_only=True)
            needed_topic_count = min(5, len(all_topics))

            if len(selected) < needed_topic_count or len(available) < 5:
                if chunks:
                    existing_topics = {question["topic"] for question in selected}
                    generation_topics = sorted(
                        all_topics - existing_topics or all_topics,
                        key=str.casefold,
                    )
                    generation_chunks = [
                        chunk
                        for chunk in chunks
                        if (chunk["metadata"].get("topic") or "General")
                        in generation_topics
                    ]
                    try:
                        _verified_quiz_batch(
                            generation_chunks,
                            generation_topics,
                            ["mcq"],
                            "mixed",
                            diagnostic=True,
                            diagnostic_source_signature=source_signature,
                        )
                    except (TextBudgetExceeded, GeminiQuotaError) as exc:
                        batch_reason = str(exc)
                        logger.error("QUIZ RESULT: diagnostic generation stopped: %s", batch_reason)
                    except (GeminiError, HTTPException) as exc:
                        batch_reason = str(getattr(exc, "detail", exc))
                        logger.error("QUIZ RESULT: diagnostic generation failed: %s", batch_reason)
                    available = get_available_mcq_questions(student_id)
                    selected = _spread_questions(
                        available,
                        5,
                        unique_topics_only=True,
                    )
                elif not selected:
                    batch_reason = "No study material or verified MCQ questions are available."

            if len({question["topic"] for question in selected}) >= len(all_topics):
                selected = _spread_questions(available, 5)
            if len(selected) >= 3:
                save_diagnostic_set(
                    source_signature,
                    [question["id"] for question in selected],
                )
        elif len(selected) < 5:
            # Supplement questions a student already saw with unseen pool questions.
            selected = _spread_questions(
                selected + get_available_mcq_questions(student_id),
                5,
            )

        logger.info("QUIZ RESULT: kept %s, needed 5", len(selected))
        if len(selected) < 3:
            reason = batch_reason or "Fewer than three verified MCQ questions are available."
            raise HTTPException(
                status_code=502,
                detail=f"Could not create a starter quiz: {reason}",
            )
        served = serve_questions(student_id, [question["id"] for question in selected])
        if len(served) < 3:
            raise HTTPException(
                status_code=502,
                detail="Could not create a starter quiz: fewer than three unseen questions remain.",
            )
        return [_public_question(question) for question in served]

    if body.count < 3 or body.count > 15:
        raise HTTPException(status_code=400, detail="count must be between 3 and 15.")
    if not body.types or any(
        question_type not in {"mcq", "short", "numerical"}
        for question_type in body.types
    ):
        raise HTTPException(
            status_code=400,
            detail="types must include mcq, short, or numerical.",
        )
    if body.difficulty not in {"easy", "medium", "hard", "mixed"}:
        raise HTTPException(
            status_code=400,
            detail="difficulty must be easy, medium, hard, or mixed.",
        )
    topics = list(dict.fromkeys(body.topics))
    source_ids = list(dict.fromkeys(body.source_ids))
    types = list(dict.fromkeys(body.types))
    count = body.count
    difficulty = body.difficulty

    existing = get_unseen_questions(
        student_id, topics, source_ids, types, difficulty
    )
    if len(existing) < count:
        chunks = get_quiz_chunks(topics, source_ids)
        if not chunks:
            raise HTTPException(
                status_code=400,
                detail="No study material for these topics.",
            )
        try:
            chunk_topics = sorted(
                {chunk["metadata"].get("topic") or "General" for chunk in chunks}
            )
            retrieval_query = (
                "Study questions about " + ", ".join(topics or chunk_topics)
            )
            ranked_chunks = search_chunks(
                embed_query(retrieval_query),
                limit=30,
                file_ids=sorted({chunk["metadata"]["file_id"] for chunk in chunks}),
                topics=topics,
            )
            if ranked_chunks:
                chunks = ranked_chunks
            _verified_quiz_batch(
                chunks,
                topics or chunk_topics,
                types,
                difficulty,
            )
        except (TextBudgetExceeded, GeminiQuotaError) as exc:
            raise HTTPException(
                status_code=429,
                detail="Gemini text-call budget or quota is exhausted. Try again later.",
            ) from exc
        except GeminiError as exc:
            status_code = 502
            detail = str(exc)
            if exc.error_code == 504:
                detail = "Gemini timed out while generating the quiz. Please try again."
            logger.error("Gemini could not generate quiz questions: %s", exc)
            raise HTTPException(status_code=status_code, detail=detail) from exc
        existing = get_unseen_questions(
            student_id, topics, source_ids, types, difficulty
        )

    selected = existing[:count]
    served = serve_questions(student_id, [question["id"] for question in selected])
    return [_public_question(question) for question in served]


@app.post("/quiz/answer")
def quiz_answer(
    body: QuizAnswerRequest,
    student_id: str = Header(default="anonymous", alias="X-Student-Id"),
):
    student_id = student_id.strip() or "anonymous"
    question = get_question(body.question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found.")

    status = get_student_question_status(student_id, body.question_id)
    if status == "answered":
        raise HTTPException(status_code=400, detail="You already answered this question.")
    if status != "served":
        raise HTTPException(
            status_code=400,
            detail="This question was not served to this student.",
        )

    try:
        options = json.loads(question["options"]) if question["options"] else []
        key_terms = json.loads(question["key_terms"])
        citation = json.loads(question["source_citation"])
    except json.JSONDecodeError as exc:
        logger.error("Stored quiz question %s contains invalid JSON.", body.question_id)
        raise HTTPException(status_code=500, detail="Stored question data is invalid.") from exc

    correct_answer = question["correct_answer"]
    correct = False
    if question["type"] == "mcq":
        if not isinstance(body.answer, int) or isinstance(body.answer, bool):
            raise HTTPException(status_code=400, detail="MCQ answers must be an option index.")
        try:
            correct_index = int(correct_answer)
        except ValueError as exc:
            raise HTTPException(status_code=500, detail="Stored correct answer is invalid.") from exc
        correct = body.answer == correct_index
        if correct_index < 0 or correct_index >= len(options):
            raise HTTPException(status_code=500, detail="Stored correct answer is invalid.")
        correct_answer = options[correct_index]
    elif question["type"] == "numerical":
        expected = _extract_number(question["correct_answer"])
        actual = _extract_number(body.answer)
        if expected is None:
            raise HTTPException(status_code=500, detail="Stored numeric answer is invalid.")
        if actual is None:
            raise HTTPException(status_code=400, detail="Numerical answers must contain a number.")
        correct = math.isclose(actual, expected, rel_tol=0.01, abs_tol=1e-6)
    elif question["type"] == "short":
        if not isinstance(body.answer, str):
            raise HTTPException(status_code=400, detail="Short answers must be text.")
        answer_text = body.answer.casefold()
        if key_terms:
            correct = sum(
                1 for term in key_terms if isinstance(term, str) and term.casefold() in answer_text
            ) * 2 >= len(key_terms)
    else:
        raise HTTPException(status_code=500, detail="Stored question type is invalid.")

    if not mark_question_answered(student_id, body.question_id):
        raise HTTPException(status_code=400, detail="You already answered this question.")
    update_student_mastery(student_id, question["topic"], correct)

    feedback = (
        f"{'Correct.' if correct else 'Not quite.'} "
        f"{question['explanation']} Source: {citation['label']}."
    )
    result = {
        "correct": correct,
        "feedback": feedback,
        "citation": citation,
        "correct_answer": correct_answer,
    }
    if not correct and question["misconception_note"]:
        result["misconception"] = question["misconception_note"]
    return result


def _not_grounded():
    return {"answer": UNSUPPORTED_ANSWER, "grounded": False, "citations": []}


def _passage_fallback(results: list[dict]):
    if not results:
        return _not_grounded()
    best = results[0]
    return {
        "answer": (
            "Here is the most relevant passage from your material:\n\n"
            + best["text"]
        ),
        "grounded": True,
        "citations": [_citation(best)],
    }


def _answer_with_embedding(question: str, source_ids: list[str], embedding: list[float]):
    results = search_chunks(embedding, limit=TOP_K, file_ids=source_ids)
    if not results or results[0]["similarity"] < SIMILARITY_THRESHOLD:
        return _not_grounded(), results

    context = "\n\n".join(
        f"[{index}] id={result['chunk_id']}: {result['text']}"
        for index, result in enumerate(results, start=1)
    )
    try:
        response_text = generate_json(
            GROUNDED_ANSWER_PROMPT.format(question=question, context=context)
        )
    except (TextBudgetExceeded, GeminiQuotaError) as exc:
        logger.warning("Using retrieved passage because Gemini text is unavailable: %s", exc)
        return _passage_fallback(results), results
    try:
        response = json.loads(response_text)
    except json.JSONDecodeError:
        logger.warning("Gemini returned invalid grounded-answer JSON.")
        return _not_grounded(), results
    if not isinstance(response, dict) or response.get("answerable") is not True:
        return _not_grounded(), results

    used_ids = response.get("used_chunk_ids")
    if not isinstance(used_ids, list):
        return _not_grounded(), results
    result_by_id = {result["chunk_id"]: result for result in results}
    unique_ids = dict.fromkeys(
        chunk_id for chunk_id in used_ids if isinstance(chunk_id, str)
    )
    citations = [
        _citation(result_by_id[chunk_id])
        for chunk_id in unique_ids
        if chunk_id in result_by_id
    ]
    answer = response.get("answer")
    if not citations or not isinstance(answer, str) or not answer.strip():
        return _not_grounded(), results
    return {
        "answer": answer.strip(),
        "grounded": True,
        "citations": citations,
    }, results


@app.post("/ask")
def ask(body: AskRequest):
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="The question cannot be empty.")
    try:
        answer, _ = _answer_with_embedding(
            question,
            body.source_ids,
            embed_query(question),
        )
    except GeminiQuotaError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except GeminiError as exc:
        logger.error("Gemini could not answer the question: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return answer


app = CORSMiddleware(
    app=app,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)
