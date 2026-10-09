import {
  mockAsk,
  mockGetLibrary,
  mockGetFile,
  mockGetMastery,
  mockGetQuiz,
  mockGetTopics,
  mockSubmitQuizAnswer,
  mockUpload,
} from "./mock/data.js";

const useMock = import.meta.env.VITE_USE_MOCK !== "false";
const apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const studentIdKey = "study-companion-student-id";

function getStudentId() {
  let studentId = localStorage.getItem(studentIdKey);
  if (!studentId) {
    studentId = crypto.randomUUID();
    localStorage.setItem(studentIdKey, studentId);
  }
  return studentId;
}

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        "X-Student-Id": getStudentId(),
        ...options.headers,
      },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Can't reach the study server. Is it running?");
    }
    throw error;
  }

  if (response.status === 429) {
    throw new Error("The AI is busy. Please wait a moment and try again.");
  }

  if (!response.ok) {
    const errorText = await response.text();
    if (/quota/i.test(errorText)) {
      throw new Error("The AI is busy. Please wait a moment and try again.");
    }
    throw new Error("Something went wrong. Please try again.");
  }

  return response;
}

async function requestJson(path, options) {
  const response = await request(path, options);
  return response.json();
}

export function getLibrary() {
  return useMock
    ? mockGetLibrary()
    : requestJson("/library");
}

export function uploadFile(file) {
  if (useMock) {
    const extension = file.name.split(".").pop().toLowerCase();
    const source_type =
      extension === "pptx"
        ? "slide"
        : ["mp4", "mkv", "webm", "mov"].includes(extension)
          ? "video"
          : "pdf";
    return mockUpload({ name: file.name, source_type });
  }
  const formData = new FormData();
  formData.append("file", file);
  return requestJson("/upload", { method: "POST", body: formData });
}

export function addYoutubeVideo(youtubeUrl) {
  if (useMock) {
    return mockUpload({
      name: youtubeUrl,
      source_type: "video",
      video_url: youtubeUrl,
    });
  }
  return requestJson("/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ youtube_url: youtubeUrl }),
  });
}

export function getFile(fileId) {
  if (useMock) return mockGetFile(fileId);
  return request(`/files/${encodeURIComponent(fileId)}`).then((response) =>
    response.blob(),
  );
}

export function askQuestion(question, sourceIds = []) {
  if (useMock) return mockAsk(question);
  return requestJson("/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, source_ids: sourceIds }),
  });
}

export function getQuiz({
  topics = [],
  sourceIds = [],
  types = ["mcq", "short", "numerical"],
  count = 5,
  difficulty = "mixed",
  diagnostic = false,
} = {}) {
  if (useMock) {
    return mockGetQuiz({ topics, sourceIds, types, count, difficulty });
  }
  return requestJson("/quiz", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topics,
      source_ids: sourceIds,
      types,
      count,
      difficulty,
      diagnostic,
    }),
  });
}

export function submitQuizAnswer(questionId, answer) {
  if (useMock) {
    return mockSubmitQuizAnswer({ question_id: questionId, answer });
  }
  return requestJson("/quiz/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question_id: questionId, answer }),
  });
}

export function getMastery() {
  return useMock ? mockGetMastery() : requestJson("/mastery");
}

export function getTopics() {
  return useMock ? mockGetTopics() : requestJson("/topics");
}
