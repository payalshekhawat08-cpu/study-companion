import os
import time
from collections.abc import Iterator
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
MODEL_NAME = "gemini-embedding-2"
BATCH_SIZE = 20
BATCH_PAUSE_SECONDS = 1


class GeminiQuotaError(Exception):
    pass


class GeminiEmbeddingError(Exception):
    pass


def _make_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise GeminiEmbeddingError(
            "Gemini API key is missing. Add GEMINI_API_KEY to the project .env file."
        )

    # One attempt prevents the SDK from retrying quota errors automatically.
    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(
            retry_options=types.HttpRetryOptions(attempts=1),
        ),
    )


def embed_batches(
    texts: list[str],
    task: str = "document",
    title: str = "none",
) -> Iterator[tuple[int, list[list[float]]]]:
    if task not in {"document", "query"}:
        raise ValueError("Embedding task must be 'document' or 'query'.")
    if not texts:
        return

    if task == "query":
        prefix = "task: search result | query: "
    else:
        prefix = f"title: {title} | text: "
    client = _make_client()

    for start in range(0, len(texts), BATCH_SIZE):
        batch = texts[start : start + BATCH_SIZE]
        vectors = []
        for batch_index, text in enumerate(batch):
            if start + batch_index:
                time.sleep(BATCH_PAUSE_SECONDS)

            try:
                response = client.models.embed_content(
                    model=MODEL_NAME,
                    contents=prefix + text,
                )
            except Exception as exc:
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
                        "Gemini quota reached, try again in a few minutes."
                    ) from exc
                raise GeminiEmbeddingError(
                    f"Gemini could not create embeddings: {message}"
                ) from exc

            response_embeddings = response.embeddings or []
            if len(response_embeddings) != 1 or not response_embeddings[0].values:
                raise GeminiEmbeddingError(
                    "Gemini returned an incomplete embedding."
                )
            vectors.append(response_embeddings[0].values)

        yield start, vectors


def embed_query(text: str) -> list[float]:
    _, vectors = next(embed_batches([text], task="query"))
    return vectors[0]
