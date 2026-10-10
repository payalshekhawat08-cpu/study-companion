import json
import logging
import re
import sqlite3
import uuid
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from pptx import Presentation

from config import SIMILARITY_THRESHOLD, TOP_K
from gemini_client import GeminiError, GeminiQuotaError, embed_query, generate_json
from ingest import MAX_FILE_SIZE, MAX_VIDEO_FILE_SIZE, process_source
from prompts import GROUNDED_ANSWER_PROMPT
from store import (
    create_source,
    get_source,
    get_topics,
    initialize_store,
    list_sources,
    search_chunks,
)

BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
logger = logging.getLogger(__name__)
UNSUPPORTED_ANSWER = "This isn’t covered in your material."
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".webm", ".mov"}

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AskRequest(BaseModel):
    question: str = Field(min_length=1)
    source_ids: list[str] = Field(default_factory=list)


@app.on_event("startup")
def startup():
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    initialize_store()


@app.get("/health")
def health_check():
    return {"status": "ok"}


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


@app.get("/topics")
def topics():
    return get_topics()


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


def _not_grounded():
    return {"answer": UNSUPPORTED_ANSWER, "grounded": False, "citations": []}


def _answer_with_embedding(question: str, source_ids: list[str], embedding: list[float]):
    results = search_chunks(embedding, limit=TOP_K, file_ids=source_ids)
    if not results or results[0]["similarity"] < SIMILARITY_THRESHOLD:
        return _not_grounded(), results

    context = "\n\n".join(
        f"[{index}] id={result['chunk_id']}: {result['text']}"
        for index, result in enumerate(results, start=1)
    )
    response_text = generate_json(
        GROUNDED_ANSWER_PROMPT.format(question=question, context=context)
    )
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
