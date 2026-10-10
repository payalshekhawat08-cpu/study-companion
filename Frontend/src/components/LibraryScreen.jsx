import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  FileText,
  Play,
  Presentation,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { addYoutubeVideo, getLibrary, uploadFile } from "@/api";
import SourceViewer from "./SourceViewer.jsx";

const acceptedExtensions = new Set([
  "pdf",
  "pptx",
  "mp4",
  "mkv",
  "webm",
  "mov",
]);

function getSourceTypeIcon(sourceType) {
  if (sourceType === "pdf") return FileText;
  if (sourceType === "slide" || sourceType === "pptx") return Presentation;
  return Play;
}

function getSourceStartCitation(source) {
  const sourceType = source.source_type === "pptx" ? "slide" : source.source_type;
  const label =
    sourceType === "pdf"
      ? "Page 1"
      : sourceType === "slide"
        ? "Slide 1"
        : "Video start";

  return {
    id: `open-${source.file_id}`,
    label,
    file_id: source.file_id,
    source_file: source.name,
    source_type: sourceType,
    location: sourceType === "video" ? 0 : 1,
    excerpt: "Preview starts here.",
  };
}

function validateYoutubeUrl(value) {
  try {
    const url = new URL(value);
    return (
      ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"].includes(
        url.hostname.toLowerCase(),
      ) && ["http:", "https:"].includes(url.protocol)
    );
  } catch {
    return false;
  }
}

