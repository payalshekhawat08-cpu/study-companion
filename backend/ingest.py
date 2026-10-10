import hashlib
import json
import logging
import math
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pymupdf
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import NoTranscriptFound, TranscriptsDisabled

from config import (
    ENABLE_IMAGE_DESCRIPTIONS,
    MAX_PDF_FIGURES,
    PDF_CHUNK_OVERLAP,
    PDF_CHUNK_SIZE,
    SLIDE_CHUNK_SIZE,
    TOPIC_TAGGING_SINGLE_CALL_MAX_CHUNKS,
    TOPIC_TAGGING_SNIPPET_SIZE,
    VIDEO_FILE_MAX_SIZE,
    VIDEO_OVERLAP_SECONDS,
    VIDEO_WINDOW_SECONDS,
)
from gemini_client import (
    GeminiQuotaError,
    embed_batches,
    generate_json,
    generate_vision_json,
    transcribe_video_file,
)
from prompts import PDF_FIGURE_PROMPT, SLIDE_IMAGE_PROMPT, TOPIC_TAGGING_PROMPT
from store import (
    count_file_chunks,
    existing_chunk_ids,
    get_file_chunks,
    get_image_description,
    get_source,
    get_topic_names,
    get_transcript,
    save_chunks,
    save_image_description,
    save_topic_tags,
    save_transcript,
    set_source_status,
    set_source_topics,
    update_chunk_tags,
)

BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
MAX_FILE_SIZE = 100 * 1024 * 1024
MAX_VIDEO_FILE_SIZE = VIDEO_FILE_MAX_SIZE
logger = logging.getLogger(__name__)


def split_text(
    text: str,
    file_id: str,
    source_file: str,
    source_type: str,
    location: int,
    prefix: str,
    chunk_size: int,
    overlap: int = 0,
):
    clean_text = text.strip()
    chunks = []
    start = 0
    chunk_number = 0
    while start < len(clean_text):
        end = min(start + chunk_size, len(clean_text))
        chunk_text = clean_text[start:end].strip()
        if chunk_text:
            chunks.append(
                {
                    "chunk_id": f"{file_id}:{prefix}:c{chunk_number}",
                    "file_id": file_id,
                    "source_file": source_file,
                    "source_type": source_type,
                    "location": location,
                    "text": chunk_text,
                }
            )
            chunk_number += 1
        if end == len(clean_text):
            break
        start = end - overlap
    return chunks


def read_pdf_chunks(pdf_path: Path, file_id: str, source_file: str):
    chunks = []
    figures = []
    described_count = 0
    with pymupdf.open(pdf_path) as document:
        page_count = document.page_count
        for page_index, page in enumerate(document):
            page_number = page_index + 1
            page_text = page.get_text("text")
            if page_text.strip():
                chunks.extend(
                    split_text(
                        page_text,
                        file_id,
                        source_file,
                        "pdf",
                        page_number,
                        f"p{page_number}",
                        PDF_CHUNK_SIZE,
                        PDF_CHUNK_OVERLAP,
                    )
                )

            page_xrefs = set()
            for image_info in page.get_images(full=True):
                xref, _, width, height = image_info[:4]
                if xref in page_xrefs or width <= 150 or height <= 150:
                    continue
                page_xrefs.add(xref)
                if described_count >= MAX_PDF_FIGURES:
                    break
                image = document.extract_image(xref)
                figure_id = f"{file_id}:p{page_number}:figure{xref}"
                figures.append(
                    (
                        {
                            "chunk_id": figure_id,
                            "file_id": file_id,
                            "source_file": source_file,
                            "source_type": "pdf",
                            "location": page_number,
                        },
                        image["image"],
                        image.get("ext", "png"),
                    )
                )
                described_count += 1
    return page_count, chunks, figures


