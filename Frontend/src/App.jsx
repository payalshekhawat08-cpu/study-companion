import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ChartNoAxesColumnIncreasing,
  House,
  Library,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getLibrary, getMastery, getQuiz } from "@/api";
import ChatScreen from "@/components/ChatScreen.jsx";

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

function getSavedValue(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch (error) {
    console.error(`Unable to read ${key} from local storage.`, error);
    return "";
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
}) {
  const [firstName, setFirstName] = useState("");
  const [goal, setGoal] = useState(goals[0].id);

  if (name) {
    return (
      <main className="welcome-page">
        <section className="welcome-panel" aria-labelledby="welcome-title">
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
  quizSourceIds,
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
      next: quizSourceIds.length
        ? `Quiz setup will use ${quizSourceIds.length} selected source${quizSourceIds.length === 1 ? "" : "s"}. Quiz setup and answering arrive in Phase 4.`
        : "Quiz setup and answering arrive in Phase 4.",
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
  const [loading, setLoading] = useState(true);
  const [startingDiagnostic, setStartingDiagnostic] = useState(false);
  const [quizSourceIds, setQuizSourceIds] = useState([]);

  useEffect(() => {
    let active = true;
    Promise.all([getLibrary(), getMastery()])
      .then(([sources, progress]) => {
        if (!active) return;
        setLibrary(sources);
        setMastery(progress);
      })
      .catch((error) => {
        if (active) {
          toast.error(error.message || "Could not load your study data.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
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
    mastery?.has_history ?? (mastery ? mastery.topics.length > 0 : false);

  function navigate(nextScreen) {
    setScreen(nextScreen);
  }

  function openQuizWithSources(sourceIds) {
    setQuizSourceIds(sourceIds);
    navigate("quiz");
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
      navigate("quiz");
      toast.success(`Starter quiz ready: ${questions.length} questions.`);
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
        </header>
        <main className="page-content">
          {screen === "chat" ? (
            <ChatScreen
              sources={library}
              onBrowseLibrary={() => navigate("library")}
              onQuizSources={openQuizWithSources}
            />
          ) : (
            <PlaceholderScreen
              screen={screen}
              name={name}
              goal={goal}
              quizSourceIds={quizSourceIds}
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
