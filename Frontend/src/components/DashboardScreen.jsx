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
  Flame,
  Library,
} from "lucide-react";

export default function DashboardScreen({
  name,
  mastery,
  library,
  loading,
  lastScreen,
  onNavigate,
  onPracticeTopic,
  onAddMaterial,
  progressView = false,
}) {
  const readySources = library.filter((source) => source.status === "ready");
  const chartTopics = [...(mastery?.topics || [])]
    .map((topic) => ({ ...topic, masteryPercent: Math.round(topic.mastery * 100) }))
    .sort((left, right) => left.mastery - right.mastery);
  const history = mastery?.history || [];
  const hasHistoryChart = history.length >= 2;
  const continueTarget = ["library", "chat", "quiz"].includes(lastScreen)
    ? lastScreen
    : null;
  const continueLabels = {
    library: "Library",
    chat: "Chat",
    quiz: "Quiz",
  };

  return (
    <section className="dashboard-screen" aria-labelledby="dashboard-title">
      <header className="dashboard-heading">
        <div>
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
        </div>
        {typeof mastery?.streak_days !== "undefined" && (
          <div className="streak-indicator">
            <Flame size={16} aria-hidden="true" />
            <span>{mastery.streak_days} day streak</span>
          </div>
        )}
      </header>

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
            {continueTarget ? `Continue to ${continueLabels[continueTarget]}` : "Browse your library"}
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
            <div className="chart-wrap mastery-chart">
              <ResponsiveContainer width="100%" height={Math.max(180, chartTopics.length * 44)}>
                <BarChart
                  data={chartTopics}
                  layout="vertical"
                  margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
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
                    width={82}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
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
                    cursor={{ fill: "rgb(232 234 237 / 4%)" }}
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
          ) : mastery?.weak?.length ? (
            <ul className="weak-topic-list">
              {mastery.weak.map((topic) => (
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
              {mastery?.topics?.length
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
              <p>Mastery changes across your study sessions.</p>
            </div>
          </div>
          {loading ? (
            <p className="dashboard-empty">Loading your progress history...</p>
          ) : hasHistoryChart ? (
            <div className="chart-wrap history-chart">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={history.map((point) => ({
                    ...point,
                    masteryPercent: Math.round(point.mastery * 100),
                  }))}
                  margin={{ top: 12, right: 18, bottom: 4, left: 0 }}
                >
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
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
                    formatter={(value) => [`${value}%`, "Mastery"]}
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
                    dataKey="masteryPercent"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={{ fill: "var(--primary)", r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="dashboard-empty">
              Progress over sessions will appear after at least two study sessions.
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
