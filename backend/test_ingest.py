import hashlib
import sys
import uuid
from pathlib import Path
from shutil import copyfile

from gemini_client import embed_query
from ingest import MAX_FILE_SIZE, process_source
from store import (
    count_file_chunks,
    create_source,
    get_source,
    initialize_store,
    search_chunks,
    set_source_status,
)

BACKEND_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BACKEND_DIR / "uploads"


def prepare_test_source(pdf_path: Path):
    if not pdf_path.is_file():
        raise ValueError(f"PDF not found: {pdf_path}")
    if pdf_path.stat().st_size > MAX_FILE_SIZE:
        raise ValueError("The PDF is too large. Maximum file size is 100 MB.")
    with pdf_path.open("rb") as pdf_file:
        if pdf_file.read(4) != b"%PDF":
            raise ValueError("The input file is not a valid PDF.")

    digest = hashlib.sha256()
    with pdf_path.open("rb") as pdf_file:
        for content in iter(lambda: pdf_file.read(1024 * 1024), b""):
            digest.update(content)
    file_hash = digest.hexdigest()
    file_id = str(uuid.uuid5(uuid.NAMESPACE_URL, file_hash))
    stored_path = UPLOADS_DIR / f"{file_id}.pdf"
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    if get_source(file_id) is None:
        copyfile(pdf_path, stored_path)
        create_source(file_id, pdf_path.name)
    elif not stored_path.is_file():
        copyfile(pdf_path, stored_path)
        set_source_status(file_id, "processing")

    return file_id


def run_search(question: str, file_id: str):
    results = search_chunks(embed_query(question), limit=3, file_id=file_id)
    print(f"\nQuestion: {question}")
    if not results:
        print("No matching chunks were found.")
        return

    for rank, result in enumerate(results, start=1):
        metadata = result["metadata"]
        snippet = " ".join(result["text"].split())[:240]
        print(
            f"{rank}. Page {metadata['location']} "
            f"(similarity distance {result['distance']:.4f}): {snippet}"
        )


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python test_ingest.py <path-to-pdf>")

    initialize_store()
    pdf_path = Path(sys.argv[1]).expanduser().resolve()
    try:
        file_id = prepare_test_source(pdf_path)
    except (OSError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc

    result = process_source(file_id)
    if result["status"] != "ready":
        raise SystemExit(result.get("error", "PDF ingestion failed."))

    print(f"Pages: {result['pages']}")
    print(f"Chunks: {count_file_chunks(file_id)}")
    run_search("What is the main subject covered in this material?", file_id)
    run_search("Which important ideas or definitions does it explain?", file_id)


if __name__ == "__main__":
    main()
