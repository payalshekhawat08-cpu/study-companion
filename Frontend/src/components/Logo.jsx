import { motion, useReducedMotion } from "framer-motion";

const sizes = {
  sm: { width: 24, height: 22 },
  md: { width: 40, height: 37 },
  lg: { width: 48, height: 44 },
};

export default function Logo({ variant = "full", size = "md", className = "" }) {
  const shouldReduceMotion = useReducedMotion();
  const dimensions = sizes[size] || sizes.md;
  const isMark = variant === "mark";

  return (
    <span
      className={`logo ${isMark ? "logo-mark-only" : "logo-full"} ${className}`.trim()}
    >
      <svg
        className="logo-symbol"
        width={dimensions.width}
        height={dimensions.height}
        viewBox="0 0 48 44"
        fill="none"
        role={isMark ? "img" : undefined}
        aria-label={isMark ? "Study Companion" : undefined}
        aria-hidden={isMark ? undefined : "true"}
      >
        <path
          d="M5 14c7-3 13-2 19 3 6-5 12-6 19-3v19c-7-3-13-2-19 3-6-5-12-6-19-3V14Z"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M24 17v19"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M11 19c3-.8 6-.4 9 1.1M11 25c3-.8 6-.4 9 1.1M28 20.1c3-1.5 6-1.9 9-1.1M28 26.1c3-1.5 6-1.9 9-1.1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <motion.path
          d="m32 2 2.1 4.5L39 8.5l-4.9 2L32 15l-2.1-4.5-4.9-2 4.9-2L32 2Z"
          fill="var(--primary)"
          style={{ transformOrigin: "32px 8.5px" }}
          initial={shouldReduceMotion ? false : { scale: 0, opacity: 0 }}
          animate={shouldReduceMotion ? undefined : { scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </svg>
      {!isMark && (
        <span className="logo-copy">
          <span className="logo-wordmark">
            <span>Study</span> <strong>Companion</strong>
          </span>
          <span className="logo-tagline">Learn from your own material</span>
        </span>
      )}
    </span>
  );
}
