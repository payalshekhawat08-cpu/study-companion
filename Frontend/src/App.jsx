import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ChartNoAxesColumnIncreasing,
  Flame,
  House,
  Library,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getLibrary, getMastery, getQuiz } from "@/api";
import FunnyNote from "@/components/FunnyNote.jsx";
import Mascot from "@/components/Mascot.jsx";
import { pickNote } from "@/lib/funnyNotes.js";
import {
  getLocalDate,
  getStreakStatus,
  readStreak,
  recordStudyActivity,
  writeStreak,
} from "@/lib/streak.js";
import {
  clearLocalAnswers,
  getLocalAnswers,
} from "@/lib/localProgress.js";
import ChatScreen from "@/components/ChatScreen.jsx";
import QuizScreen from "@/components/QuizScreen.jsx";
import DashboardScreen from "@/components/DashboardScreen.jsx";
import LibraryScreen from "@/components/LibraryScreen.jsx";

const navigation = [
  { id: "home", label: "Home", icon: House },
  { id: "library", label: "Library", icon: Library },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "quiz", label: "Quiz", icon: BookOpen },
  { id: "progress", label: "Progress", icon: ChartNoAxesColumnIncreasing },
];

const goals = [
  { id: "exam", label: "Prepare for an exam" },
  { id: "topic", label: "Learn a topic" },
  { id: "homework", label: "Get homework help" },
];

const nameKey = "study-companion-name";
const goalKey = "study-companion-goal";
const lastScreenKey = "study-companion-last-screen";
const continueScreenKey = "study-companion-continue-screen";
const mascotsEnabledKey = "study-companion-mascots-enabled";
const streakMilestones = [3, 7, 14, 30];

function normalizeMastery(progress) {
  if (!Array.isArray(progress?.topics)) return null;
  const topics = progress.topics.filter(
    (topic) =>
      typeof topic?.name === "string" &&
      topic.name.length > 0 &&
      Number.isFinite(topic.mastery) &&
      topic.mastery >= 0 &&
      topic.mastery <= 1,
  );
  if (!topics.length) return null;

  return {
    ...progress,
    topics,
    weak: Array.isArray(progress.weak)
      ? progress.weak.filter((topic) => typeof topic === "string")
      : [],
    history: Array.isArray(progress.history)
      ? progress.history.filter(
          (point) =>
            typeof point?.date === "string" &&
            Number.isFinite(point.mastery) &&
            point.mastery >= 0 &&
            point.mastery <= 1,
        )
      : [],
  };
}

function getSavedValue(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch (error) {
    console.error(`Unable to read ${key} from local storage.`, error);
    return "";
  }
}

function getMascotsEnabled() {
  try {
    return localStorage.getItem(mascotsEnabledKey) !== "false";
  } catch (error) {
    console.error("Unable to read mascot preference from local storage.", error);
    return true;
  }
}