export default function LibraryScreen({
  sources,
  loading,
  onSourcesChange,
  onAskAboutSource,
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [activeCitation, setActiveCitation] = useState(null);
  const fileInputRef = useRef(null);
  const activeSource = activeCitation
    ? sources.find((source) => source.file_id === activeCitation.file_id)
    : null;

  useEffect(() => {
    let active = true;
    let timer;

    async function refreshSources() {
      try {
        const currentSources = await getLibrary();
        if (!active) return;
        onSourcesChange(currentSources);
        if (currentSources.some((source) => source.status === "processing")) {
          timer = window.setTimeout(refreshSources, 3000);
        }
      } catch (error) {
        if (active) {
          toast.error(error.message || "Could not refresh your library.");
          timer = window.setTimeout(refreshSources, 3000);
        }
      }
    }

    refreshSources();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [onSourcesChange]);

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const validFiles = [];
    for (const file of files) {
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      if (!acceptedExtensions.has(extension)) {
        toast.error(
          `${file.name}: unsupported file type. Choose a PDF, PPTX, MP4, MKV, WEBM, or MOV file.`,
        );
        continue;
      }
      if (file.size > 200 * 1024 * 1024) {
        toast.warning(`${file.name} is over 200 MB. Processing may be slow.`);
      }
      validFiles.push(file);
    }
    if (!validFiles.length) return;

    setUploading(true);
    let uploaded = 0;
    try {
      for (const file of validFiles) {
        await uploadFile(file);
        uploaded += 1;
      }
      const currentSources = await getLibrary();
      onSourcesChange(currentSources);
      toast.success(
        `${uploaded} file${uploaded === 1 ? "" : "s"} added to your library.`,
      );
    } catch (error) {
      toast.error(error.message || "Could not upload your file.");
      try {
        onSourcesChange(await getLibrary());
      } catch (refreshError) {
        toast.error(refreshError.message || "Could not refresh your library.");
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleYoutubeSubmit(event) {
    event.preventDefault();
    const value = youtubeUrl.trim();
    if (!validateYoutubeUrl(value)) {
      toast.error("Enter a valid YouTube video URL.");
      return;
    }

    setUploading(true);
    try {
      await addYoutubeVideo(value);
      onSourcesChange(await getLibrary());
      setYoutubeUrl("");
      toast.success("YouTube video added to your library.");
    } catch (error) {
      toast.error(error.message || "Could not add the YouTube video.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="library-screen" aria-label="Your library">
      <div className="library-content">
        <header className="library-heading">
          <div>
            <p className="eyebrow">Your study materials</p>
            <h1>Your library</h1>
            <p>Keep your course notes, slides, and lectures together.</p>
          </div>
          <span className="library-source-count">
            {sources.length} source{sources.length === 1 ? "" : "s"}
          </span>
        </header>

        <div
          className={`library-dropzone${dragging ? " dragging" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setDragging(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            handleFiles(event.dataTransfer.files);
          }}
        >
          <div className="dropzone-icon" aria-hidden="true">
            <Upload size={21} />
          </div>
          <h2>Drop your study materials here</h2>
          <p>or choose files from your device</p>
          <button
            className="library-primary-button"
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? "Adding material..." : "Choose files"}
          </button>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            multiple
            accept=".pdf,.pptx,.mp4,.mkv,.webm,.mov"
            aria-label="Choose PDF, PPTX, or video files"
            onChange={(event) => handleFiles(event.target.files)}
          />
          <p className="accepted-file-types">
            PDF, PPTX, MP4, MKV, WEBM, or MOV · Files over 200 MB may process slowly
          </p>
        </div>

        <form className="youtube-form" onSubmit={handleYoutubeSubmit}>
          <label htmlFor="youtube-url">Add a YouTube video</label>
          <div className="youtube-input-row">
            <input
              id="youtube-url"
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              disabled={uploading}
              onChange={(event) => setYoutubeUrl(event.target.value)}
            />
            <button
              className="library-secondary-button"
              type="submit"
              disabled={uploading || !youtubeUrl.trim()}
            >
              Add video
            </button>
          </div>
        </form>

        <section className="library-list-section" aria-labelledby="sources-title">
          <div className="library-list-heading">
            <div>
              <h2 id="sources-title">Sources</h2>
              <p>Your uploaded and linked learning materials.</p>
            </div>
            {sources.some((source) => source.status === "processing") && (
              <span className="library-refreshing">Updating status…</span>
            )}
          </div>

          {loading && sources.length === 0 ? (
            <p className="library-empty-state">Loading your sources…</p>
          ) : sources.length === 0 ? (
            <div className="library-empty-state">
              <div className="dropzone-icon" aria-hidden="true">
                <FileText size={19} />
              </div>
              <p>No materials yet. Add a file or YouTube video to get started.</p>
            </div>
          ) : (
            <ul className="source-list">
              {sources.map((source) => {
                const Icon = getSourceTypeIcon(source.source_type);
                const citation = getSourceStartCitation(source);
                return (
                  <li className="source-list-item" key={source.file_id}>
                    <div className="source-item-icon" aria-hidden="true">
                      <Icon size={18} />
                    </div>
                    <div className="source-item-details">
                      <p className="source-item-name">{source.name}</p>
                      <div className="source-item-meta">
                        <span className={`source-status ${source.status}`}>
                          {source.status === "failed" && (
                            <AlertTriangle size={12} aria-hidden="true" />
                          )}
                          {source.status}
                        </span>
                        {(source.topics || []).length > 0 ? (
                          <div className="source-topic-list" aria-label="Topics">
                            {source.topics.map((topic) => (
                              <span className="source-topic-chip" key={topic}>
                                {topic}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="source-topic-empty">
                            {source.status === "processing"
                              ? "Topics will appear when processing finishes."
                              : "No topics found."}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="source-item-actions">
                      <button
                        className="source-action"
                        type="button"
                        disabled={source.status !== "ready"}
                        onClick={() => setActiveCitation(citation)}
                      >
                        Open
                      </button>
                      <button
                        className="source-action"
                        type="button"
                        disabled={source.status !== "ready"}
                        onClick={() => onAskAboutSource(source.file_id)}
                      >
                        Ask about this
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {activeCitation && (
        <div className="library-viewer-layer">
          <button
            className="viewer-backdrop"
            type="button"
            aria-label="Close source viewer"
            onClick={() => setActiveCitation(null)}
          />
          <SourceViewer
            citation={activeCitation}
            source={activeSource}
            onClose={() => setActiveCitation(null)}
          />
        </div>
      )}
    </section>
  );
}
