import { useMemo, useState } from "react";
import Confetti from "react-confetti";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Play,
  Presentation,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { getQuiz, submitQuizAnswer } from "@/api";
import SourceViewer from "./SourceViewer.jsx";

const questionTypes = [
  { id: "mcq", label: "Multiple choice" },
  { id: "short", label: "Short answer" },
  { id: "numerical", label: "Numerical" },
];

const difficulties = ["easy", "medium", "hard", "mixed"];

function CitationButton({ citation, onOpen }) {
  const Icon =
    citation.source_type === "pdf"
      ? FileText
      : citation.source_type === "slide"
        ? Presentation
        : Play;

  return (
    <button
      className="citation-chip quiz-citation"
      type="button"
      onClick={() => onOpen(citation)}
      aria-label={`Open source: ${citation.label}`}
    >
      <Icon size={14} aria-hidden="true" />
      <span>{citation.label}</span>
    </button>
  );
}

function getTopicBreakdown(answers) {
  return answers.reduce((topics, item) => {
    const topic = item.question.topic;
    topics[topic] ??= { correct: 0, wrong: 0 };
    topics[topic][item.result.correct ? "correct" : "wrong"] += 1;
    return topics;
  }, {});
}

export default function QuizScreen({
  sources,
  initialSourceIds = [],
  starterQuiz = null,
  onDashboard,
}) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState(starterQuiz ? "taking" : "setup");
  const [scope, setScope] = useState(
    initialSourceIds.length ? "sources" : "all",
  );
  const [sourceIds, setSourceIds] = useState(initialSourceIds);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [types, setTypes] = useState(["mcq", "short", "numerical"]);
  const [count, setCount] = useState("5");
  const [difficulty, setDifficulty] = useState("mixed");
  const [questions, setQuestions] = useState(starterQuiz?.questions || []);
  const [diagnostic, setDiagnostic] = useState(
    Boolean(starterQuiz?.diagnostic),
  );
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState(null);
  const [answerResult, setAnswerResult] = useState(null);
  const [answerHistory, setAnswerHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeCitation, setActiveCitation] = useState(null);

  const topics = useMemo(
    () => [...new Set(sources.flatMap((source) => source.topics || []))].sort(),
    [sources],
  );

  const currentQuestion = questions[questionIndex];
  const topicBreakdown = useMemo(
    () => getTopicBreakdown(answerHistory),
    [answerHistory],
  );
  const weakTopics = Object.entries(topicBreakdown)
    .filter(([, values]) => values.wrong > 0)
    .map(([topic]) => topic);
  const correctCount = answerHistory.filter(
    (item) => item.result.correct,
  ).length;
  const score =
    answerHistory.length > 0
      ? Math.round((correctCount / answerHistory.length) * 100)
      : 0;
  const misconceptions = [
    ...new Set(
      answerHistory
        .map((item) => item.result.misconception)
        .filter(Boolean),
    ),
  ];

  function toggleValue(value, values, setValues) {
    setValues((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  async function loadQuiz(options) {
    setLoading(true);
    try {
      const result = await getQuiz(options);
      if (!result.length) {
        toast.error("No questions match those choices. Try a broader scope.");
        return false;
      }
      setQuestions(result);
      setQuestionIndex(0);
      setAnswer(null);
      setAnswerResult(null);
      setAnswerHistory([]);
      setDiagnostic(Boolean(options.diagnostic));
      setPhase("taking");
      return true;
    } catch (error) {
      toast.error(error.message || "Could not prepare the quiz.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  function startQuiz(event) {
    event.preventDefault();
    if (!types.length) {
      toast.error("Choose at least one question type.");
      return;
    }
    if (scope === "sources" && !sourceIds.length) {
      toast.error("Select at least one source.");
      return;
    }
    if (scope === "topics" && !selectedTopics.length) {
      toast.error("Select at least one topic.");
      return;
    }

    const questionCount = Number(count);
    if (!Number.isInteger(questionCount) || questionCount < 3 || questionCount > 15) {
      toast.error("Choose between 3 and 15 questions.");
      return;
    }

    loadQuiz({
      topics: scope === "topics" ? selectedTopics : [],
      sourceIds: scope === "sources" ? sourceIds : [],
      types,
      count: questionCount,
      difficulty,
      diagnostic: false,
    });
  }

  async function submitAnswer(event) {
    event.preventDefault();
    if (!currentQuestion || answer === null || String(answer).trim() === "") {
      toast.error("Choose or enter an answer first.");
      return;
    }

    const submittedAnswer =
      currentQuestion.type === "numerical" ? Number(answer) : answer;
    if (
      currentQuestion.type === "numerical" &&
      !Number.isFinite(submittedAnswer)
    ) {
      toast.error("Enter a valid number.");
      return;
    }

    setLoading(true);
    try {
      const result = await submitQuizAnswer(currentQuestion.id, submittedAnswer);
      setAnswerResult(result);
      setAnswerHistory((history) => [...history, { question: currentQuestion, result }]);
    } catch (error) {
      toast.error(error.message || "Could not submit your answer.");
    } finally {
      setLoading(false);
    }
  }

  function nextQuestion() {
    if (questionIndex + 1 >= questions.length) {
      setPhase("results");
      return;
    }
    setQuestionIndex((index) => index + 1);
    setAnswer(null);
    setAnswerResult(null);
  }

  function retryWeakTopics() {
    if (!weakTopics.length) return;
    loadQuiz({
      topics: weakTopics,
      sourceIds: scope === "sources" ? sourceIds : [],
      types,
      count: Math.min(15, Math.max(3, Number(count) || 5)),
      difficulty,
      diagnostic: false,
    });
  }

  const activeQuestion = currentQuestion;
  const activeSource = activeCitation
    ? sources.find((source) => source.file_id === activeCitation.file_id)
    : null;

  return (
    <section className="quiz-screen" aria-label="Quiz">
      <div className="chat-workspace quiz-workspace">
        <SourceViewer
          citation={activeCitation}
          source={activeSource}
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

        <div className="quiz-panel">
          {phase === "setup" && (
            <form className="quiz-setup" onSubmit={startQuiz}>
              <div className="quiz-heading">
                <p className="eyebrow">Practice from your material</p>
                <h1>Set up a quiz</h1>
                <p>Choose what to practice. You can adjust the scope anytime.</p>
              </div>

              <fieldset className="quiz-fieldset">
                <legend>Question scope</legend>
                <div className="quiz-choice-row">
                  {[
                    ["all", "All material"],
                    ["sources", "Specific sources"],
                    ["topics", "Specific topics"],
                  ].map(([id, label]) => (
                    <label className="quiz-radio-option" key={id}>
                      <input
                        type="radio"
                        name="scope"
                        value={id}
                        checked={scope === id}
                        onChange={() => setScope(id)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {scope === "sources" && (
                <fieldset className="quiz-fieldset">
                  <legend>Select sources</legend>
                  <div className="quiz-check-list">
                    {sources
                      .filter((source) => source.status === "ready")
                      .map((source) => (
                        <label
                          className="quiz-check-option"
                          key={source.file_id}
                        >
                          <input
                            type="checkbox"
                            checked={sourceIds.includes(source.file_id)}
                            onChange={() =>
                              toggleValue(source.file_id, sourceIds, setSourceIds)
                            }
                          />
                          <span>{source.name}</span>
                        </label>
                      ))}
                  </div>
                </fieldset>
              )}

              {scope === "topics" && (
                <fieldset className="quiz-fieldset">
                  <legend>Select topics</legend>
                  <div className="quiz-check-list topics">
                    {topics.map((topic) => (
                      <label className="quiz-check-option" key={topic}>
                        <input
                          type="checkbox"
                          checked={selectedTopics.includes(topic)}
                          onChange={() =>
                            toggleValue(topic, selectedTopics, setSelectedTopics)
                          }
                        />
                        <span>{topic}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              <fieldset className="quiz-fieldset">
                <legend>Question types</legend>
                <div className="quiz-choice-row">
                  {questionTypes.map((type) => (
                    <label className="quiz-check-option" key={type.id}>
                      <input
                        type="checkbox"
                        checked={types.includes(type.id)}
                        onChange={() => toggleValue(type.id, types, setTypes)}
                      />
                      <span>{type.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="quiz-settings-row">
                <label className="quiz-field">
                  <span>Number of questions</span>
                  <input
                    type="number"
                    min="3"
                    max="15"
                    step="1"
                    value={count}
                    onChange={(event) => setCount(event.target.value)}
                  />
                </label>
                <label className="quiz-field">
                  <span>Difficulty</span>
                  <select
                    value={difficulty}
                    onChange={(event) => setDifficulty(event.target.value)}
                  >
                    {difficulties.map((item) => (
                      <option key={item} value={item}>
                        {item[0].toUpperCase() + item.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <button className="quiz-primary-button" type="submit" disabled={loading}>
                {loading ? "Preparing quiz..." : "Start quiz"}
                {!loading && <ArrowRight size={16} />}
              </button>
            </form>
          )}

          {phase === "taking" && activeQuestion && (
            <div className="quiz-taking">
              <div className="quiz-progress-header">
                <button
                  className="quiz-back-button"
                  type="button"
                  onClick={() => setPhase("setup")}
                  disabled={loading || diagnostic}
                >
                  <ArrowLeft size={15} aria-hidden="true" />
                  {diagnostic ? "Starter quiz" : "Quiz setup"}
                </button>
                <span>
                  Question {questionIndex + 1} of {questions.length}
                </span>
              </div>
              <div
                className="quiz-progress-track"
                role="progressbar"
                aria-label="Quiz progress"
                aria-valuemin="0"
                aria-valuemax={questions.length}
                aria-valuenow={questionIndex + (answerResult ? 1 : 0)}
              >
                <div
                  className="quiz-progress-value"
                  style={{
                    width: `${((questionIndex + (answerResult ? 1 : 0)) / questions.length) * 100}%`,
                  }}
                />
              </div>

              <div className="quiz-tags">
                <span>{activeQuestion.topic}</span>
                <span>{activeQuestion.difficulty}</span>
                <CitationButton
                  citation={activeQuestion.source}
                  onOpen={setActiveCitation}
                />
              </div>

              <form className="question-form" onSubmit={submitAnswer}>
                <h1>{activeQuestion.question}</h1>

                {activeQuestion.type === "mcq" && (
                  <div className="quiz-options" role="group" aria-label="Answer options">
                    {activeQuestion.options.map((option, index) => (
                      <button
                        className={`quiz-option${answer === index ? " selected" : ""}`}
                        type="button"
                        key={`${activeQuestion.id}-${option}`}
                        disabled={Boolean(answerResult)}
                        onClick={() => setAnswer(index)}
                      >
                        <span className="option-letter">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span>{option}</span>
                      </button>
                    ))}
                  </div>
                )}

                {activeQuestion.type === "short" && (
                  <label className="quiz-field answer-field">
                    <span>Your answer</span>
                    <textarea
                      rows="3"
                      value={answer ?? ""}
                      disabled={Boolean(answerResult)}
                      onChange={(event) => setAnswer(event.target.value)}
                    />
                  </label>
                )}

                {activeQuestion.type === "numerical" && (
                  <label className="quiz-field answer-field">
                    <span>Your answer</span>
                    <input
                      type="number"
                      step="any"
                      value={answer ?? ""}
                      disabled={Boolean(answerResult)}
                      onChange={(event) => setAnswer(event.target.value)}
                    />
                  </label>
                )}

                <AnimatePresence>
                  {answerResult && (
                    <motion.section
                      key={`${activeQuestion.id}-feedback`}
                      className={`quiz-feedback ${answerResult.correct ? "correct" : "wrong"}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={
                        answerResult.correct || reduceMotion !== false
                          ? { opacity: 1, y: 0 }
                          : {
                              opacity: 1,
                              y: 0,
                              x: [0, -5, 5, -4, 4, 0],
                            }
                      }
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: reduceMotion === false ? 0.2 : 0 }}
                    >
                      <div className="feedback-heading">
                        <span className="feedback-icon" aria-hidden="true">
                          {answerResult.correct ? <Check size={15} /> : "!"}
                        </span>
                        <strong>
                          {answerResult.correct ? "Correct" : "Not quite"}
                        </strong>
                      </div>
                      <p>{answerResult.feedback}</p>
                      {answerResult.correct_answer && (
                        <p>
                          <strong>Answer:</strong> {answerResult.correct_answer}
                        </p>
                      )}
                      {answerResult.misconception && (
                        <p>
                          <strong>Likely misconception:</strong>{" "}
                          {answerResult.misconception}
                        </p>
                      )}
                      {answerResult.citation && (
                        <CitationButton
                          citation={answerResult.citation}
                          onOpen={setActiveCitation}
                        />
                      )}
                    </motion.section>
                  )}
                </AnimatePresence>

                {!answerResult ? (
                  <button
                    className="quiz-primary-button"
                    type="submit"
                    disabled={loading || answer === null || String(answer).trim() === ""}
                  >
                    {loading ? "Checking answer..." : "Submit answer"}
                  </button>
                ) : (
                  <button
                    className="quiz-primary-button"
                    type="button"
                    onClick={nextQuestion}
                  >
                    {questionIndex + 1 === questions.length
                      ? "See results"
                      : "Next question"}
                    <ArrowRight size={16} />
                  </button>
                )}
              </form>
            </div>
          )}

          {phase === "results" && (
            <div className="quiz-results">
              {reduceMotion === false && score >= 80 && (
                <Confetti
                  className="quiz-confetti"
                  width={window.innerWidth}
                  height={window.innerHeight}
                  numberOfPieces={160}
                  recycle={false}
                />
              )}
              <p className="eyebrow">Quiz complete</p>
              <h1>Your results</h1>
              <p className="quiz-score">
                {correctCount} of {answerHistory.length} correct
                <strong>{score}%</strong>
              </p>

              <section className="result-section">
                <h2>By topic</h2>
                <div className="topic-results">
                  {Object.entries(topicBreakdown).map(([topic, result]) => (
                    <div className="topic-result-row" key={topic}>
                      <span>{topic}</span>
                      <span className="topic-counts">
                        <span>{result.correct} correct</span>
                        <span>{result.wrong} wrong</span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="result-section">
                <h2>Weak topics</h2>
                {weakTopics.length ? (
                  <div className="result-chips">
                    {weakTopics.map((topic) => (
                      <span className="result-chip weak" key={topic}>
                        {topic}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="result-empty">No weak topics from this quiz.</p>
                )}
              </section>

              {misconceptions.length > 0 && (
                <section className="result-section">
                  <h2>Likely misconceptions</h2>
                  <ul className="misconception-list">
                    {misconceptions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="quiz-result-actions">
                {weakTopics.length > 0 && (
                  <button
                    className="quiz-secondary-button"
                    type="button"
                    disabled={loading}
                    onClick={retryWeakTopics}
                  >
                    <RotateCcw size={15} aria-hidden="true" />
                    Retry weak topics
                  </button>
                )}
                <button
                  className="quiz-primary-button"
                  type="button"
                  onClick={onDashboard}
                >
                  Go to dashboard <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
