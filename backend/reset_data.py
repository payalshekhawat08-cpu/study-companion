import shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def main():
    for directory_name in ("chroma_db", "uploads"):
        directory = BASE_DIR / directory_name
        if directory.exists():
            shutil.rmtree(directory)
        directory.mkdir(parents=True, exist_ok=True)

    data_dir = BASE_DIR / "data"
    database = data_dir / "sources.sqlite3"
    for suffix in ("", "-wal", "-shm"):
        database_path = Path(f"{database}{suffix}")
        database_path.unlink(missing_ok=True)
    data_dir.mkdir(parents=True, exist_ok=True)
    print("Removed ChromaDB, uploads, and SQLite data. Restart the backend to initialize them.")


if __name__ == "__main__":
    main()
