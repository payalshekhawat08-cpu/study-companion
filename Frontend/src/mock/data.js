const library = [
  {
    file_id: "f_pdf",
    name: "Data Structures - Course Notes.pdf",
    source_type: "pdf",
    status: "ready",
    topics: ["Stacks", "Queues", "Sorting"],
    video_url: null,
  },
  {
    file_id: "f_slides",
    name: "Sorting Algorithms.pptx",
    source_type: "slide",
    status: "ready",
    topics: ["Sorting", "Queues"],
    video_url: null,
  },
  {
    file_id: "f_video",
    name: "Lecture 1 - Linear Structures.mp4",
    source_type: "video",
    status: "ready",
    topics: ["Stacks", "Queues"],
    video_url: null,
  },
  {
    file_id: "f_processing",
    name: "Trees - lecture.pdf",
    source_type: "pdf",
    status: "processing",
    topics: ["Trees"],
    video_url: null,
  },
];

const questions = [
  {
    id: "q1",
    type: "mcq",
    question: "Which structure is last-in, first-out?",
    options: ["Queue", "Stack", "Tree", "Graph"],
    topic: "Stacks",
    difficulty: "easy",
    source: {
      id: "c1",
      label: "Course Notes p.12",
      file_id: "f_pdf",
      source_file: library[0].name,
      source_type: "pdf",
      location: 12,
      excerpt: "A stack is a last-in, first-out structure.",
    },
  },
  {
    id: "q2",
    type: "short",
    question: "What does LIFO stand for?",
    topic: "Stacks",
    difficulty: "easy",
    source: {
      id: "c2",
      label: "Lecture 1, 14:32",
      file_id: "f_video",
      source_file: library[2].name,
      source_type: "video",
      location: 872,
      excerpt: "The last item pushed is the first item popped.",
    },
  },
  {
    id: "q3",
    type: "numerical",
    question: "How many comparisons does binary search need for 8 items in the worst case?",
    topic: "Sorting",
    difficulty: "medium",
    source: {
      id: "c3",
      label: "Sorting Algorithms, slide 4",
      file_id: "f_slides",
      source_file: library[1].name,
      source_type: "slide",
      location: 4,
      excerpt: "Binary search halves the search range at each step.",
    },
  },
  {
    id: "q4",
    type: "mcq",
    question: "Which structure processes items in first-in, first-out order?",
    options: ["Stack", "Queue", "Heap", "Tree"],
    topic: "Queues",
    difficulty: "easy",
    source: {
      id: "c4",
      label: "Course Notes p.18",
      file_id: "f_pdf",
      source_file: library[0].name,
      source_type: "pdf",
      location: 18,
      excerpt: "A queue removes items in the order they arrive.",
    },
  },
  {
    id: "q5",
    type: "short",
    question: "Name the operation that adds an item to the top of a stack.",
    topic: "Stacks",
    difficulty: "medium",
    source: {
      id: "c5",
      label: "Lecture 1, 15:08",
      file_id: "f_video",
      source_file: library[2].name,
      source_type: "video",
      location: 908,
      excerpt: "Push adds an item to the top of the stack.",
    },
  },
  {
    id: "q6",
    type: "numerical",
    question: "How many items are in a queue after 5 enqueues and 2 dequeues?",
    topic: "Queues",
    difficulty: "medium",
    source: {
      id: "c6",
      label: "Course Notes p.19",
      file_id: "f_pdf",
      source_file: library[0].name,
      source_type: "pdf",
      location: 19,
      excerpt: "Enqueue adds one item and dequeue removes one item.",
    },
  },
  {
    id: "q7",
    type: "mcq",
    question: "Which sorting algorithm repeatedly selects the smallest remaining item?",
    options: ["Merge sort", "Selection sort", "Insertion sort", "Quick sort"],
    topic: "Sorting",
    difficulty: "hard",
    source: {
      id: "c7",
      label: "Sorting Algorithms, slide 7",
      file_id: "f_slides",
      source_file: library[1].name,
      source_type: "slide",
      location: 7,
      excerpt: "Selection sort chooses the smallest item from the unsorted portion.",
    },
  },
  {
    id: "q8",
    type: "short",
    question: "What is the name of the operation that removes the front item of a queue?",
    topic: "Queues",
    difficulty: "hard",
    source: {
      id: "c8",
      label: "Course Notes p.19",
      file_id: "f_pdf",
      source_file: library[0].name,
      source_type: "pdf",
      location: 19,
      excerpt: "Dequeue removes an item from the front of the queue.",
    },
  },
  {
    id: "q9",
    type: "mcq",
    question: "Which operation removes the top item from a stack?",
    options: ["Enqueue", "Dequeue", "Pop", "Peek"],
    topic: "Stacks",
    difficulty: "medium",
    source: {
      id: "c9",
      label: "Course Notes p.13",
      file_id: "f_pdf",
      source_file: library[0].name,
      source_type: "pdf",
      location: 13,
      excerpt: "Pop removes the most recently added item from a stack.",
    },
  },
  {
    id: "q10",
    type: "mcq",
    question: "Which queue operation adds a new item?",
    options: ["Pop", "Push", "Enqueue", "Dequeue"],
    topic: "Queues",
    difficulty: "easy",
    source: {
      id: "c10",
      label: "Course Notes p.18",
      file_id: "f_pdf",
      source_file: library[0].name,
      source_type: "pdf",
      location: 18,
      excerpt: "Enqueue adds an item to the back of the queue.",
    },
  },
];

