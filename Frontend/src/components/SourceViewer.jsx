import { useEffect, useRef, useState } from "react";
import { FileText, Play, Presentation, X } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { getFileUrl } from "@/api";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function getYoutubeEmbedUrl(videoUrl, location) {
  try {
    const url = new URL(videoUrl);
    let videoId = "";
    if (url.hostname === "youtu.be" || url.hostname === "www.youtu.be") {
      videoId = url.pathname.slice(1);
    } else if (
      ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)
    ) {
      videoId = url.searchParams.get("v") || "";
      if (url.pathname.startsWith("/embed/")) {
        videoId = url.pathname.split("/")[2] || "";
      }
    }
    if (!/^[\w-]{11}$/.test(videoId)) return null;
    return `https://www.youtube-nocookie.com/embed/${videoId}?start=${Math.max(0, Math.floor(location))}`;
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
}

function PdfPreview({ citation, fileUrl, onMissing }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(520);
  const [pageCount, setPageCount] = useState(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(220, Math.min(640, entry.contentRect.width - 24)));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="pdf-preview" ref={containerRef}>
      <Document
        file={fileUrl}
        onLoadSuccess={({ numPages }) => setPageCount(numPages)}
        onLoadError={onMissing}
        loading={<p className="viewer-placeholder">Loading this page...</p>}
        error={<p className="viewer-placeholder">This sample PDF is not available.</p>}
        noData={<p className="viewer-placeholder">This sample PDF is not available.</p>}
      >
        <Page
          pageNumber={citation.location}
          width={width}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          onRenderError={onMissing}
        />
      </Document>
      {pageCount !== null && citation.location > pageCount && (
        <p className="viewer-placeholder">
          Page {citation.location} is not present in this file.
        </p>
      )}
    </div>
  );
}

export default function SourceViewer({ citation, source, onClose }) {
  const [missing, setMissing] = useState(false);
  const videoRef = useRef(null);
  const fileUrl = citation
    ? getFileUrl(citation.file_id, citation.source_type)
    : null;
  const youtubeUrl =
    citation?.source_type === "video" && source?.video_url
      ? getYoutubeEmbedUrl(source.video_url, citation.location)
      : null;

  useEffect(() => {
    setMissing(false);
  }, [citation]);

  useEffect(() => {
    if (citation?.source_type === "video" && videoRef.current) {
      videoRef.current.currentTime = Math.max(0, citation.location);
    }
  }, [citation]);

  if (!citation) {
    return (
      <aside className="source-viewer source-viewer-empty" aria-label="Source viewer">
        <div className="viewer-empty-icon" aria-hidden="true">
          <FileText size={22} />
        </div>
        <h2>Source viewer</h2>
        <p>Choose a citation to open the matching page, slide, or moment.</p>
      </aside>
    );
  }

  const Icon =
    citation.source_type === "pdf"
      ? FileText
      : citation.source_type === "slide"
        ? Presentation
        : Play;

  return (
    <aside
      className="source-viewer source-viewer-open"
      aria-label="Source viewer"
    >
      <header className="viewer-header">
        <div className="viewer-heading">
          <Icon size={17} aria-hidden="true" />
          <span>Source</span>
        </div>
        <button
          className="icon-button viewer-close"
          type="button"
          onClick={onClose}
          aria-label="Close source viewer"
        >
          <X size={18} />
        </button>
      </header>
      <div className="viewer-content">
        <p className="viewer-file-name">{citation.source_file}</p>
        <p className="viewer-location">{citation.label}</p>

        {citation.source_type === "pdf" &&
          (missing || !fileUrl ? (
            <p className="viewer-placeholder">
              This sample PDF is not available. The cited page is {citation.location}.
            </p>
          ) : (
            <PdfPreview
              citation={citation}
              fileUrl={fileUrl}
              onMissing={() => setMissing(true)}
            />
          ))}

        {citation.source_type === "slide" && (
          <div className="slide-preview">
            <p className="slide-number">Slide {citation.location}</p>
            <p className="viewer-placeholder">
              A slide preview is not available for this source.
            </p>
          </div>
        )}

        {citation.source_type === "video" &&
          (youtubeUrl ? (
            <iframe
              className="youtube-preview"
              src={youtubeUrl}
              title={`Video at ${citation.label}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : missing || !fileUrl ? (
            <p className="viewer-placeholder">
              This sample video is not available. The cited time is {citation.label}.
            </p>
          ) : (
            <video
              ref={videoRef}
              className="video-preview"
              src={fileUrl}
              controls
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = Math.max(0, citation.location);
                }
              }}
              onError={() => setMissing(true)}
            >
              Your browser does not support embedded video.
            </video>
          ))}

        <section className="excerpt-section" aria-labelledby="excerpt-title">
          <h3 id="excerpt-title">Cited excerpt</h3>
          <p>{citation.excerpt}</p>
        </section>
      </div>
    </aside>
  );
}
