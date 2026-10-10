import json
import re
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from zoneinfo import ZoneInfo

import chromadb

from config import TEXT_CALL_INTERVAL_SECONDS, TEXT_DAILY_BUDGET, TOP_K

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATABASE_PATH = DATA_DIR / "sources.sqlite3"
CHROMA_PATH = BASE_DIR / "chroma_db"
COLLECTION_NAME = "study_companion"

_collection = None
_text_reservation_lock = Lock()


class TextBudgetExceeded(Exception):
    pass


def _pacific_date() -> str:
    return datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat()


def _plain_library_error(error: str) -> str:
    lowered = error.lower()
    if "restart" in lowered:
        return "Interrupted by a server restart"
    if "429" in lowered or "quota" in lowered:
        return "Gemini quota limit reached, wait and try again later."
    if (
        "504" in lowered
        or "deadline_exceeded" in lowered
        or "gemini took too long" in lowered
    ):
        return "Gemini took too long to answer. Press retry in a minute."
    if "timeout" in lowered or "timed out" in lowered:
        return "Internet connection timed out. Use retry."
    if any(
        marker in lowered
        for marker in (
            "disconnected",
            "connection reset",
            "connection aborted",
            "remote end closed",
            "connection error",
        )
    ):
        return "Internet connection dropped while embedding. Use retry."
    if "503" in lowered or "unavailable" in lowered:
        return "Gemini is temporarily unavailable. Use retry."
    return re.sub(r"\s+", " ", error).strip()[:180]


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
                error_message TEXT,
                storage_ext TEXT NOT NULL DEFAULT '',
                error TEXT,
                chunks_done INTEGER NOT NULL DEFAULT 0,
                chunks_total INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(sources)").fetchall()
        }
        if "storage_ext" not in columns:
            connection.execute(
                "ALTER TABLE sources ADD COLUMN storage_ext TEXT NOT NULL DEFAULT ''"
            )
        if "error" not in columns:
            connection.execute("ALTER TABLE sources ADD COLUMN error TEXT")
        if "chunks_done" not in columns:
            connection.execute(
                "ALTER TABLE sources ADD COLUMN chunks_done INTEGER NOT NULL DEFAULT 0"
            )
        if "chunks_total" not in columns:
            connection.execute(
                "ALTER TABLE sources ADD COLUMN chunks_total INTEGER NOT NULL DEFAULT 0"
            )
        connection.execute(
            "UPDATE sources SET error = error_message "
            "WHERE error IS NULL AND error_message IS NOT NULL"
        )
        connection.execute(
            """
            UPDATE sources
            SET storage_ext = CASE source_type
                WHEN 'pdf' THEN '.pdf'
                WHEN 'slide' THEN '.pptx'
                ELSE storage_ext
            END
            WHERE storage_ext = ''
            """
        )
        connection.execute(
            "CREATE TABLE IF NOT EXISTS transcripts "
            "(file_id TEXT PRIMARY KEY, transcript TEXT NOT NULL)"
        )
        connection.execute(
            "CREATE TABLE IF NOT EXISTS image_descriptions "
            "(chunk_id TEXT PRIMARY KEY, description TEXT NOT NULL)"
        )
        connection.execute(
            "CREATE TABLE IF NOT EXISTS topics "
            "(name TEXT PRIMARY KEY COLLATE NOCASE)"
        )
        connection.execute(
            "CREATE TABLE IF NOT EXISTS gemini_daily_usage "
            "(usage_date TEXT PRIMARY KEY, text_calls INTEGER NOT NULL)"
        )
        connection.execute(
            "CREATE TABLE IF NOT EXISTS gemini_rate_limit "
            "(id INTEGER PRIMARY KEY CHECK (id = 1), next_allowed_at REAL NOT NULL)"
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS topic_prerequisites (
                topic_name TEXT NOT NULL COLLATE NOCASE,
                prerequisite_name TEXT NOT NULL COLLATE NOCASE,
                PRIMARY KEY (topic_name, prerequisite_name)
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


def create_source(
    file_id: str,
    name: str,
    source_type: str = "pdf",
    video_url: str | None = None,
    storage_ext: str = ".pdf",
):
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute(
            """
            INSERT INTO sources
                (file_id, name, source_type, status, topics, video_url,
                 created_at, storage_ext)
            VALUES (?, ?, ?, 'processing', '[]', ?, ?, ?)
            """,
            (
                file_id,
                name,
                source_type,
                video_url,
                datetime.now(timezone.utc).isoformat(),
                storage_ext,
            ),
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
            SELECT file_id, name, source_type, status, topics, video_url, error,
                   chunks_done, chunks_total
            FROM sources
            ORDER BY created_at DESC
            """
        ).fetchall()

    sources = []
    for row in rows:
        source = {
            "file_id": row["file_id"],
            "name": row["name"],
            "source_type": row["source_type"],
            "status": row["status"],
            "topics": json.loads(row["topics"]),
            "video_url": row["video_url"],
            "chunks_done": row["chunks_done"],
            "chunks_total": row["chunks_total"],
        }
        if row["error"]:
            source["error"] = _plain_library_error(row["error"])
        sources.append(source)
    return sources


def set_source_topics(file_id: str, topic_names: list[str]):
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute(
            "UPDATE sources SET topics = ? WHERE file_id = ?",
            (json.dumps(sorted(set(topic_names))), file_id),
        )


def set_source_chunk_total(file_id: str, total: int):
    saved = len(_get_collection().get(where={"file_id": file_id})["ids"])
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute(
            "UPDATE sources SET chunks_done = MIN(?, ?), chunks_total = ? "
            "WHERE file_id = ?",
            (saved, total, total, file_id),
        )


def record_source_chunk_progress(file_id: str):
    saved = len(_get_collection().get(where={"file_id": file_id})["ids"])
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute(
            "UPDATE sources SET chunks_done = MIN(?, chunks_total) WHERE file_id = ?",
            (saved, file_id),
        )


def set_source_status(file_id: str, status: str, error_message: str | None = None):
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute(
            "UPDATE sources SET status = ?, error_message = ?, error = ? WHERE file_id = ?",
            (status, error_message, error_message, file_id),
        )


def start_source_retry(file_id: str) -> bool:
    with sqlite3.connect(DATABASE_PATH) as connection:
        cursor = connection.execute(
            """
            UPDATE sources
            SET status = 'processing', error_message = NULL, error = NULL
            WHERE file_id = ? AND status = 'failed'
            """,
            (file_id,),
        )
    return cursor.rowcount == 1


def fail_interrupted_sources():
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute(
            "UPDATE sources SET status = 'failed', error_message = ?, error = ? "
            "WHERE status = 'processing'",
            ("Interrupted by a server restart", "Interrupted by a server restart"),
        )


def text_calls_today() -> int:
    with sqlite3.connect(DATABASE_PATH) as connection:
        row = connection.execute(
            "SELECT text_calls FROM gemini_daily_usage WHERE usage_date = ?",
            (_pacific_date(),),
        ).fetchone()
    return row[0] if row else 0


def reserve_text_call():
    with _text_reservation_lock, sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute("BEGIN IMMEDIATE")
        today = _pacific_date()
        row = connection.execute(
            "SELECT text_calls FROM gemini_daily_usage WHERE usage_date = ?",
            (today,),
        ).fetchone()
        calls = row[0] if row else 0
        if calls >= TEXT_DAILY_BUDGET:
            raise TextBudgetExceeded(
                f"Gemini text daily limit reached ({TEXT_DAILY_BUDGET} calls). "
                "Try again after midnight Pacific time."
            )

        now = time.time()
        row = connection.execute(
            "SELECT next_allowed_at FROM gemini_rate_limit WHERE id = 1"
        ).fetchone()
        call_at = max(now, row[0] if row else now)
        connection.execute(
            "INSERT OR REPLACE INTO gemini_rate_limit (id, next_allowed_at) "
            "VALUES (1, ?)",
            (call_at + TEXT_CALL_INTERVAL_SECONDS,),
        )
        connection.execute(
            "INSERT OR REPLACE INTO gemini_daily_usage (usage_date, text_calls) "
            "VALUES (?, ?)",
            (today, calls + 1),
        )
    delay = call_at - time.time()
    if delay > 0:
        time.sleep(delay)


def get_transcript(file_id: str) -> str | None:
    with sqlite3.connect(DATABASE_PATH) as connection:
        row = connection.execute(
            "SELECT transcript FROM transcripts WHERE file_id = ?",
            (file_id,),
        ).fetchone()
    return row[0] if row else None


def save_transcript(file_id: str, transcript: str):
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute(
            "INSERT OR REPLACE INTO transcripts (file_id, transcript) VALUES (?, ?)",
            (file_id, transcript),
        )


def get_image_description(chunk_id: str) -> str | None:
    with sqlite3.connect(DATABASE_PATH) as connection:
        row = connection.execute(
            "SELECT description FROM image_descriptions WHERE chunk_id = ?",
            (chunk_id,),
        ).fetchone()
    return row[0] if row else None


def save_image_description(chunk_id: str, description: str):
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute(
            "INSERT OR REPLACE INTO image_descriptions (chunk_id, description) "
            "VALUES (?, ?)",
            (chunk_id, description),
        )


def get_topic_names() -> list[str]:
    with sqlite3.connect(DATABASE_PATH) as connection:
        rows = connection.execute("SELECT name FROM topics ORDER BY name").fetchall()
    return [row[0] for row in rows]


def get_topics():
    with sqlite3.connect(DATABASE_PATH) as connection:
        rows = connection.execute(
            """
            SELECT topic.name, prerequisite.name
            FROM topics AS topic
            LEFT JOIN topic_prerequisites AS relation
                ON relation.topic_name = topic.name
            LEFT JOIN topics AS prerequisite
                ON prerequisite.name = relation.prerequisite_name
            ORDER BY topic.name, prerequisite.name
            """
        ).fetchall()
    topics = {}
    for name, prerequisite in rows:
        topics.setdefault(name, {"name": name, "prerequisites": []})
        if prerequisite and prerequisite not in topics[name]["prerequisites"]:
            topics[name]["prerequisites"].append(prerequisite)
    return list(topics.values())


def save_topic_tags(chunks: list[dict], topic_rows: list[dict]) -> dict[str, str]:
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.row_factory = sqlite3.Row
        existing = {
            row["name"].casefold(): row["name"]
            for row in connection.execute("SELECT name FROM topics").fetchall()
        }

        def canonical_name(name: str) -> str:
            normalized = name.strip()
            canonical = existing.get(normalized.casefold(), normalized)
            connection.execute("INSERT OR IGNORE INTO topics (name) VALUES (?)", (canonical,))
            existing.setdefault(canonical.casefold(), canonical)
            return existing[canonical.casefold()]

        chunk_topics = {
            chunk["chunk_id"]: canonical_name(chunk["topic"])
            for chunk in chunks
        }
        normalized_topics = {}
        for row in topic_rows:
            name = canonical_name(row["name"])
            prerequisites = [canonical_name(item) for item in row["prerequisites"]]
            normalized_topics[name] = prerequisites

        for name, prerequisites in normalized_topics.items():
            for prerequisite in prerequisites:
                connection.execute(
                    """
                    INSERT OR IGNORE INTO topic_prerequisites
                        (topic_name, prerequisite_name)
                    VALUES (?, ?)
                    """,
                    (name, prerequisite),
                )
    return chunk_topics


def existing_chunk_ids(chunk_ids: list[str]) -> set[str]:
    if not chunk_ids:
        return set()
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
                "topic": chunk.get("topic", ""),
                "concepts": json.dumps(chunk.get("concepts", [])),
            }
            for chunk in chunks
        ],
    )


def update_chunk_tags(chunk_id: str, topic: str, concepts: list[str]):
    collection = _get_collection()
    result = collection.get(ids=[chunk_id], include=["metadatas"])
    if not result["ids"]:
        raise ValueError(f"Stored chunk {chunk_id} was not found.")
    metadata = result["metadatas"][0]
    metadata["topic"] = topic
    metadata["concepts"] = json.dumps(concepts)
    collection.update(ids=[chunk_id], metadatas=[metadata])


def get_file_chunks(file_id: str) -> list[dict]:
    result = _get_collection().get(
        where={"file_id": file_id},
        include=["documents", "metadatas"],
    )
    return [
        {
            "chunk_id": chunk_id,
            "text": text,
            "metadata": metadata,
        }
        for chunk_id, text, metadata in sorted(
            zip(result["ids"], result["documents"], result["metadatas"])
        )
    ]


def count_file_chunks(file_id: str) -> int:
    return len(_get_collection().get(where={"file_id": file_id})["ids"])


def search_chunks(
    embedding: list[float],
    limit: int = TOP_K,
    file_ids: list[str] | None = None,
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
    selected_ids = file_ids or ([file_id] if file_id else None)
    if selected_ids is not None:
        if not selected_ids:
            return []
        options["where"] = {"file_id": {"$in": selected_ids}}

    results = collection.query(**options)
    return [
        {
            "chunk_id": chunk_id,
            "text": text,
            "metadata": metadata,
            "distance": distance,
            "similarity": 1 - distance,
        }
        for chunk_id, text, metadata, distance in zip(
            results["ids"][0],
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        )
    ]
