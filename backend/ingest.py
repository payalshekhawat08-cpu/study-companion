import logging
from pathlib import Path

import pymupdf

from gemini_client import BATCH_SIZE, GeminiQuotaError, embed_batches
from store import (
    count_file_chunks,
    existing_chunk_ids,
    get_source,
    save_chunks,
    set_source_status,
)

BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
MAX_FILE_SIZE = 100 * 1024 * 1024
CHUNK_SIZE = 800
CHUNK_OVERLAP = 100
logger = logging.getLogger(__name__)


def split_page_text(text: str, file_id: str, source_file: str, page_number: int):
    chunks = []
    clean_text = text.strip()
    start = 0
    chunk_number = 0

    while start < len(clean_text):
        end = min(start + CHUNK_SIZE, len(clean_text))
        chunk_text = clean_text[start:end].strip()
        if chunk_text:
            chunks.append(
                {
                    "chunk_id": f"{file_id}:p{page_number}:c{chunk_number}",
                    "file_id": file_id,
                    "source_file": source_file,
                    "source_type": "pdf",
                    "location": page_number,
                    "text": chunk_text,
                }
            )
            chunk_number += 1

        if end == len(clean_text):
            break
        start = end - CHUNK_OVERLAP

    return chunks


def read_pdf_chunks(pdf_path: Path, file_id: str, source_file: str):
    chunks = []
    with pymupdf.open(pdf_path) as document:
        page_count = document.page_count
        for page_index, page in enumerate(document):
            page_text = page.get_text("text")
            if page_text.strip():
                chunks.extend(
                    split_page_text(
                        page_text,
                        file_id,
                        source_file,
                        page_index + 1,
                    )
                )
    return page_count, chunks


def process_source(file_id: str):
    source = get_source(file_id)
    if source is None:
        return {"status": "failed", "error": "The uploaded source could not be found."}

    try:
        pdf_path = UPLOADS_DIR / f"{file_id}.pdf"
        if not pdf_path.is_file():
            raise ValueError("The uploaded PDF file could not be found.")

        page_count, chunks = read_pdf_chunks(pdf_path, file_id, source["name"])
        stored_ids = existing_chunk_ids([chunk["chunk_id"] for chunk in chunks])
        missing_chunks = [
            chunk for chunk in chunks if chunk["chunk_id"] not in stored_ids
        ]
        missing_texts = [chunk["text"] for chunk in missing_chunks]

        for start, embeddings in embed_batches(
            missing_texts,
            task="document",
            title=source["name"],
        ):
            batch_chunks = missing_chunks[start : start + BATCH_SIZE]
            save_chunks(batch_chunks, embeddings)

        set_source_status(file_id, "ready")
        return {
            "status": "ready",
            "pages": page_count,
            "chunks": count_file_chunks(file_id),
        }
    except GeminiQuotaError as exc:
        set_source_status(file_id, "failed", str(exc))
        logger.warning("Ingestion failed for %s: %s", file_id, exc)
        return {"status": "failed", "error": str(exc)}
    except Exception as exc:
        message = f"PDF processing failed: {exc}"
        set_source_status(file_id, "failed", message)
        logger.error("Ingestion failed for %s: %s", file_id, message)
        return {"status": "failed", "error": message}
