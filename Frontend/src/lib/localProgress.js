const studentIdKey = "study-companion-student-id";
const progressKeyPrefix = "study-companion-local-progress:";
const answerLimit = 500;
const difficulties = ["easy", "medium", "hard"];

function getStudentId() {
  try {
    let studentId = localStorage.getItem(studentIdKey);
    if (!studentId) {
      studentId = crypto.randomUUID();
      localStorage.setItem(studentIdKey, studentId);
    }
    return studentId;
  } catch (error) {
    console.error("Unable to access the student id for local progress.", error);
    return null;
  }
}

function isAnswerRecord(value) {
  return (
    value &&
    typeof value.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.date) &&
    typeof value.sessionId === "string" &&
    typeof value.topic === "string" &&
    typeof value.difficulty === "string" &&
    typeof value.source_file === "string" &&
    typeof value.correct === "boolean"
  );
}

export function getLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLocalAnswers() {
  const studentId = getStudentId();
  if (!studentId) return [];

  try {
    const stored = localStorage.getItem(`${progressKeyPrefix}${studentId}`);
    if (!stored) return [];
    const answers = JSON.parse(stored);
    if (!Array.isArray(answers)) {
      console.warn("Local quiz progress is not an answer list; ignoring it.");
      return [];
    }
    return answers.filter(isAnswerRecord).slice(-answerLimit);
  } catch (error) {
    console.error("Unable to read local quiz progress.", error);
    return [];
  }
}

function writeLocalAnswers(studentId, answers) {
  try {
    localStorage.setItem(
      `${progressKeyPrefix}${studentId}`,
      JSON.stringify(answers.slice(-answerLimit)),
    );
  } catch (error) {
    console.error("Unable to save local quiz progress.", error);
  }
}

export function recordLocalAnswer(answer) {
  if (!isAnswerRecord(answer)) return getLocalAnswers();
  const studentId = getStudentId();
  if (!studentId) return [];
  const answers = getLocalAnswers();
  const nextAnswers = [...answers, answer].slice(-answerLimit);
  writeLocalAnswers(studentId, nextAnswers);
  return nextAnswers;
}

export function clearLocalAnswers() {
  const studentId = getStudentId();
  if (!studentId) return [];
  try {
    localStorage.removeItem(`${progressKeyPrefix}${studentId}`);
  } catch (error) {
    console.error("Unable to clear local quiz progress.", error);
  }
  return [];
}

export function buildLocalProgress(answers) {
  const topicAttempts = new Map();
  const sessionAttempts = new Map();
  const difficultyAttempts = new Map();
  const answersByDate = new Map();

  for (const answer of answers.filter(isAnswerRecord)) {
    const topic = topicAttempts.get(answer.topic) || { correct: 0, attempts: 0 };
    topic.attempts += 1;
    if (answer.correct) topic.correct += 1;
    topicAttempts.set(answer.topic, topic);

    const session = sessionAttempts.get(answer.sessionId) || {
      date: answer.date,
      correct: 0,
      attempts: 0,
    };
    session.attempts += 1;
    if (answer.correct) session.correct += 1;
    sessionAttempts.set(answer.sessionId, session);

    if (difficulties.includes(answer.difficulty)) {
      const level = difficultyAttempts.get(answer.difficulty) || {
        correct: 0,
        attempts: 0,
      };
      level.attempts += 1;
      if (answer.correct) level.correct += 1;
      difficultyAttempts.set(answer.difficulty, level);
    }

    const dayCount = answersByDate.get(answer.date) || 0;
    answersByDate.set(answer.date, dayCount + 1);
  }

  const topics = [...topicAttempts.entries()]
    .map(([name, result]) => ({
      name,
      attempts: result.attempts,
      mastery: (result.correct + 1) / (result.attempts + 2),
      earlyEstimate: result.attempts < 3,
    }))
    .sort((left, right) => left.mastery - right.mastery);

  const sessions = [...sessionAttempts.entries()].map(([sessionId, result], index) => ({
    sessionId,
    date: result.date,
    name: `Session ${index + 1}`,
    accuracy: Math.round((result.correct / result.attempts) * 100),
  }));

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const last7Days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const key = getLocalDate(date);
    return { date: key, answers: answersByDate.get(key) || 0 };
  });

  const accuracyByDifficulty = difficulties
    .filter((difficulty) => difficultyAttempts.has(difficulty))
    .map((difficulty) => {
      const result = difficultyAttempts.get(difficulty);
      return {
        difficulty,
        attempts: result.attempts,
        accuracy: Math.round((result.correct / result.attempts) * 100),
      };
    });

  return {
    topics,
    weak: topics
      .filter((topic) => topic.mastery < 0.5 && topic.attempts >= 2)
      .map((topic) => topic.name),
    sessions,
    last7Days,
    hasRecentAnswers: last7Days.some((day) => day.answers > 0),
    accuracyByDifficulty,
  };
}
