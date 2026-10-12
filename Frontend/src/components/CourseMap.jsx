import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { getMastery, getTopics } from "@/api";

const nodeWidth = 176;
const nodeHeight = 72;
const columnGap = 84;
const rowGap = 108;
const margin = 24;

function getTopicLevels(topics) {
  const names = new Set(topics.map((topic) => topic.name));
  const levels = new Map(topics.map((topic) => [topic.name, 0]));

  for (let pass = 0; pass < topics.length; pass += 1) {
    for (const topic of topics) {
      const prerequisites = topic.prerequisites.filter((name) => names.has(name));
      if (prerequisites.length) {
        levels.set(
          topic.name,
          Math.max(...prerequisites.map((name) => levels.get(name) + 1)),
        );
      }
    }
  }

  return levels;
}

function getMasteryStyle(value) {
  if (!Number.isFinite(value)) return "neutral";
  if (value >= 0.75) return "strong";
  if (value < 0.5) return "weak";
  return "developing";
}

export default function CourseMap({ onBack, onPracticeTopic }) {
  const [topics, setTopics] = useState([]);
  const [mastery, setMastery] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);

    Promise.all([getTopics(), getMastery()])
      .then(([topicData, masteryData]) => {
        if (!active) return;
        setTopics(topicData);
        setMastery(masteryData.topics);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(true);
        toast.error(error.message || "Could not load the course map. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [retryCount]);

  const levels = getTopicLevels(topics);
  const columns = new Map();
  for (const topic of topics) {
    const level = levels.get(topic.name) || 0;
    columns.set(level, [...(columns.get(level) || []), topic]);
  }
  const orderedLevels = [...columns.keys()].sort((left, right) => left - right);
  const positions = new Map();
  let maxRows = 0;

  for (const [level, columnTopics] of columns) {
    maxRows = Math.max(maxRows, columnTopics.length);
    columnTopics.forEach((topic, index) => {
      positions.set(topic.name, {
        x: margin + level * (nodeWidth + columnGap),
        y: margin + index * rowGap,
      });
    });
  }

  const mapWidth = margin * 2 + (orderedLevels.length
    ? orderedLevels.length * nodeWidth + (orderedLevels.length - 1) * columnGap
    : 0);
  const mapHeight = margin * 2 + Math.max(1, maxRows) * rowGap - (rowGap - nodeHeight);

  return (
    <section className="course-map-screen" aria-labelledby="course-map-title">
      <header className="course-map-heading">
        <div>
          <button className="course-map-back" type="button" onClick={onBack}>
            <ArrowLeft size={16} aria-hidden="true" />
            Back to progress
          </button>
          <h1 id="course-map-title">Course map</h1>
          <p>Explore topics and what to learn first.</p>
        </div>
      </header>

      <div className="course-map-legend" aria-label="Mastery legend">
        <span><i className="course-map-legend-dot developing" />Building</span>
        <span><i className="course-map-legend-dot strong" />Strong</span>
        <span><i className="course-map-legend-dot weak" />Needs practice</span>
        <span><i className="course-map-legend-dot neutral" />No data</span>
      </div>

      {loading ? (
        <p className="course-map-message" role="status">Loading your course map...</p>
      ) : loadError ? (
        <div className="course-map-message">
          <p>The course map could not be loaded.</p>
          <button type="button" onClick={() => setRetryCount((count) => count + 1)}>
            Try again
          </button>
        </div>
      ) : topics.length === 0 ? (
        <p className="course-map-message">
          No course topics are available yet. Add course material and check back.
        </p>
      ) : (
        <div className="course-map-scroll" role="region" aria-label="Scrollable course topic map" tabIndex={0}>
          <div
            className="course-map-canvas"
            style={{ width: mapWidth, height: mapHeight }}
          >
            <svg
              className="course-map-edges"
              width={mapWidth}
              height={mapHeight}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="course-map-arrow"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L0,6 L7,3 z" fill="var(--muted-foreground)" />
                </marker>
              </defs>
              {topics.flatMap((topic) =>
                topic.prerequisites
                  .filter((name) => positions.has(name))
                  .map((name) => {
                    const prerequisite = positions.get(name);
                    const dependent = positions.get(topic.name);
                    const startX = prerequisite.x + nodeWidth;
                    const startY = prerequisite.y + nodeHeight / 2;
                    const endX = dependent.x;
                    const endY = dependent.y + nodeHeight / 2;
                    const curve = Math.max(24, (endX - startX) / 2);
                    return (
                      <path
                        key={`${name}-${topic.name}`}
                        d={`M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`}
                        fill="none"
                        stroke="var(--muted-foreground)"
                        strokeWidth="1.5"
                        markerEnd="url(#course-map-arrow)"
                      />
                    );
                  }),
              )}
            </svg>
            {topics.map((topic) => {
              const position = positions.get(topic.name);
              const masteryValue = mastery.find((item) => item.name === topic.name)?.mastery;
              const style = getMasteryStyle(masteryValue);
              return (
                <button
                  className={`course-map-node ${style}`}
                  key={topic.name}
                  type="button"
                  style={{ left: position.x, top: position.y }}
                  onClick={() => onPracticeTopic(topic.name)}
                  aria-label={`Practice ${topic.name} in quiz setup${Number.isFinite(masteryValue) ? `, ${Math.round(masteryValue * 100)}% mastery` : ", no mastery data"}`}
                >
                  <span>{topic.name}</span>
                  <small>
                    {Number.isFinite(masteryValue)
                      ? `${Math.round(masteryValue * 100)}% mastery`
                      : "No mastery data"}
                  </small>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