def read_slide_content(pptx_path: Path, file_id: str, source_file: str):
    presentation = Presentation(str(pptx_path))
    chunks = []
    pictures = []
    for slide_number, slide in enumerate(presentation.slides, start=1):
        text_parts = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                text = shape.text.strip()
                if text:
                    text_parts.append(text)
            if shape.has_table:
                for row in shape.table.rows:
                    row_text = " | ".join(
                        cell.text.strip() for cell in row.cells if cell.text.strip()
                    )
                    if row_text:
                        text_parts.append(row_text)
            if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                picture_id = f"{file_id}:s{slide_number}:image{shape.shape_id}"
                pictures.append(
                    (
                        {
                            "chunk_id": picture_id,
                            "file_id": file_id,
                            "source_file": source_file,
                            "source_type": "slide",
                            "location": slide_number,
                        },
                        shape.image.blob,
                        shape.image.content_type,
                    )
                )

        if slide.has_notes_slide:
            notes = slide.notes_slide.notes_text_frame.text.strip()
            if notes and notes not in {"Click to add notes", "Notes"}:
                text_parts.append(notes)

        text = "\n".join(text_parts)
        chunks.extend(
            split_text(
                text,
                file_id,
                source_file,
                "slide",
                slide_number,
                f"s{slide_number}",
                SLIDE_CHUNK_SIZE,
            )
        )
    return len(presentation.slides), chunks, pictures


def _image_mime(extension: str) -> str:
    extension = extension.lower()
    if extension in {"jpg", "jpeg"}:
        return "image/jpeg"
    if extension == "gif":
        return "image/gif"
    if extension == "webp":
        return "image/webp"
    return "image/png"


def _process_pictures(pictures, prompt: str, source_name: str):
    if not ENABLE_IMAGE_DESCRIPTIONS:
        return
    captions = {}
    for picture, image_bytes, mime_type in pictures:
        if existing_chunk_ids([picture["chunk_id"]]):
            continue
        image_hash = hashlib.sha256(image_bytes).hexdigest()
        description = get_image_description(picture["chunk_id"])
        if description is not None:
            captions[image_hash] = description
        elif image_hash not in captions:
            captions[image_hash] = generate_vision_json(
                prompt,
                image=(image_bytes, mime_type),
            )
            save_image_description(picture["chunk_id"], captions[image_hash])
        else:
            save_image_description(picture["chunk_id"], captions[image_hash])
        picture["text"] = picture.get("text_prefix", "") + captions[image_hash]
        _store_chunks([picture], source_name)


def _store_chunks(chunks: list[dict], source_name: str):
    stored_ids = existing_chunk_ids([chunk["chunk_id"] for chunk in chunks])
    missing_chunks = [
        chunk for chunk in chunks if chunk["chunk_id"] not in stored_ids
    ]
    missing_texts = [chunk["text"] for chunk in missing_chunks]
    for start, embeddings in embed_batches(
        missing_texts,
        task="document",
        title=source_name,
    ):
        save_chunks([missing_chunks[start]], embeddings)


def _parse_json(response: str, description: str):
    try:
        parsed = json.loads(response)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Gemini returned invalid JSON for {description}.") from exc
    if not isinstance(parsed, dict):
        raise ValueError(f"Gemini returned invalid JSON for {description}.")
    return parsed


