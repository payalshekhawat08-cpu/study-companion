import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  FileText,
  MessageCircle,
  Play,
  Presentation,
  Send,
} from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { askQuestion } from "@/api";
import SourceViewer from "./SourceViewer.jsx";

function CitationButton({ citation, onClick }) {
  const Icon =
    citation.source_type === "pdf"
      ? FileText
      : citation.source_type === "slide"
        ? Presentation
        : Play;

  return (
    <button
      className="citation-chip"
      type="button"
      onClick={() => onClick(citation)}
      aria-label={`Open source: ${citation.label}`}
    >
      <Icon size={14} aria-hidden="true" />
      <span>{citation.label}</span>
    </button>
  );
}

function AnimatedAnswer({ text, animate }) {
  const reduceMotion = useReducedMotion();
  const [visibleWords, setVisibleWords] = useState(
    animate && !reduceMotion ? 0 : text.split(/\s+/).length,
  );
  const words = text.split(/\s+/);

  useEffect(() => {
    if (reduceMotion) {
      setVisibleWords(words.length);
      return undefined;
    }
    setVisibleWords(0);
    const interval = window.setInterval(() => {
      setVisibleWords((count) => {
        if (count + 1 >= words.length) {
          window.clearInterval(interval);
          return words.length;
        }
        return count + 1;
      });
    }, 35);
    return () => window.clearInterval(interval);
  }, [text, reduceMotion]);

  return <p className="message-copy">{words.slice(0, visibleWords).join(" ")}</p>;
}

function NotCoveredCard({
  title = "Not covered in your material",
  message,
  onRephrase,
  onBrowseLibrary,
}) {
  return (
    <div className="not-covered-card">
      <h3>{title}</h3>
      <p>{message}</p>
      <div className="not-covered-actions">
        <button className="text-action" type="button" onClick={onRephrase}>
          Rephrase
        </button>
        <button
          className="text-action"
          type="button"
          onClick={onBrowseLibrary}
        >
          Browse library
        </button>
      </div>
    </div>
  );
}

