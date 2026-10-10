import json
import logging
import os
import re
import time
from collections.abc import Iterator
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types

from config import (
    EMBEDDING_BATCH_SIZE,
    EMBEDDING_MODEL,
    EMBEDDING_PAUSE_SECONDS,
    FILES_API_MODEL,
    GEMINI_503_RETRY_PAUSE_SECONDS,
    GEMINI_503_RETRIES,
    TEXT_DAILY_BUDGET,
    TEXT_MODEL,
    VIDEO_FILE_POLL_SECONDS,
    VIDEO_FILE_PROCESS_TIMEOUT_SECONDS,
    VISION_MODEL,
)
from prompts import (
    DOCUMENT_EMBEDDING_PROMPT,
    EMBEDDING_HEALTH_CHECK_CONTENT,
    GEMINI_HEALTH_CHECK_PROMPT,
    QUERY_EMBEDDING_PROMPT,
    VIDEO_TRANSCRIPT_PROMPT,
)
from store import TextBudgetExceeded, reserve_text_call, text_calls_today

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
BATCH_SIZE = EMBEDDING_BATCH_SIZE
logger = logging.getLogger(__name__)


class GeminiError(Exception):
    def __init__(self, message: str, stage: str, error_code: int | str | None):
        super().__init__(message)
        self.stage = stage
        self.error_code = error_code


class GeminiQuotaError(GeminiError):
    pass


class GeminiEmbeddingError(GeminiError):
    pass


def _make_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise GeminiError(
            "Gemini API key is missing. Add GEMINI_API_KEY to the project .env file.",
            "client",
            None,
        )
    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(
            retry_options=types.HttpRetryOptions(attempts=1),
        ),
    )


def _error_code(exc: Exception):
    code = getattr(exc, "code", None)
    if code is None:
        response = getattr(exc, "response", None)
        code = getattr(response, "status_code", None)
    if code is not None:
        try:
            return int(code)
        except (TypeError, ValueError):
            pass
    match = re.search(r"\b([1-5]\d\d)\b", str(exc))
    return int(match.group(1)) if match else None


def _request(call, stage: str, text_call: bool = False):
    for attempt in range(GEMINI_503_RETRIES + 1):
        if text_call:
            reserve_text_call()
        try:
            return call()
        except Exception as exc:
            code = _error_code(exc)
            api_key = os.getenv("GEMINI_API_KEY", "")
            detail = str(exc).replace(api_key, "[redacted]") if api_key else str(exc)
            message = f"Gemini {stage} failed"
            if code is not None:
                message += f" with HTTP {code}"
            message += f": {detail}"
            if code == 429:
                raise GeminiQuotaError(message, stage, code) from exc
            if code == 503 and attempt < GEMINI_503_RETRIES:
                logger.warning(
                    "%s; retrying in %s seconds (%s/%s)",
                    message,
                    GEMINI_503_RETRY_PAUSE_SECONDS,
                    attempt + 1,
                    GEMINI_503_RETRIES,
                )
                time.sleep(GEMINI_503_RETRY_PAUSE_SECONDS)
                continue
            raise GeminiError(message, stage, code) from exc


def embed_batches(
    texts: list[str],
    task: str = "document",
    title: str = "none",
) -> Iterator[tuple[int, list[list[float]]]]:
    if task not in {"document", "query"}:
        raise ValueError("Embedding task must be 'document' or 'query'.")
    if not texts:
        return

    client = _make_client()
    for start in range(0, len(texts), BATCH_SIZE):
        batch = texts[start : start + BATCH_SIZE]
        for batch_index, text in enumerate(batch):
            if start + batch_index:
                time.sleep(EMBEDDING_PAUSE_SECONDS)
            prompt = (
                QUERY_EMBEDDING_PROMPT.format(query=text)
                if task == "query"
                else DOCUMENT_EMBEDDING_PROMPT.format(title=title, text=text)
            )
            response = _request(
                lambda: client.models.embed_content(
                    model=EMBEDDING_MODEL,
                    contents=prompt,
                ),
                "embedding",
            )
            response_embeddings = response.embeddings or []
            if len(response_embeddings) != 1 or not response_embeddings[0].values:
                raise GeminiEmbeddingError(
                    "Gemini returned an incomplete embedding.",
                    "embedding",
                    None,
                )
            yield start + batch_index, [response_embeddings[0].values]


def embed_query(text: str) -> list[float]:
    _, vectors = next(embed_batches([text], task="query"))
    return vectors[0]


def generate_json(
    prompt: str,
    image: tuple[bytes, str] | None = None,
    model: str = TEXT_MODEL,
    stage: str = "text",
) -> str:
    client = _make_client()
    contents = [prompt]
    if image is not None:
        contents.append(types.Part.from_bytes(data=image[0], mime_type=image[1]))
    response = _request(
        lambda: client.models.generate_content(
            model=model,
            contents=contents,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        ),
        stage,
        text_call=True,
    )
    if not response.text:
        raise GeminiError("Gemini returned an empty response.", stage, None)
    return response.text