def _tag_source(file_id: str, source_name: str):
    chunks = [
        chunk for chunk in get_file_chunks(file_id)
        if not chunk["metadata"].get("topic")
    ]
    if not chunks:
        set_source_topics(file_id, [])
        return
    known_topics = get_topic_names()
    if len(chunks) > TOPIC_TAGGING_SINGLE_CALL_MAX_CHUNKS:
        midpoint = (len(chunks) + 1) // 2
        batches = [chunks[:midpoint], chunks[midpoint:]]
    else:
        batches = [chunks]
    for batch in batches:
        supplied = [
            {
                "id": chunk["chunk_id"],
                "text": " ".join(chunk["text"].split())[
                    :TOPIC_TAGGING_SNIPPET_SIZE
                ],
            }
            for chunk in batch
        ]
        response = generate_json(
            TOPIC_TAGGING_PROMPT.format(
                existing_topics=json.dumps(known_topics),
                chunks=json.dumps(supplied),
            )
        )
        parsed = _parse_json(response, "topic tags")
        tagged = parsed.get("chunks")
        topic_rows = parsed.get("topics")
        if not isinstance(tagged, list) or not isinstance(topic_rows, list):
            raise ValueError("Gemini returned incomplete topic tags.")
        supplied_ids = {chunk["chunk_id"] for chunk in batch}
        normalized = {}
        for item in tagged:
            if (
                not isinstance(item, dict)
                or not isinstance(item.get("id"), str)
                or item["id"] not in supplied_ids
            ):
                continue
            topic = item.get("topic")
            concepts = item.get("concepts")
            if not isinstance(topic, str) or not topic.strip():
                raise ValueError("Gemini returned an empty topic name.")
            if not isinstance(concepts, list) or any(
                not isinstance(concept, str) for concept in concepts
            ):
                raise ValueError("Gemini returned invalid topic concepts.")
            normalized[item["id"]] = {
                "chunk_id": item["id"],
                "topic": topic.strip(),
                "concepts": concepts,
            }
        if set(normalized) != supplied_ids:
            raise ValueError("Gemini did not tag every chunk in the batch.")

        clean_topic_rows = []
        for item in topic_rows:
            if not isinstance(item, dict):
                raise ValueError("Gemini returned an invalid topic prerequisite.")
            name = item.get("name")
            prerequisites = item.get("prerequisites")
            if not isinstance(name, str) or not name.strip():
                raise ValueError("Gemini returned an empty topic name.")
            if not isinstance(prerequisites, list) or any(
                not isinstance(value, str) or not value.strip()
                for value in prerequisites
            ):
                raise ValueError("Gemini returned invalid topic prerequisites.")
            clean_topic_rows.append(
                {"name": name.strip(), "prerequisites": prerequisites}
            )
        reported_topics = {item["name"].casefold() for item in clean_topic_rows}
        if any(
            item["topic"].casefold() not in reported_topics
            for item in normalized.values()
        ):
            raise ValueError("Gemini omitted prerequisite data for a chunk topic.")

        canonical_topics = save_topic_tags(
            list(normalized.values()),
            clean_topic_rows,
        )
        for chunk in batch:
            tag = normalized[chunk["chunk_id"]]
            update_chunk_tags(
                chunk["chunk_id"],
                canonical_topics[chunk["chunk_id"]],
                tag["concepts"],
            )
        known_topics = get_topic_names()

    topic_names = sorted(
        {
            chunk["metadata"]["topic"]
            for chunk in get_file_chunks(file_id)
            if chunk["metadata"].get("topic")
        }
    )
    set_source_topics(file_id, topic_names)


def _process_transcript(file_id: str, source: dict, transcript: str):
    parsed = _parse_json(transcript, "video transcript")
    segments = parsed.get("segments")
    if not isinstance(segments, list):
        raise ValueError("The video transcript did not contain timestamped segments.")
    clean_segments = []
    for segment in segments:
        if not isinstance(segment, dict):
            continue
        start = segment.get("start")
        text = segment.get("text")
        if (
            isinstance(start, (int, float))
            and math.isfinite(start)
            and start >= 0
            and isinstance(text, str)
            and text.strip()
        ):
            clean_segments.append({"start": float(start), "text": text.strip()})
    if not clean_segments:
        raise ValueError("No transcript captions were found for this video.")
    clean_segments.sort(key=lambda segment: segment["start"])
    last_start = int(clean_segments[-1]["start"])
    stride = VIDEO_WINDOW_SECONDS - VIDEO_OVERLAP_SECONDS
    chunks = []
    for window_start in range(0, last_start + 1, stride):
        window_end = window_start + VIDEO_WINDOW_SECONDS
        window_segments = [
            segment for segment in clean_segments
            if window_start <= segment["start"] < window_end
        ]
        if not window_segments:
            continue
        text = "\n".join(
            f"[{int(segment['start'])}s] {segment['text']}"
            for segment in window_segments
        )
        chunks.append(
            {
                "chunk_id": f"{file_id}:v{window_start}",
                "file_id": file_id,
                "source_file": source["name"],
                "source_type": "video",
                "location": window_start,
                "text": text,
            }
        )
    _store_chunks(chunks, source["name"])
    _tag_source(file_id, source["name"])
    return len(chunks)


