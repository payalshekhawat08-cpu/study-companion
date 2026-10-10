import json
import logging
import os
import re
import threading
import time
from collections.abc import Callable
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
    GEMINI_RETRY_DELAYS_SECONDS,
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
_embedding_lock = threading.Lock()
_next_embedding_call = 0.0
_text_call_lock = threading.Lock()
_text_calls_this_process = 0


class GeminiError(Exception):
    def __init__(self, message: str, stage: str, error_code: int | str | None):
        super().__init__(message)
        self.stage = stage
        self.error_code = error_code


class GeminiQuotaError(GeminiError):
    pass


class GeminiEmbeddingError(GeminiError):
    pass


def _make_client(timeout_ms: int = 60_000):
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
            timeout=timeout_ms,
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


def _is_retryable(exc: Exception, code: int | None) -> bool:
    if code == 429:
        return False
    exception_type = type(exc).__name__.lower()
    if (
        code == 503
        or isinstance(exc, (TimeoutError, ConnectionError))
        or any(
            marker in exception_type
            for marker in ("timeout", "connection", "connecterror", "remoteprotocol")
        )
    ):
        return True
    message = str(exc).lower()
    return any(
        marker in message
        for marker in (
            "server disconnected",
            "connection reset",
            "connection aborted",
            "remote end closed",
            "connection refused",
            "network is unreachable",
            "connection error",
            "timed out",
            "timeout",
        )
    )


def _wait_for_embedding_slot():
    global _next_embedding_call
    with _embedding_lock:
        now = time.monotonic()
        delay = max(0.0, _next_embedding_call - now)
        _next_embedding_call = max(now, _next_embedding_call) + EMBEDDING_PAUSE_SECONDS
    if delay:
        time.sleep(delay)


def _request(
    operation: Callable[[genai.Client], object],
    stage: str,
    text_call: bool = False,
):
    global _text_calls_this_process
    text_generation = text_call and stage != "vision"
    for attempt in range(GEMINI_503_RETRIES + 1):
        if text_call:
            reserve_text_call()
            with _text_call_lock:
                _text_calls_this_process += 1
                call_number = _text_calls_this_process
            logger.info(
                "TEXT CALL #%s today (limit %s)",
                call_number,
                TEXT_DAILY_BUDGET,
            )
        if stage.startswith("embedding"):
            _wait_for_embedding_slot()
        client = None
        try:
            client = _make_client(
                timeout_ms=120_000 if text_generation else 60_000
            )
            return operation(client)
        except Exception as exc:
            code = _error_code(exc)
            api_key = os.getenv("GEMINI_API_KEY", "")
            detail = str(exc).replace(api_key, "[redacted]") if api_key else str(exc)
            if code == 429:
                logger.error("Gemini %s failed with HTTP 429: %s", stage, detail)
                raise GeminiQuotaError(
                    "Gemini quota limit reached, wait and try again later",
                    stage,
                    429,
                ) from exc
            if text_generation and code == 504:
                logger.error("Gemini %s failed with HTTP 504: %s", stage, detail)
                raise GeminiError(
                    f"Gemini text call exceeded its deadline: {detail}",
                    stage,
                    504,
                ) from exc
            message = f"Gemini {stage} failed"
            if code is not None:
                message += f" with HTTP {code}"
            message += f": {detail}"
            if _is_retryable(exc, code) and attempt < GEMINI_503_RETRIES:
                delay = GEMINI_RETRY_DELAYS_SECONDS[attempt]
                logger.warning(
                    "%s; retrying in %s seconds (%s/%s)",
                    message,
                    delay,
                    attempt + 1,
                    GEMINI_503_RETRIES,
                )
                time.sleep(delay)
                continue
            if _is_retryable(exc, code):
                message = f"Internet connection failed during {stage}: {detail}"
            raise GeminiError(message, stage, code) from exc
        finally:
            if client is not None:
                try:
                    client.close()
                except Exception as exc:
                    logger.warning("Could not close Gemini client: %s", exc)


def embed_batches(
    texts: list[str],
    task: str = "document",
    title: str = "none",
) -> Iterator[tuple[int, list[list[float]]]]:
    if task not in {"document", "query"}:
        raise ValueError("Embedding task must be 'document' or 'query'.")
    if not texts:
        return

    for start in range(0, len(texts), BATCH_SIZE):
        batch = texts[start : start + BATCH_SIZE]
        for batch_index, text in enumerate(batch):
            prompt = (
                QUERY_EMBEDDING_PROMPT.format(query=text)
                if task == "query"
                else DOCUMENT_EMBEDDING_PROMPT.format(title=title, text=text)
            )
            response = _request(
                lambda client: client.models.embed_content(
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
    contents = [prompt]
    if image is not None:
        contents.append(types.Part.from_bytes(data=image[0], mime_type=image[1]))
    response = _request(
        lambda client: client.models.generate_content(
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
        response = _request(
            lambda client: client.models.embed_content(
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
            lambda client: next(
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
    uploaded = _request(
        lambda client: client.files.upload(file=str(video_path)),
        "video file upload",
    )
    waited = 0
    while uploaded.state.name == "PROCESSING":
        if waited >= VIDEO_FILE_PROCESS_TIMEOUT_SECONDS:
            raise GeminiError("Gemini video processing timed out.", "Files API", None)
        time.sleep(VIDEO_FILE_POLL_SECONDS)
        waited += VIDEO_FILE_POLL_SECONDS
        uploaded = _request(
            lambda client: client.files.get(name=uploaded.name),
            "video file processing",
        )
    if uploaded.state.name == "FAILED":
        raise GeminiError("Gemini could not process the uploaded video.", "Files API", None)

    response = _request(
        lambda client: client.models.generate_content(
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
            lambda client: client.files.delete(name=uploaded.name),
            "video file cleanup",
        )
    except GeminiError as exc:
        logger.warning("Could not delete temporary Gemini file: %s", exc)
    return response.text
