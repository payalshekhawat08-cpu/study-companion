import logging
import sqlite3
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from ingest import MAX_FILE_SIZE, process_source
from store import create_source, get_source, initialize_store, list_sources

BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    initialize_store()


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/upload")
async def upload(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile | None = File(default=None),
):
    if file is None:
        if "application/json" in request.headers.get("content-type", ""):
            try:
                body = await request.json()
            except ValueError:
                body = {}
            if isinstance(body, dict) and "youtube_url" in body:
                raise HTTPException(
                    status_code=400,
                    detail="YouTube ingestion is not supported yet; upload a PDF instead.",
                )
        raise HTTPException(status_code=400, detail="A PDF file is required.")

    file_id = str(uuid.uuid4())
    upload_path = UPLOADS_DIR / f"{file_id}.pdf"
    total_size = 0
    first_bytes = b""

    try:
        with upload_path.open("wb") as saved_file:
            while True:
                content = await file.read(1024 * 1024)
                if not content:
                    break
                if not first_bytes:
                    first_bytes = content[:4]
                    if first_bytes != b"%PDF":
                        raise HTTPException(
                            status_code=400,
                            detail="Only PDF files are supported.",
                        )
                total_size += len(content)
                if total_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=400,
                        detail="The PDF is too large. Maximum file size is 100 MB.",
                    )
                saved_file.write(content)

        if not first_bytes:
            raise HTTPException(status_code=400, detail="The uploaded PDF is empty.")

        source_name = Path(file.filename or "uploaded.pdf").name
        create_source(file_id, source_name)
    except HTTPException:
        upload_path.unlink(missing_ok=True)
        raise
    except OSError as exc:
        upload_path.unlink(missing_ok=True)
        logger.error("Could not save uploaded PDF %s: %s", file_id, exc)
        raise HTTPException(
            status_code=500,
            detail="The PDF could not be saved. Please try again.",
        ) from exc
    except sqlite3.Error as exc:
        upload_path.unlink(missing_ok=True)
        logger.error("Could not record uploaded PDF %s: %s", file_id, exc)
        raise HTTPException(
            status_code=500,
            detail="The PDF could not be added to your library. Please try again.",
        ) from exc
    finally:
        await file.close()

    background_tasks.add_task(process_source, file_id)
    return {"file_id": file_id, "status": "processing"}


@app.get("/library")
def library():
    return list_sources()


@app.get("/files/{file_id}")
def get_file(file_id: str):
    try:
        parsed_file_id = uuid.UUID(file_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="File not found.") from exc

    normalized_id = str(parsed_file_id)
    source = get_source(normalized_id)
    if source is None:
        raise HTTPException(status_code=404, detail="File not found.")

    file_path = UPLOADS_DIR / f"{normalized_id}.pdf"
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")

    return FileResponse(
        file_path,
        media_type="application/pdf",
        filename=source["name"],
    )