def generate_vision_json(prompt: str, image: tuple[bytes, str]) -> str:
    return generate_json(prompt, image=image, model=VISION_MODEL, stage="vision")


def _tiny_white_png() -> bytes:
    return bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
        "0000000b49444154789c63f80f040009fb03fdfb5e6b2b0000000049454e44ae426082"
    )


def check_gemini_health() -> dict:
    results = {}
    try:
        client = _make_client()
    except GeminiError as exc:
        for name, model in (
            ("embedding", EMBEDDING_MODEL),
            ("text", TEXT_MODEL),
            ("vision", VISION_MODEL),
            ("files_api", FILES_API_MODEL),
        ):
            results[name] = {
                "model": model,
                "status": "error",
                "error_code": exc.error_code,
                "error": str(exc),
            }
        results["text_calls_today"] = text_calls_today()
        results["text_daily_budget"] = TEXT_DAILY_BUDGET
        return results

    try:
        response = _request(
            lambda: client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=EMBEDDING_HEALTH_CHECK_CONTENT,
            ),
            "embedding health check",
        )
        if not response.embeddings or not response.embeddings[0].values:
            raise GeminiEmbeddingError(
                "Gemini returned an incomplete embedding.",
                "embedding health check",
                None,
            )
        results["embedding"] = {"model": EMBEDDING_MODEL, "status": "ok"}
    except GeminiError as exc:
        results["embedding"] = {
            "model": EMBEDDING_MODEL,
            "status": "error",
            "error_code": exc.error_code,
            "error": str(exc),
        }

    try:
        response_text = generate_json(
            GEMINI_HEALTH_CHECK_PROMPT,
            image=(_tiny_white_png(), "image/png"),
            model=TEXT_MODEL,
            stage="text and vision health check",
        )
        response = json.loads(response_text)
        if not isinstance(response, dict) or not response.get("text") or not response.get("image"):
            raise GeminiError(
                "Gemini returned an incomplete text and vision health response.",
                "text and vision health check",
                "invalid_response",
            )
        results["text"] = {"model": TEXT_MODEL, "status": "ok"}
        results["vision"] = {"model": VISION_MODEL, "status": "ok"}
    except (GeminiError, TextBudgetExceeded, json.JSONDecodeError) as exc:
        code = getattr(
            exc,
            "error_code",
            "daily_budget_exhausted"
            if isinstance(exc, TextBudgetExceeded)
            else "invalid_response",
        )
        detail = str(exc)
        results["text"] = {
            "model": TEXT_MODEL,
            "status": "error",
            "error_code": code,
            "error": detail,
        }
        results["vision"] = {
            "model": VISION_MODEL,
            "status": "error",
            "error_code": code,
            "error": detail,
        }

    try:
        _request(
            lambda: next(
                iter(client.files.list(config=types.ListFilesConfig(page_size=1))),
                None,
            ),
            "Files API health check",
        )
        results["files_api"] = {
            "model": FILES_API_MODEL,
            "status": "ok",
            "note": "Files API endpoint listed successfully.",
        }
    except GeminiError as exc:
        results["files_api"] = {
            "model": FILES_API_MODEL,
            "status": "error",
            "error_code": exc.error_code,
            "error": str(exc),
        }

    results["text_calls_today"] = text_calls_today()
    results["text_daily_budget"] = TEXT_DAILY_BUDGET
    return results


def transcribe_video_file(video_path: Path) -> str:
    client = _make_client()
    uploaded = _request(
        lambda: client.files.upload(file=str(video_path)),
        "video file upload",
    )
    waited = 0
    while uploaded.state.name == "PROCESSING":
        if waited >= VIDEO_FILE_PROCESS_TIMEOUT_SECONDS:
            raise GeminiError("Gemini video processing timed out.", "Files API", None)
        time.sleep(VIDEO_FILE_POLL_SECONDS)
        waited += VIDEO_FILE_POLL_SECONDS
        uploaded = _request(
            lambda: client.files.get(name=uploaded.name),
            "video file processing",
        )
    if uploaded.state.name == "FAILED":
        raise GeminiError("Gemini could not process the uploaded video.", "Files API", None)

    response = _request(
        lambda: client.models.generate_content(
            model=FILES_API_MODEL,
            contents=[uploaded, VIDEO_TRANSCRIPT_PROMPT],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        ),
        "video transcription",
        text_call=True,
    )
    if not response.text:
        raise GeminiError("Gemini returned an empty video transcript.", "video transcription", None)
    try:
        _request(
            lambda: client.files.delete(name=uploaded.name),
            "video file cleanup",
        )
    except GeminiError as exc:
        logger.warning("Could not delete temporary Gemini file: %s", exc)
    return response.text