def _youtube_transcript(video_id: str) -> str:
    try:
        transcript = YouTubeTranscriptApi().fetch(video_id)
    except (NoTranscriptFound, TranscriptsDisabled) as exc:
        raise ValueError("No captions are available for this YouTube video.") from exc
    except Exception as exc:
        raise ValueError(f"The YouTube transcript could not be fetched: {exc}") from exc
    segments = [
        {"start": item.start, "text": item.text}
        for item in transcript
    ]
    return json.dumps({"segments": segments})


def process_source(file_id: str):
    source = get_source(file_id)
    if source is None:
        return {"status": "failed", "error": "The uploaded source could not be found."}

    try:
        if source["source_type"] == "video":
            return process_video_source(file_id, source)
        upload_path = UPLOADS_DIR / f"{file_id}{source['storage_ext']}"
        if not upload_path.is_file():
            raise ValueError("The uploaded source file could not be found.")

        if source["source_type"] == "pdf":
            page_count, chunks, figures = read_pdf_chunks(
                upload_path,
                file_id,
                source["name"],
            )
            _store_chunks(chunks, source["name"])
            figure_pictures = [
                (
                    figure,
                    image_bytes,
                    _image_mime(extension),
                )
                for figure, image_bytes, extension in figures
            ]
            for figure, image_bytes, mime_type in figure_pictures:
                figure["text_prefix"] = f"[Figure on page {figure['location']}] "
            _process_pictures(figure_pictures, PDF_FIGURE_PROMPT, source["name"])
            _tag_source(file_id, source["name"])
            set_source_status(file_id, "ready")
            return {
                "status": "ready",
                "pages": page_count,
                "chunks": count_file_chunks(file_id),
            }

        if source["source_type"] == "slide":
            slide_count, chunks, pictures = read_slide_content(
                upload_path,
                file_id,
                source["name"],
            )
            _store_chunks(chunks, source["name"])
            for picture, _, _ in pictures:
                picture["text_prefix"] = f"[Image on slide {picture['location']}] "
            _process_pictures(pictures, SLIDE_IMAGE_PROMPT, source["name"])
            _tag_source(file_id, source["name"])
            set_source_status(file_id, "ready")
            return {
                "status": "ready",
                "slides": slide_count,
                "chunks": count_file_chunks(file_id),
            }
        raise ValueError("This source type is not supported.")
    except GeminiQuotaError as exc:
        set_source_status(file_id, "failed", str(exc))
        logger.warning("Ingestion failed for %s: %s", file_id, exc)
        return {"status": "failed", "error": str(exc)}
    except Exception as exc:
        message = f"Source processing failed: {exc}"
        set_source_status(file_id, "failed", message)
        logger.error("Ingestion failed for %s: %s", file_id, message)
        return {"status": "failed", "error": message}


def process_video_source(file_id: str, source: dict):
    try:
        transcript = get_transcript(file_id)
        if transcript is None:
            if source["video_url"]:
                parsed_url = urlparse(source["video_url"])
                host = (parsed_url.hostname or "").lower()
                if host == "youtu.be" or host.endswith(".youtu.be"):
                    video_id = parsed_url.path.strip("/").split("/", 1)[0]
                else:
                    video_id = parse_qs(parsed_url.query).get("v", [""])[0]
                    if not video_id:
                        parts = [part for part in parsed_url.path.split("/") if part]
                        video_id = parts[-1] if parts else ""
                transcript = _youtube_transcript(video_id)
            else:
                video_path = UPLOADS_DIR / f"{file_id}{source['storage_ext']}"
                if not video_path.is_file():
                    raise ValueError("The uploaded video file could not be found.")
                transcript = transcribe_video_file(video_path)
            save_transcript(file_id, transcript)

        count = _process_transcript(file_id, source, transcript)
        set_source_status(file_id, "ready")
        return {"status": "ready", "chunks": count_file_chunks(file_id)}
    except GeminiQuotaError as exc:
        set_source_status(file_id, "failed", str(exc))
        logger.warning("Video ingestion failed for %s: %s", file_id, exc)
        return {"status": "failed", "error": str(exc)}
    except Exception as exc:
        message = f"Video processing failed: {exc}"
        set_source_status(file_id, "failed", message)
        logger.error("Video ingestion failed for %s: %s", file_id, message)
        return {"status": "failed", "error": message}
