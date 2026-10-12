const storageKey = "study-companion-streak";
const emptyStreak = { current: 0, longest: 0, lastDate: null };

export function getLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function daysBetween(start, end) {
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  const startTime = Date.UTC(startYear, startMonth - 1, startDay);
  const endTime = Date.UTC(endYear, endMonth - 1, endDay);
  return (endTime - startTime) / 86400000;
}

function normalizeStreak(value) {
  if (
    !value ||
    !Number.isSafeInteger(value.current) ||
    value.current < 0 ||
    !Number.isSafeInteger(value.longest) ||
    value.longest < 0 ||
    (value.lastDate !== null && !isValidDate(value.lastDate)) ||
    (value.current > 0 && value.lastDate === null)
  ) {
    return { ...emptyStreak };
  }

  return {
    current: value.current,
    longest: Math.max(value.longest, value.current),
    lastDate: value.lastDate,
  };
}

export function readStreak() {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved ? normalizeStreak(JSON.parse(saved)) : { ...emptyStreak };
  } catch (error) {
    console.error("Unable to read the study streak from local storage.", error);
    return { ...emptyStreak };
  }
}

export function writeStreak(streak) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(normalizeStreak(streak)));
  } catch (error) {
    console.error("Unable to save the study streak to local storage.", error);
  }
}

export function getStreakStatus(streak, today = getLocalDate()) {
  const saved = normalizeStreak(streak);
  if (!saved.lastDate) {
    return { current: 0, longest: saved.longest, studiedToday: false };
  }

  const effectiveLastDate =
    saved.lastDate > today ? today : saved.lastDate;
  const daysSinceActivity = daysBetween(effectiveLastDate, today);
  const current = daysSinceActivity <= 1 ? saved.current : 0;

  return {
    current,
    longest: saved.longest,
    studiedToday: saved.lastDate === today,
  };
}

export function recordStudyActivity(streak, today = getLocalDate()) {
  const saved = normalizeStreak(streak);
  if (!saved.lastDate) {
    return { current: 1, longest: Math.max(saved.longest, 1), lastDate: today };
  }

  const effectiveLastDate =
    saved.lastDate > today ? today : saved.lastDate;
  const daysSinceActivity = daysBetween(effectiveLastDate, today);
  const current =
    saved.lastDate > today || daysSinceActivity === 0
      ? saved.current
      : daysSinceActivity === 1
        ? saved.current + 1
        : 1;

  return {
    current,
    longest: Math.max(saved.longest, current),
    lastDate: today,
  };
}