const answers = {
  q1: { correctAnswer: 1, displayAnswer: "Stack" },
  q2: { correctAnswer: "last in, first out", displayAnswer: "Last in, first out" },
  q3: { correctAnswer: 4, displayAnswer: "4" },
  q4: { correctAnswer: 1, displayAnswer: "Queue" },
  q5: { correctAnswer: "push", displayAnswer: "Push" },
  q6: { correctAnswer: 3, displayAnswer: "3" },
  q7: { correctAnswer: 1, displayAnswer: "Selection sort" },
  q8: { correctAnswer: "dequeue", displayAnswer: "Dequeue" },
  q9: { correctAnswer: 2, displayAnswer: "Pop" },
  q10: { correctAnswer: 2, displayAnswer: "Enqueue" },
};

const mastery = {
  topics: [
    { name: "Stacks", mastery: 0.72 },
    { name: "Queues", mastery: 0.38 },
    { name: "Sorting", mastery: 0.61 },
  ],
  weak: ["Queues"],
  has_history: true,
  history: [
    { date: "2026-10-01", mastery: 0.42 },
    { date: "2026-10-03", mastery: 0.48 },
    { date: "2026-10-06", mastery: 0.53 },
    { date: "2026-10-08", mastery: 0.57 },
  ],
  streak_days: 3,
};

let nextUploadId = 1;

function delay() {
  return new Promise((resolve) =>
    setTimeout(resolve, 400 + Math.floor(Math.random() * 501)),
  );
}

function copy(value) {
  return structuredClone(value);
}

export async function mockGetLibrary() {
  await delay();
  return copy(library);
}

export async function mockUpload({
  name = "Uploaded material",
  source_type = "pdf",
  video_url = null,
} = {}) {
  await delay();
  const file_id = `f_upload_${nextUploadId++}`;
  library.push({
    file_id,
    name,
    source_type,
    status: "processing",
    topics: [],
    video_url,
  });
  return { file_id, status: "processing" };
}

export async function mockGetFile() {
  await delay();
  return null;
}

export async function mockAsk(question, source_ids = []) {
  await delay();
  const text = question.toLowerCase();
  let response;

  if (text.includes("stack")) {
    response = {
      answer:
        "A stack follows last-in, first-out (LIFO): the most recently added item is removed first.",
      grounded: true,
      citations: [
        {
          id: "c1",
          label: "Course Notes p.12",
          file_id: "f_pdf",
          source_file: library[0].name,
          source_type: "pdf",
          location: 12,
          excerpt: "A stack is a last-in, first-out structure.",
        },
        {
          id: "c2",
          label: "Lecture 1, 14:32",
          file_id: "f_video",
          source_file: library[2].name,
          source_type: "video",
          location: 872,
          excerpt: "The last item pushed is the first item popped.",
        },
      ],
    };
  } else if (text.includes("queue")) {
    response = {
      answer:
        "A queue follows first-in, first-out order: items leave in the order they arrive.",
      grounded: true,
      citations: [
        {
          id: "c4",
          label: "Sorting Algorithms, slide 3",
          file_id: "f_slides",
          source_file: library[1].name,
          source_type: "slide",
          location: 3,
          excerpt: "A queue removes items in the order they arrive.",
        },
      ],
    };
  } else {
    response = {
      answer: "This isn't covered in your material.",
      grounded: false,
      citations: [],
    };
  }

  if (source_ids.length === 0) return response;

  const citations = response.citations.filter((citation) =>
    source_ids.includes(citation.file_id),
  );
  if (citations.length === 0) {
    return {
      answer: "This isn't covered in your material.",
      grounded: false,
      citations: [],
    };
  }

  return { ...response, citations };
}

export async function mockGetQuiz({
  topics = [],
  sourceIds = [],
  types = [],
  count = 5,
  difficulty = "mixed",
} = {}) {
  await delay();
  const matchingQuestions = questions.filter(
    (question) =>
      (topics.length === 0 || topics.includes(question.topic)) &&
      (sourceIds.length === 0 || sourceIds.includes(question.source.file_id)) &&
      (types.length === 0 || types.includes(question.type)) &&
      (difficulty === "mixed" || question.difficulty === difficulty),
  );
  const selected = matchingQuestions.slice(0, count);
  return copy(selected);
}

export async function mockSubmitQuizAnswer({ question_id, answer }) {
  await delay();
  const question = questions.find((item) => item.id === question_id);
  const key = answers[question_id];

  if (!question || !key) {
    throw new Error("That quiz question is no longer available.");
  }

  const correct =
    question.type === "mcq" || question.type === "numerical"
      ? Number(answer) === Number(key.correctAnswer)
      : String(answer).trim().toLowerCase() === key.correctAnswer;
  const topic = mastery.topics.find((item) => item.name === question.topic);

  if (topic) {
    topic.mastery = Math.max(
      0,
      Math.min(1, topic.mastery + (correct ? 0.03 : -0.03)),
    );
  }
  mastery.weak = mastery.topics
    .filter((item) => item.mastery < 0.5)
    .map((item) => item.name);

  return {
    correct,
    feedback: correct
      ? "That's right. The course material supports your answer."
      : "Review the cited material and try this topic again.",
    ...(correct ? {} : { correct_answer: key.displayAnswer }),
    citation: copy(question.source),
    ...(!correct && question.topic === "Queues"
      ? { misconception: "Confusing queue order with stack order." }
      : {}),
  };
}

export async function mockGetMastery() {
  await delay();
  return copy(mastery);
}

export async function mockGetTopics() {
  await delay();
  return [
    { name: "Stacks", prerequisites: [] },
    { name: "Queues", prerequisites: [] },
    { name: "Sorting", prerequisites: ["Queues"] },
  ];
}
