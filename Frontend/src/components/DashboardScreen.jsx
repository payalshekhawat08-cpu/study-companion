import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  BookOpen,
  ChartNoAxesColumnIncreasing,
  Library,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import FunnyNote from "@/components/FunnyNote.jsx";
import Mascot from "@/components/Mascot.jsx";
import CourseMap from "@/components/CourseMap.jsx";
import { buildLocalProgress } from "@/lib/localProgress.js";

export default function DashboardScreen({
  name,
  mastery,
  dataSource,
  dataNotice,
  localAnswers,
  library,
  loading,
  lastScreen,
  onNavigate,
  onPracticeTopic,
  onAddMaterial,
  onStartDiagnostic,
  onResetLocalProgress,
  progressView = false,
  mascotsEnabled = true,
}) {
  const [courseMapOpen, setCourseMapOpen] = useState(false);
  const localSource = dataSource !== "server";
  const localProgress = useMemo(
    () => (localSource ? buildLocalProgress(localAnswers) : null),
    [localAnswers, localSource],
  );
  const readySources = library.filter((source) => source.status === "ready");
  const sourceTopics = localSource ? localProgress.topics : mastery?.topics || [];
  const chartTopics = sourceTopics
    .map((topic) => ({
      ...topic,
      masteryPercent: Math.round(topic.mastery * 100),
    }))
    .sort((left, right) => left.mastery - right.mastery);
  const weakTopics = localSource ? localProgress.weak : mastery?.weak || [];
  const sessions = localSource ? localProgress.sessions : [];
  const hasHistoryChart = sessions.length >= 2;
  const continueTarget = ["library", "chat", "quiz"].includes(lastScreen)
    ? lastScreen
    : null;
  const continueLabels = {
    library: "Library",
    chat: "Chat",
    quiz: "Quiz",
  };

  useEffect(() => {
    if (!progressView) setCourseMapOpen(false);
  }, [progressView]);

  if (progressView && courseMapOpen) {
    return (
      <CourseMap
        onBack={() => setCourseMapOpen(false)}
        onPracticeTopic={onPracticeTopic}
        mascotsEnabled={mascotsEnabled}
      />
    );
  }

  function resetProgress() {
    if (
      window.confirm(
        "Reset quiz answers saved on this device? Server progress will not be changed.",
      )
    ) {
      onResetLocalProgress();
    }
  }

  const masteryDescription = chartTopics
    .map(
      (topic) =>
        `${topic.name}: ${topic.masteryPercent}%${
          localSource
            ? `, ${topic.attempts} attempts${topic.earlyEstimate ? ", early estimate" : ""}`
            : ""
        }`,
    )
    .join("; ");

  return (
    <section className="dashboard-screen" aria-labelledby="dashboard-title">
      <header className="dashboard-heading">
        <div className="dashboard-heading-copy">
          <p className="eyebrow">{progressView ? "Your learning" : "Dashboard"}</p>
          <h1 id="dashboard-title">
            {progressView
              ? "Your progress"
              : `Good to see you${name ? `, ${name}` : ""}.`}
          </h1>
          {!progressView && (
            <p className="dashboard-intro">
              Keep building your understanding, one session at a time.
            </p>
          )}
          <p className="dashboard-source">
            {localSource
              ? "From your quiz answers on this device"
              : "Live from server"}
          </p>
          {dataNotice && (
            <p className="dashboard-notice" role="status">
              {dataNotice}
            </p>
          )}
        </div>
        <div className="dashboard-heading-actions">
          {progressView && (
            <button
              className="course-map-open"
              type="button"
              onClick={() => setCourseMapOpen(true)}
            >
              Course map
            </button>
          )}
          <button
            className="course-map-open reset-progress-button"
            type="button"
            onClick={resetProgress}
            disabled={!localAnswers.length}
          >
            Reset local progress
          </button>
        </div>
      </header>

      {!loading && chartTopics.length === 0 && (
        <div className="dashboard-empty-state">
          <p>
            Take the starter quiz to see your progress. Your quiz answers will be
            saved on this device.
          </p>
          <Button onClick={onStartDiagnostic}>
            Take the starter quiz <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
      )}

      <div className="dashboard-grid">
        <section className="dashboard-card continue-card">
          <div className="dashboard-card-heading">
            <div className="dashboard-card-icon" aria-hidden="true">
              <ArrowRight size={17} />
            </div>
            <div>
              <h2>Continue learning</h2>
              <p>
                {continueTarget
                  ? `Pick up where you left off in ${continueLabels[continueTarget]}.`
                  : "Choose a place to begin your next study session."}
              </p>
            </div>
          </div>
          <button
            className="dashboard-action"
            type="button"
            onClick={() => onNavigate(continueTarget || "library")}
          >
            {continueTarget
              ? `Continue to ${continueLabels[continueTarget]}`
              : "Browse your library"}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </section>

        <section className="dashboard-card material-card">
          <div className="dashboard-card-heading">
            <div className="dashboard-card-icon" aria-hidden="true">
              <Library size={17} />
            </div>
            <div>
              <h2>Your material</h2>
              <p>
                {loading
                  ? "Loading your sources..."
                  : readySources.length
                    ? `${readySources.length} ready source${readySources.length === 1 ? "" : "s"}`
                    : "No ready sources yet."}
              </p>
            </div>
          </div>
          {!loading && readySources.length === 0 && (
            <p className="dashboard-empty">
              Add course material to start asking questions and practicing.
            </p>
          )}
          <button
            className="dashboard-action"
            type="button"
            onClick={onAddMaterial}
          >
            Add material <ArrowRight size={15} aria-hidden="true" />
          </button>
        </section>

        <section className="dashboard-card chart-card">
          <div className="dashboard-section-heading">
            <div className="dashboard-card-icon" aria-hidden="true">
              <ChartNoAxesColumnIncreasing size={17} />
            </div>
            <div>
              <h2>Mastery by topic</h2>
              <p>Your current understanding by topic.</p>
            </div>
          </div>
          {loading ? (
            <p className="dashboard-empty">Loading topic mastery...</p>
          ) : chartTopics.length ? (
            <>
              <div
                className="chart-wrap mastery-chart"
                role="img"
                aria-label={`Mastery by topic: ${masteryDescription}`}
              >
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(180, chartTopics.length * 44)}
                >
                  <BarChart
                    data={chartTopics}
                    layout="vertical"
                    margin={{ top: 8, right: 12, bottom: 4, left: 2 }}
                  >
                    <CartesianGrid
                      horizontal={false}
                      stroke="var(--border)"
                      strokeDasharray="3 3"
                    />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tickFormatter={(value) => `${value}%`}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                      axisLine={{ stroke: "var(--border)" }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={72}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value) => [`${value}%`, "Mastery"]}
                      contentStyle={{
                        background: "var(--raised)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--foreground)",
                        fontSize: 11,
                      }}
                    />
                    <Bar
                      dataKey="masteryPercent"
                      fill="var(--primary)"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={22}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {localSource && (
                <ul className="mastery-attempt-list">
                  {chartTopics.map((topic) => (
                    <li key={topic.name}>
                      <span>{topic.name}</span>
                      <span>
                        {topic.attempts}{" "}
                        {topic.attempts === 1 ? "attempt" : "attempts"}
                        {topic.earlyEstimate ? " · early estimate" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="dashboard-empty">
              Take the starter quiz to see your progress.
            </p>
          )}
        </section>

        <section className="dashboard-card weak-card">
          <div className="dashboard-section-heading">
            <div className="dashboard-card-icon" aria-hidden="true">
              <BookOpen size={17} />
            </div>
            <div>
              <h2>Weak topics</h2>
              <p>Practice can help strengthen these areas.</p>
            </div>
          </div>
          {loading ? (
            <p className="dashboard-empty">Loading weak topics...</p>
          ) : weakTopics.length ? (
            <ul className="weak-topic-list">
              {weakTopics.map((topic) => (
                <li key={topic}>
                  <span>{topic}</span>
                  <button
                    type="button"
                    onClick={() => onPracticeTopic(topic)}
                    aria-label={`Practice ${topic}`}
                  >
                    Practice <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dashboard-empty">
              {chartTopics.length
                ? "No weak topics to practice right now."
                : "Take the starter quiz to see which topics to practice."}
            </p>
          )}
        </section>

        <section className="dashboard-card history-card">
          <div className="dashboard-section-heading">
            <div className="dashboard-card-icon" aria-hidden="true">
              <ChartNoAxesColumnIncreasing size={17} />
            </div>
            <div>
              <h2>Progress over sessions</h2>
              <p>Quiz accuracy for each session.</p>
            </div>
          </div>
          {loading ? (
            <p className="dashboard-empty">Loading your progress history...</p>
          ) : hasHistoryChart ? (
            <div
              className="chart-wrap history-chart"
              role="img"
              aria-label={`Quiz accuracy over sessions: ${sessions
                .map((session) => `${session.name} ${session.accuracy}%`)
                .join(", ")}`}
            >
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={sessions}
                  margin={{ top: 12, right: 12, bottom: 4, left: 0 }}
                >
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    labelFormatter={(label, payload) =>
                      payload?.[0]?.payload?.date || label
                    }
                    formatter={(value) => [`${value}%`, "Accuracy"]}
                    contentStyle={{
                      background: "var(--raised)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--foreground)",
                      fontSize: 11,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={{ fill: "var(--primary)", r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="dashboard-empty progress-empty">
              <div className="progress-empty-copy">
                <p>
                  {localSource
                    ? "Progress appears after at least two quiz sessions."
                    : "Session accuracy is not part of live mastery data. Quiz session accuracy is available from this device when using local progress."}
                </p>
                <FunnyNote context="progressEmpty" enabled={mascotsEnabled} />
              </div>
              {progressView && mascotsEnabled && (
                <Mascot name="star" mood="thinking" size="sm" />
              )}
            </div>
          )}
        </section>

        <section className="dashboard-card recent-card">
          <div className="dashboard-section-heading">
            <div className="dashboard-card-icon" aria-hidden="true">
              <ChartNoAxesColumnIncreasing size={17} />
            </div>
            <div>
              <h2>Last 7 days</h2>
              <p>Quiz answers per day.</p>
            </div>
          </div>
          {loading ? (
            <p className="dashboard-empty">Loading recent answers...</p>
          ) : !localSource ? (
            <p className="dashboard-empty">
              Daily answer counts are not included in live mastery data.
            </p>
          ) : localProgress.hasRecentAnswers ? (
            <div
              className="chart-wrap recent-chart"
              role="img"
              aria-label={`Quiz answers in the last seven days: ${localProgress.last7Days
                .map((day) => `${day.date}: ${day.answers}`)
                .join(", ")}`}
            >
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={localProgress.last7Days}
                  margin={{ top: 8, right: 4, bottom: 4, left: -18 }}
                >
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(date) => date.slice(5)}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => [value, "Answers"]}
                    contentStyle={{
                      background: "var(--raised)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--foreground)",
                      fontSize: 11,
                    }}
                  />
                  <Bar
                    dataKey="answers"
                    fill="var(--primary)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={24}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="dashboard-empty">
              Quiz answer activity from the last seven days will appear here.
            </p>
          )}
        </section>

        <section className="dashboard-card difficulty-card">
          <div className="dashboard-section-heading">
            <div className="dashboard-card-icon" aria-hidden="true">
              <ChartNoAxesColumnIncreasing size={17} />
            </div>
            <div>
              <h2>Accuracy by difficulty</h2>
              <p>Correct answers by question level.</p>
            </div>
          </div>
          {loading ? (
            <p className="dashboard-empty">Loading difficulty accuracy...</p>
          ) : !localSource ? (
            <p className="dashboard-empty">
              Difficulty accuracy is not included in live mastery data.
            </p>
          ) : localProgress.accuracyByDifficulty.length ? (
            <div className="difficulty-figures">
              {localProgress.accuracyByDifficulty.map((level) => (
                <div className="difficulty-figure" key={level.difficulty}>
                  <strong>{level.accuracy}%</strong>
                  <span>{level.difficulty}</span>
                  <small>
                    {level.attempts}{" "}
                    {level.attempts === 1 ? "answer" : "answers"}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <p className="dashboard-empty">
              Difficulty accuracy will appear after quiz answers are recorded.
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