function Welcome({
  name,
  loading,
  hasReadySource,
  hasHistory,
  onSave,
  onStartDiagnostic,
  onContinue,
  startingDiagnostic,
  mascotsEnabled,
}) {
  const [firstName, setFirstName] = useState("");
  const [goal, setGoal] = useState(goals[0].id);

  if (name) {
    return (
      <main className="welcome-page">
        <section className="welcome-panel" aria-labelledby="welcome-title">
          {mascotsEnabled && (
            <div className="welcome-mascot-row">
              <Mascot name="charizard" mood="happy" size="md" />
              <FunnyNote context="welcome" />
            </div>
          )}
          <div className="welcome-mark" aria-hidden="true">
            <Sparkles size={20} />
          </div>
          <p className="eyebrow">A good place to begin</p>
          <h1 id="welcome-title">Welcome, {name}.</h1>
          {!hasReadySource ? (
            <>
              <p className="welcome-copy">
                Add your course material first. Your library is ready when you
                are.
              </p>
              <Button onClick={() => onContinue("library")}>
                Go to Library <ArrowRight size={16} />
              </Button>
            </>
          ) : hasHistory ? (
            <>
              <p className="welcome-copy">
                Your study space is ready. Continue to your dashboard.
              </p>
              <Button onClick={() => onContinue("home")}>
                Go to Home <ArrowRight size={16} />
              </Button>
            </>
          ) : (
            <>
              <p className="welcome-copy">
                Take a short starter quiz to set a baseline for your progress.
              </p>
              <div className="welcome-actions">
                <Button
                  onClick={onStartDiagnostic}
                  disabled={loading || startingDiagnostic}
                >
                  {startingDiagnostic
                    ? "Preparing quiz..."
                    : "Take a 5-question starter quiz"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => onContinue("home")}
                  disabled={loading || startingDiagnostic}
                >
                  Go to Home
                </Button>
              </div>
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="welcome-page">
      <section className="welcome-panel" aria-labelledby="welcome-title">
        {mascotsEnabled && (
          <div className="welcome-mascot-row">
            <Mascot name="charizard" mood="happy" size="md" />
            <FunnyNote context="welcome" />
          </div>
        )}
        <div className="welcome-mark" aria-hidden="true">
          <Sparkles size={20} />
        </div>
        <p className="eyebrow">Your personal study space</p>
        <h1 id="welcome-title">Let’s get started.</h1>
        <p className="welcome-copy">
          A couple of details help us make this space yours.
        </p>

        <form
          className="welcome-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(firstName.trim(), goal);
          }}
        >
          <label className="field-label" htmlFor="first-name">
            What should we call you?
          </label>
          <input
            id="first-name"
            className="text-field"
            autoComplete="given-name"
            maxLength={40}
            required
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            placeholder="Your first name"
          />

          <fieldset className="goal-fieldset">
            <legend className="field-label">What brings you here?</legend>
            <div className="goal-options">
              {goals.map((item) => (
                <label
                  className={`goal-option${goal === item.id ? " selected" : ""}`}
                  key={item.id}
                >
                  <input
                    type="radio"
                    name="goal"
                    value={item.id}
                    checked={goal === item.id}
                    onChange={() => setGoal(item.id)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <Button className="welcome-submit" type="submit" disabled={loading}>
            {loading ? "Loading your study space..." : "Continue"}
            {!loading && <ArrowRight size={16} />}
          </Button>
        </form>
      </section>
    </main>
  );
}

function PlaceholderScreen({
  screen,
  name,
  goal,
  onNavigate,
}) {
  const goalLabels = {
    exam: "prepare for an exam",
    topic: "learn a topic",
    homework: "get homework help",
  };
  const details = {
    home: {
      title: `Good to see you${name ? `, ${name}` : ""}.`,
      description: goalLabels[goal]
        ? `Ready to ${goalLabels[goal]}? Your learning dashboard will take shape here.`
        : "Your learning dashboard will take shape here.",
      next: "Dashboard features arrive in Phase 5.",
    },
    library: {
      title: "Your library",
      description: "Your course materials will live here.",
      next: "Uploading and source status arrive in Phase 3.",
    },
    chat: {
      title: "Study chat",
      description: "Ask questions grounded in your own course material.",
      next: "Chat and source viewing arrive in Phase 2.",
    },
    quiz: {
      title: "Quiz",
      description: "Practice with questions based on your material.",
      next: "Choose material and question types to get started.",
    },
    progress: {
      title: "Your progress",
      description: "See how your understanding grows over time.",
      next: "Mastery and progress charts arrive in Phase 5.",
    },
  };
  const current = details[screen];

  return (
    <section className="screen-placeholder" aria-labelledby="screen-title">
      <p className="eyebrow">Study Companion</p>
      <h1 id="screen-title">{current.title}</h1>
      <p className="welcome-copy">{current.description}</p>
      <div className="placeholder-note">
        <p>{current.next}</p>
      </div>
      {screen === "home" && (
        <Button variant="outline" onClick={() => onNavigate("library")}>
          Add material <ArrowRight size={16} />
        </Button>
      )}
    </section>
  );
}

function StreakControl({
  streak,
  mastery,
  mascotsEnabled,
  onToggleMascots,
}) {
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState(() => getLocalDate());
  const controlRef = useRef(null);
  const triggerRef = useRef(null);
  const localStatus = getStreakStatus(streak, today);
  const current =
    Number.isFinite(mastery?.streak_days)
      ? mastery.streak_days
      : localStatus.current;
  const state = localStatus.studiedToday
    ? "studied"
    : current > 0
      ? "alive"
      : "neutral";
  const longest = Math.max(localStatus.longest, current);

  useEffect(() => {
    let timer;
    function updateAtMidnight() {
      setToday(getLocalDate());
      const now = new Date();
      const midnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
      timer = window.setTimeout(updateAtMidnight, midnight.getTime() - now.getTime());
    }

    const now = new Date();
    const midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );
    timer = window.setTimeout(
      updateAtMidnight,
      midnight.getTime() - now.getTime(),
    );
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      if (!controlRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const statusMessage = localStatus.studiedToday
    ? "You've studied today. Come back tomorrow to keep it going."
    : current > 0
      ? "Study today to keep it going."
      : "Streak broken. Start a new one today.";
  const streakBroken = !localStatus.current && streak.lastDate !== null;

  return (
    <div className="streak-control" ref={controlRef}>
      <button
        ref={triggerRef}
        className={`streak-chip streak-chip-${state}`}
        type="button"
        aria-label={`${current} day streak`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="streak-details"
        onClick={() => setOpen((value) => !value)}
      >
        <Flame size={16} aria-hidden="true" />
        <span className="streak-number" key={current}>
          {current}
        </span>
        <span className="streak-label">day streak</span>
      </button>
      {open && (
        <div
          className="streak-popover"
          id="streak-details"
          role="dialog"
          aria-label="Study streak details"
        >
          <p className="streak-popover-title">Your study streak</p>
          <p>Current streak: {current} {current === 1 ? "day" : "days"}</p>
          <p>Longest streak: {longest} {longest === 1 ? "day" : "days"}</p>
          <div className="streak-status-row">
            <div>
              <p className="streak-status-message">{statusMessage}</p>
              {streakBroken && (
                <FunnyNote context="streakBroken" enabled={mascotsEnabled} />
              )}
            </div>
            {mascotsEnabled && streakBroken && (
              <Mascot name="charizard" mood="sleepy" size="xs" />
            )}
          </div>
          <label className="mascot-toggle">
            <input
              type="checkbox"
              checked={mascotsEnabled}
              onChange={(event) => onToggleMascots(event.target.checked)}
            />
            <span>Mascots and fun notes</span>
          </label>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [name, setName] = useState(() => getSavedValue(nameKey));
  const [goal, setGoal] = useState(() => getSavedValue(goalKey));
  const [screen, setScreen] = useState(() =>
    getSavedValue(nameKey)
      ? getSavedValue(lastScreenKey) || "home"
      : "welcome",
  );
  const [library, setLibrary] = useState([]);
  const [mastery, setMastery] = useState(null);
  const [masterySource, setMasterySource] = useState("local");
  const [masteryNotice, setMasteryNotice] = useState("");
  const [masteryLoading, setMasteryLoading] = useState(true);
  const [localAnswers, setLocalAnswers] = useState(() => getLocalAnswers());
  const [streak, setStreak] = useState(() => readStreak());
  const [mascotsEnabled, setMascotsEnabled] = useState(getMascotsEnabled);
  const [loading, setLoading] = useState(true);
  const [startingDiagnostic, setStartingDiagnostic] = useState(false);
  const [quizSourceIds, setQuizSourceIds] = useState([]);
  const [chatSourceIds, setChatSourceIds] = useState([]);
  const [quizTopics, setQuizTopics] = useState([]);
  const [starterQuiz, setStarterQuiz] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([getLibrary(), getMastery()])
      .then(([libraryResult, masteryResult]) => {
        if (!active) return;
        if (libraryResult.status === "fulfilled") {
          setLibrary(libraryResult.value);
        } else {
          toast.error(
            libraryResult.reason.message || "Could not load your study data.",
          );
        }

        if (masteryResult.status === "fulfilled") {
          const progress = normalizeMastery(masteryResult.value);
          setMastery(progress);
          setMasterySource(progress ? "server" : "local");
          setMasteryNotice(
            progress
              ? ""
              : "No server progress yet. Showing quiz answers saved on this device.",
          );
        } else {
          setMastery(null);
          setMasterySource("local");
          setMasteryNotice(
            "Server progress is unavailable. Showing quiz answers saved on this device.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setMasteryLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (screen !== "welcome" && navigation.some((item) => item.id === screen)) {
      try {
        localStorage.setItem(lastScreenKey, screen);
      } catch (error) {
        console.error("Unable to save the last screen.", error);
      }
    }
  }, [screen]);

  const hasReadySource = library.some((source) => source.status === "ready");
  const hasHistory =
    mastery?.has_history ??
    (mastery ? mastery.topics.length > 0 : localAnswers.length > 0);

  function navigate(nextScreen) {
    if (nextScreen !== "quiz") setStarterQuiz(null);
    if (["library", "chat", "quiz"].includes(nextScreen)) {
      try {
        localStorage.setItem(continueScreenKey, nextScreen);
      } catch (error) {
        console.error("Unable to save the continue-learning destination.", error);
      }
    }
    setScreen(nextScreen);
  }

  function openQuizWithSources(sourceIds) {
    setQuizTopics([]);
    setQuizSourceIds(sourceIds);
    navigate("quiz");
  }

  function openChatWithSource(sourceId) {
    setChatSourceIds([sourceId]);
    navigate("chat");
  }

  function openQuizWithTopic(topic) {
    setQuizSourceIds([]);
    setQuizTopics([topic]);
    navigate("quiz");
  }

  function updateMascotPreference(enabled) {
    setMascotsEnabled(enabled);
    try {
      localStorage.setItem(mascotsEnabledKey, String(enabled));
    } catch (error) {
      console.error("Unable to save mascot preference.", error);
      toast.error("Your mascot preference could not be saved.");
    }
  }

  async function recordStudyDay() {
    const today = getLocalDate();
    const nextStreak = recordStudyActivity(streak, today);
    setStreak(nextStreak);
    writeStreak(nextStreak);

    for (const milestone of streakMilestones) {
      if (streak.current < milestone && nextStreak.current === milestone) {
        toast.success(`${milestone}-day study streak! Keep it going.`, {
          description: mascotsEnabled ? pickNote("streakMilestone") : undefined,
        });
      }
    }

    await refreshMastery();
  }

  async function refreshMastery() {
    try {
      const progress = normalizeMastery(await getMastery());
      setMastery(progress);
      setMasterySource(progress ? "server" : "local");
      setMasteryNotice(
        progress
          ? ""
          : "No server progress yet. Showing quiz answers saved on this device.",
      );
    } catch {
      setMastery(null);
      setMasterySource("local");
      setMasteryNotice(
        "Server progress is unavailable. Showing quiz answers saved on this device.",
      );
    }
  }

  async function returnToDashboard() {
    const libraryResult = await getLibrary().then(
      (sources) => ({ status: "fulfilled", sources }),
      (error) => ({ status: "rejected", error }),
    );
    if (libraryResult.status === "fulfilled") {
      setLibrary(libraryResult.sources);
    } else {
      toast.error(
        libraryResult.error.message || "Could not refresh your study materials.",
      );
    }
    setLocalAnswers(getLocalAnswers());
    await refreshMastery();
    navigate("home");
  }

  function resetLocalProgress() {
    setLocalAnswers(clearLocalAnswers());
  }

  function saveWelcome(firstName, selectedGoal) {
    if (!firstName) return;
    try {
      localStorage.setItem(nameKey, firstName);
      localStorage.setItem(goalKey, selectedGoal);
    } catch (error) {
      console.error("Unable to save your welcome details.", error);
      toast.error("Your details could not be saved. Please try again.");
      return;
    }

    setName(firstName);
    setGoal(selectedGoal);
    if (loading) return;
    if (!hasReadySource) navigate("library");
    else if (hasHistory) navigate("home");
  }

  async function startDiagnostic() {
    setStartingDiagnostic(true);
    try {
      const questions = await getQuiz({
        types: ["mcq"],
        count: 5,
        difficulty: "mixed",
        diagnostic: true,
      });
      if (questions.length !== 5) {
        toast.error("The starter quiz could not load five questions. Please try again.");
        return;
      }
      setStarterQuiz({ questions, diagnostic: true });
      navigate("quiz");
    } catch (error) {
      toast.error(error.message || "Could not prepare the starter quiz.");
    } finally {
      setStartingDiagnostic(false);
    }
  }

  if (screen === "welcome") {
    return (
      <>
        <Toaster theme="dark" position="top-right" />
        <Welcome
          name={name}
          loading={loading}
          hasReadySource={hasReadySource}
          hasHistory={hasHistory}
          onSave={saveWelcome}
          onStartDiagnostic={startDiagnostic}
          onContinue={navigate}
          startingDiagnostic={startingDiagnostic}
          mascotsEnabled={mascotsEnabled}
        />
      </>
    );
  }

  const activeScreen = navigation.find((item) => item.id === screen) || navigation[0];
  const ActiveIcon = activeScreen.icon;

  return (
    <div className="app-layout">
      <Toaster theme="dark" position="top-right" />
      <aside className="sidebar" aria-label="Main navigation">
        <a
          className="brand"
          href="#home"
          onClick={(event) => {
            event.preventDefault();
            navigate("home");
          }}
          aria-label="Study Companion home"
        >
          <span className="brand-mark" aria-hidden="true">
            <BookOpen size={19} />
          </span>
          <span>Study Companion</span>
        </a>
        <p className="nav-label">Workspace</p>
        <nav className="nav-list">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              className={`nav-item${screen === id ? " active" : ""}`}
              key={id}
              type="button"
              aria-current={screen === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <p>Learning, one step at a time.</p>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-title">
            <ActiveIcon size={18} aria-hidden="true" />
            <span>{activeScreen.label}</span>
          </div>
          {name && <span className="profile-name">{name}</span>}
          <StreakControl
            streak={streak}
            mastery={mastery}
            mascotsEnabled={mascotsEnabled}
            onToggleMascots={updateMascotPreference}
          />
        </header>
        <main className="page-content">
          {screen === "home" || screen === "progress" ? (
            <DashboardScreen
              name={name}
              mastery={mastery}
              dataSource={masterySource}
              dataNotice={masteryNotice}
              localAnswers={localAnswers}
              library={library}
              loading={loading || masteryLoading}
              lastScreen={getSavedValue(continueScreenKey)}
              onNavigate={navigate}
              onPracticeTopic={openQuizWithTopic}
              onAddMaterial={() => navigate("library")}
              onStartDiagnostic={startDiagnostic}
              onResetLocalProgress={resetLocalProgress}
              progressView={screen === "progress"}
              mascotsEnabled={mascotsEnabled}
            />
          ) : screen === "chat" ? (
            <ChatScreen
              sources={library}
              initialSourceIds={chatSourceIds}
              onBrowseLibrary={() => navigate("library")}
              onQuizSources={openQuizWithSources}
              onStudyActivity={recordStudyDay}
              mascotsEnabled={mascotsEnabled}
            />
          ) : screen === "library" ? (
            <LibraryScreen
              sources={library}
              loading={loading}
              onSourcesChange={setLibrary}
              onAskAboutSource={openChatWithSource}
              mascotsEnabled={mascotsEnabled}
            />
          ) : screen === "quiz" ? (
            <QuizScreen
              sources={library}
              initialSourceIds={quizSourceIds}
              initialTopics={quizTopics}
              starterQuiz={starterQuiz}
              onDashboard={returnToDashboard}
              onStudyActivity={recordStudyDay}
              onLocalAnswersChange={setLocalAnswers}
              mascotsEnabled={mascotsEnabled}
            />
          ) : (
            <PlaceholderScreen
              screen={screen}
              name={name}
              goal={goal}
              onNavigate={navigate}
            />
          )}
        </main>
      </div>

      <nav className="mobile-navigation" aria-label="Main navigation">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            className={`mobile-nav-item${screen === id ? " active" : ""}`}
            key={id}
            type="button"
            aria-label={label}
            aria-current={screen === id ? "page" : undefined}
            onClick={() => navigate(id)}
          >
            <Icon size={19} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
