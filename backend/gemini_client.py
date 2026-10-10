import logging
import os
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
    GEMINI_CALL_PAUSE_SECONDS,
    TEXT_MODEL,
    VIDEO_FILE_POLL_SECONDS,
    VIDEO_FILE_PROCESS_TIMEOUT_SECONDS,
)
from prompts import DOCUMENT_EMBEDDING_PROMPT, QUERY_EMBEDDING_PROMPT, VIDEO_TRANSCRIPT_PROMPT

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
BATCH_SIZE = EMBEDDING_BATCH_SIZE
logger = logging.getLogger(__name__)
_last_request_at = None


class GeminiQuotaError(Exception):
    pass


class GeminiError(Exception):
    pass


class GeminiEmbeddingError(GeminiError):
    pass


def _make_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise GeminiError(
            "Gemini API key is missing. Add GEMINI_API_KEY to the project .env file."
        )

    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(
            retry_options=types.HttpRetryOptions(attempts=1),
        ),
    )


def _pause_between_requests(seconds: int):
    global _last_request_at
    now = time.monotonic()
    if _last_request_at is not None:
        wait = seconds - (now - _last_request_at)
        if wait > 0:
            time.sleep(wait)
    _last_request_at = time.monotonic()


def _raise_api_error(exc: Exception):
    api_key = os.getenv("GEMINI_API_KEY", "")
    message = str(exc).replace(api_key, "[redacted]") if api_key else str(exc)
    lowered_message = message.lower()
    status_code = getattr(exc, "code", None)
    is_quota_error = status_code == 429 or any(
        marker in lowered_message
        for marker in ("quota", "resource_exhausted", "rate limit", "too many requests")
    )
    if is_quota_error:
        raise GeminiQuotaError(
            "Gemini quota reached. This item is marked failed; rerun it later."
        ) from exc
    raise GeminiError(f"Gemini request failed: {message}") from exc


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
            prompt = (
                QUERY_EMBEDDING_PROMPT.format(query=text)
                if task == "query"
                else DOCUMENT_EMBEDDING_PROMPT.format(title=title, text=text)
            )
            try:
                _pause_between_requests(EMBEDDING_PAUSE_SECONDS)
                response = client.models.embed_content(
                    model=EMBEDDING_MODEL,
                    contents=prompt,
                )
            except Exception as exc:
                _raise_api_error(exc)

            response_embeddings = response.embeddings or []
            if len(response_embeddings) != 1 or not response_embeddings[0].values:
                raise GeminiEmbeddingError("Gemini returned an incomplete embedding.")
            yield start + batch_index, [response_embeddings[0].values]


def embed_query(text: str) -> list[float]:
    _, vectors = next(embed_batches([text], task="query"))
    return vectors[0]


def generate_json(prompt: str, image: tuple[bytes, str] | None = None) -> str:
    client = _make_client()
    contents = [prompt]
    if image is not None:
        contents.append(types.Part.from_bytes(data=image[0], mime_type=image[1]))
    try:
        _pause_between_requests(GEMINI_CALL_PAUSE_SECONDS)
        response = client.models.generate_content(
            model=TEXT_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
    except Exception as exc:
        _raise_api_error(exc)
    if not response.text:
        raise GeminiError("Gemini returned an empty response.")
    return response.text


def transcribe_video_file(video_path: Path) -> str:
    client = _make_client()
    uploaded = None
    try:
        _pause_between_requests(GEMINI_CALL_PAUSE_SECONDS)
        uploaded = client.files.upload(file=str(video_path))
        waited = 0
        while uploaded.state.name == "PROCESSING":
            if waited >= VIDEO_FILE_PROCESS_TIMEOUT_SECONDS:
                raise GeminiError("Gemini video processing timed out.")
            time.sleep(VIDEO_FILE_POLL_SECONDS)
            waited += VIDEO_FILE_POLL_SECONDS
            _pause_between_requests(VIDEO_FILE_POLL_SECONDS)
            uploaded = client.files.get(name=uploaded.name)
        if uploaded.state.name == "FAILED":
            raise GeminiError("Gemini could not process the uploaded video.")
        _pause_between_requests(GEMINI_CALL_PAUSE_SECONDS)
        response = client.models.generate_content(
            model=TEXT_MODEL,
            contents=[uploaded, VIDEO_TRANSCRIPT_PROMPT],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
    except GeminiError:
        raise
    except Exception as exc:
        _raise_api_error(exc)
    if not response.text:
        raise GeminiError("Gemini returned an empty video transcript.")
    try:
        _pause_between_requests(GEMINI_CALL_PAUSE_SECONDS)
        client.files.delete(name=uploaded.name)
    except Exception as exc:
        logger.warning("Could not delete temporary Gemini file: %s", exc)
    return response.text
