import hashlib
import json
import shutil
import sys
import uuid
from pathlib import Path

from config import SIMILARITY_THRESHOLD
from gemini_client import GeminiError, GeminiQuotaError, embed_query
from ingest import process_source
from main import _answer_with_embedding
from store import (
    create_source,
    get_source,
    initialize_store,
    set_source_status,
)

BACKEND_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BACKEND_DIR / "uploads"
SAMPLE_DIR = BACKEND_DIR.parent / "sample_material"
YOUTUBE_URL = "https://youtu.be/znF2U_3Z210?si=3g1wO-fd_-R2NJoL"
QUESTIONS = [
    ("What is linear search, and when is a search unsuccessful?", True),
    ("What condition must an array meet before binary search is used?", True),
    ("How does internal sorting differ from external sorting?", True),
    ("How does photosynthesis convert sunlight into chemical energy?", False),
    ("What causes the ocean tides on Earth?", False),
    ("How does the Pythagorean theorem relate the sides of a triangle?", False),
]


def prepare_file_source(path: Path) -> str:
    if not path.is_file():
        raise ValueError(f"Sample file not found: {path}")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    file_id = str(uuid.uuid5(uuid.NAMESPACE_URL, digest))
    extension = path.suffix.lower()
    source_type = "slide" if extension == ".pptx" else "pdf"
    saved_path = UPLOADS_DIR / f"{file_id}{extension}"
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    source = get_source(file_id)
    if source is None:
        shutil.copyfile(path, saved_path)
        create_source(
            file_id,
            path.name,
            source_type=source_type,
            storage_ext=extension,
        )
    else:
        if not saved_path.is_file():
            shutil.copyfile(path, saved_path)
        set_source_status(file_id, "processing")
    return file_id


def prepare_youtube_source() -> str:
    file_id = str(uuid.uuid5(uuid.NAMESPACE_URL, YOUTUBE_URL))
    if get_source(file_id) is None:
        create_source(
            file_id,
            "Lecture video",
            source_type="video",
            video_url=YOUTUBE_URL,
            storage_ext="",
        )
    else:
        set_source_status(file_id, "processing")
    return file_id


def main():
    sys.stdout.reconfigure(errors="replace")
    initialize_store()
    pdf_path = SAMPLE_DIR / "DS UNIT 5 (1).pdf"
    pptx_path = SAMPLE_DIR / "Top_Tech_Premium_Presentation_Theme.pptx"
    source_preparers = [
        lambda: prepare_file_source(pdf_path),
        lambda: prepare_file_source(pptx_path),
        prepare_youtube_source,
    ]

    ready_ids = []
    quota_reached = False
    for prepare_source in source_preparers:
        file_id = prepare_source()
        result = process_source(file_id)
        print(f"Ingest {file_id}: {result}")
        if result["status"] == "ready":
            ready_ids.append(file_id)
        elif "quota" in result.get("error", "").lower():
            quota_reached = True
            break

    if quota_reached:
        print("\nAsk tests skipped after a Gemini quota error; rerun later to resume.")
        raise SystemExit("Sample integration test stopped at the Gemini quota limit.")
    if not ready_ids:
        raise SystemExit("No sample sources finished ingestion; ask tests cannot run.")
    print(f"\nSimilarity threshold: {SIMILARITY_THRESHOLD:.2f}")
    for question, expected_grounded in QUESTIONS:
        try:
            embedding = embed_query(question)
            answer, results = _answer_with_embedding(question, ready_ids, embedding)
        except GeminiQuotaError as exc:
            print(f"\nQuestion: {question}\nStopped on quota: {exc}")
            break
        except GeminiError as exc:
            print(f"\nQuestion: {question}\nAsk failed: {exc}")
            continue

        best_similarity = results[0]["similarity"] if results else None
        print(f"\nQuestion: {question}")
        print(
            "Best similarity:",
            f"{best_similarity:.4f}" if best_similarity is not None else "none",
        )
        print("Expected grounded:", expected_grounded)
        print("Grounded:", answer["grounded"])
        print("Answer:", answer["answer"])
        print("Citations:", json.dumps(answer["citations"], ensure_ascii=False))

if __name__ == "__main__":
    main()
