import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import chromadb

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATABASE_PATH = DATA_DIR / "sources.sqlite3"
CHROMA_PATH = BASE_DIR / "chroma_db"
COLLECTION_NAME = "study_companion"

_collection = None


def initialize_store():
    global _collection

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CHROMA_PATH.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sources (
                file_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                source_type TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('processing', 'ready', 'failed')),
                topics TEXT NOT NULL,
                video_url TEXT,
                created_at TEXT NOT NULL,
                error_message TEXT
            )
            """
        )

    client = chromadb.PersistentClient(path=str(CHROMA_PATH))
    _collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        embedding_function=None,
        metadata={"hnsw:space": "cosine"},
    )


def _get_collection():
    if _collection is None:
        initialize_store()
    return _collection


def create_source(file_id: str, name: str):
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute(
            """
            INSERT INTO sources
                (file_id, name, source_type, status, topics, video_url, created_at)
            VALUES (?, ?, 'pdf', 'processing', '[]', NULL, ?)
            """,
            (file_id, name, datetime.now(timezone.utc).isoformat()),
        )


def get_source(file_id: str):
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.row_factory = sqlite3.Row
        row = connection.execute(
            "SELECT * FROM sources WHERE file_id = ?",
            (file_id,),
        ).fetchone()
    return dict(row) if row else None


def list_sources():
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            """
            SELECT file_id, name, source_type, status, topics, video_url
            FROM sources
            ORDER BY created_at DESC
            """
        ).fetchall()

    return [
        {
            "file_id": row["file_id"],
            "name": row["name"],
            "source_type": row["source_type"],
            "status": row["status"],
            "topics": json.loads(row["topics"]),
            "video_url": row["video_url"],
        }
        for row in rows
    ]


def set_source_status(file_id: str, status: str, error_message: str | None = None):
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute(
            "UPDATE sources SET status = ?, error_message = ? WHERE file_id = ?",
            (status, error_message, file_id),
        )


def existing_chunk_ids(chunk_ids: list[str]) -> set[str]:
    collection = _get_collection()
    found_ids = set()
    for start in range(0, len(chunk_ids), 500):
        response = collection.get(ids=chunk_ids[start : start + 500])
        found_ids.update(response["ids"])
    return found_ids


def save_chunks(chunks: list[dict], embeddings: list[list[float]]):
    if len(chunks) != len(embeddings):
        raise ValueError("The embedding count did not match the chunk count.")

    _get_collection().upsert(
        ids=[chunk["chunk_id"] for chunk in chunks],
        embeddings=embeddings,
        documents=[chunk["text"] for chunk in chunks],
        metadatas=[
            {
                "file_id": chunk["file_id"],
                "source_file": chunk["source_file"],
                "source_type": chunk["source_type"],
                "location": chunk["location"],
            }
            for chunk in chunks
        ],
    )


def count_file_chunks(file_id: str) -> int:
    return len(_get_collection().get(where={"file_id": file_id})["ids"])


def search_chunks(
    embedding: list[float],
    limit: int = 3,
    file_id: str | None = None,
) -> list[dict]:
    collection = _get_collection()
    if collection.count() == 0:
        return []

    options = {
        "query_embeddings": [embedding],
        "n_results": min(limit, collection.count()),
        "include": ["documents", "metadatas", "distances"],
    }
    if file_id is not None:
        options["where"] = {"file_id": file_id}

    results = collection.query(**options)
    return [
        {
            "chunk_id": chunk_id,
            "text": text,
            "metadata": metadata,
            "distance": distance,
        }
        for chunk_id, text, metadata, distance in zip(
            results["ids"][0],
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        )
    ]