export default function ChatScreen({
  sources,
  onBrowseLibrary,
  onQuizSources,
}) {
  const [selectedSourceIds, setSelectedSourceIds] = useState([]);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [waiting, setWaiting] = useState(false);
  const [activeCitation, setActiveCitation] = useState(null);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function toggleSource(sourceId) {
    setSelectedSourceIds((current) =>
      current.includes(sourceId)
        ? current.filter((id) => id !== sourceId)
        : [...current, sourceId],
    );
  }

  async function sendQuestion(text, followUpPrompt = text) {
    const cleanQuestion = text.trim();
    if (!cleanQuestion || waiting) return;
    setQuestion("");
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: cleanQuestion },
    ]);
    setWaiting(true);

    try {
      const response = await askQuestion(cleanQuestion, selectedSourceIds);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: response.answer,
          grounded: response.grounded,
          citations: response.citations,
          previousQuestion: followUpPrompt,
          animate: true,
        },
      ]);
    } catch (error) {
      toast.error(error.message || "Could not search your material.");
    } finally {
      setWaiting(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendQuestion(question);
  }

  return (
    <section className="chat-screen" aria-label="Study chat">
      <div className="chat-workspace">
        <SourceViewer
          citation={activeCitation}
          source={sources.find(
            (item) => item.file_id === activeCitation?.file_id,
          )}
          onClose={() => setActiveCitation(null)}
        />

        {activeCitation && (
          <button
            className="viewer-backdrop"
            type="button"
            aria-label="Close source viewer"
            onClick={() => setActiveCitation(null)}
          />
        )}

        <div className="chat-panel">
          <div className="chat-toolbar">
            <div>
              <p className="eyebrow">Ask your material</p>
              <h1>Study chat</h1>
            </div>
            <details className="source-filter">
              <summary>
                {selectedSourceIds.length
                  ? `${selectedSourceIds.length} source${selectedSourceIds.length === 1 ? "" : "s"}`
                  : "All sources"}
              </summary>
              <div className="source-filter-menu">
                {sources
                  .filter((source) => source.status === "ready")
                  .map((source) => (
                    <label className="source-filter-option" key={source.file_id}>
                      <input
                        type="checkbox"
                        checked={selectedSourceIds.includes(source.file_id)}
                        onChange={() => toggleSource(source.file_id)}
                      />
                      <span>{source.name}</span>
                    </label>
                  ))}
                {selectedSourceIds.length > 0 && (
                  <button
                    className="clear-filter"
                    type="button"
                    onClick={() => setSelectedSourceIds([])}
                  >
                    Clear filter
                  </button>
                )}
              </div>
            </details>
          </div>

          <div className="chat-messages" aria-live="polite">
            {messages.length === 0 && (
              <div className="chat-empty-state">
                <div className="viewer-empty-icon" aria-hidden="true">
                  <MessageCircle size={21} />
                </div>
                <p>Ask a question about your course material.</p>
                <span>Answers come from your sources and include citations.</span>
              </div>
            )}

            {messages.map((message) => (
              <article
                className={`chat-message ${message.role}`}
                key={message.id}
              >
                <p className="message-author">
                  {message.role === "user" ? "You" : "Study Companion"}
                </p>
                {message.role === "assistant" &&
                (!message.grounded || message.citations.length === 0) ? (
                  <NotCoveredCard
                    title={
                      message.grounded
                        ? "Answer unavailable"
                        : "Not covered in your material"
                    }
                    message={
                      message.grounded
                        ? "This answer did not include a source citation, so it can't be shown as grounded."
                        : message.text
                    }
                    onRephrase={() => inputRef.current?.focus()}
                    onBrowseLibrary={onBrowseLibrary}
                  />
                ) : (
                  <div className="message-body">
                    {message.role === "assistant" ? (
                      <AnimatedAnswer
                        text={message.text}
                        animate={message.animate}
                      />
                    ) : (
                      <p className="message-copy">{message.text}</p>
                    )}
                    {message.role === "assistant" && message.grounded && (
                      <>
                        {message.citations.length > 0 ? (
                          <div className="citation-list">
                            {message.citations.map((citation) => (
                              <CitationButton
                                key={citation.id}
                                citation={citation}
                                onClick={setActiveCitation}
                              />
                            ))}
                          </div>
                        ) : null}
                        <div className="follow-up-list">
                          <button
                            className="follow-up-chip"
                            type="button"
                            disabled={waiting}
                            onClick={() =>
                              sendQuestion(
                                `Explain more simply: ${message.previousQuestion}`,
                                message.previousQuestion,
                              )
                            }
                          >
                            Explain simpler
                          </button>
                          <button
                            className="follow-up-chip"
                            type="button"
                            disabled={waiting}
                            onClick={() =>
                              sendQuestion(
                                `Give an example of: ${message.previousQuestion}`,
                                message.previousQuestion,
                              )
                            }
                          >
                            Give an example
                          </button>
                          <button
                            className="follow-up-chip"
                            type="button"
                            onClick={() =>
                              onQuizSources([
                                ...new Set(
                                  message.citations.map(
                                    (citation) => citation.file_id,
                                  ),
                                ),
                              ])
                            }
                          >
                            <BookOpen size={13} aria-hidden="true" />
                            Quiz me on this
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </article>
            ))}

            {waiting && (
              <p className="searching-message">Searching your material...</p>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-input-form" onSubmit={handleSubmit}>
            <textarea
              ref={inputRef}
              className="chat-input"
              rows="2"
              aria-label="Question"
              placeholder="Ask about your material..."
              value={question}
              disabled={waiting}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!waiting) sendQuestion(question);
                }
              }}
            />
            <button
              className="send-button"
              type="submit"
              disabled={waiting || !question.trim()}
              aria-label="Send question"
            >
              <Send size={17} aria-hidden="true" />
            </button>
          </form>
          <p className="input-hint">Enter to send · Shift + Enter for a new line</p>
        </div>
      </div>
    </section>
  );
}
