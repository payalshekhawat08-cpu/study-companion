import { useState } from "react";

const sizes = { xs: 24, sm: 40, md: 64 };

function DragonFallback({ dimension }) {
  return (
    <svg
      width={dimension}
      height={dimension}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M45 43c8 2 11 8 7 13-4-4-8-4-13-3" fill="#F2A65A" />
      <path d="M48 50c5-1 8 1 9 5-4-1-7 0-10 3" fill="#E5534B" />
      <path d="M18 24 9 15l2 16M43 23l8-9-1 17" fill="#E98945" stroke="#B85F34" strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 34c0-11 8-19 19-19s18 8 18 19v9c0 8-8 13-19 13s-18-5-18-13v-9Z" fill="#F2A65A" stroke="#B85F34" strokeWidth="2" />
      <path d="m24 18-5-8 12 5M40 17l5-7-11 5" fill="#4CAF7A" stroke="#2E7550" strokeWidth="2" strokeLinejoin="round" />
      <path d="M21 35c2-3 5-3 7 0M36 35c2-3 5-3 7 0" stroke="#30251E" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M27 44c3 3 7 3 10 0" stroke="#8B4933" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 43h-5m38 0h-5" stroke="#D77B45" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BookBot({ dimension }) {
  return (
    <svg width={dimension} height={dimension} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <path d="M8 17c9-3 16-1 24 4v32c-8-5-15-7-24-4V17Z" fill="#F2A65A" stroke="#A96337" strokeWidth="2" strokeLinejoin="round" />
      <path d="M56 17c-9-3-16-1-24 4v32c8-5 15-7 24-4V17Z" fill="#E8EAED" stroke="#A96337" strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 26c5-1 9 0 13 2M14 33c5-1 9 0 13 2M38 28c4-2 8-3 13-2m-13 9c4-2 8-3 13-2" stroke="#B77248" strokeWidth="2" strokeLinecap="round" />
      <circle cx="43" cy="43" r="6" fill="#4CAF7A" />
      <circle cx="41" cy="42" r="1" fill="#0E1013" />
      <circle cx="45" cy="42" r="1" fill="#0E1013" />
      <path d="M41 45c1 1 3 1 4 0" stroke="#0E1013" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M23 11v4m18-4v4" stroke="#A96337" strokeWidth="2" strokeLinecap="round" />
      <circle cx="23" cy="9" r="2" fill="#F2A65A" />
      <circle cx="41" cy="9" r="2" fill="#F2A65A" />
    </svg>
  );
}

function Star({ dimension }) {
  return (
    <svg width={dimension} height={dimension} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <path d="m32 6 7.5 17.2L58 25l-13.8 12 4 18L32 45.5 15.8 55l4-18L6 25l18.5-1.8L32 6Z" fill="#F2A65A" stroke="#B8753F" strokeWidth="2" strokeLinejoin="round" />
      <path d="M25 31c1.5-2 3.5-2 5 0m4 0c1.5-2 3.5-2 5 0" stroke="#493521" strokeWidth="2" strokeLinecap="round" />
      <path d="M28 38c2 2 6 2 8 0" stroke="#8E5531" strokeWidth="2" strokeLinecap="round" />
      <path d="m12 12 2 3m38 1 2-3M9 43l4-1m39 2 3 1" stroke="#E8EAED" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function Mascot({ name = "charizard", mood = "happy", size = "sm" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const dimension = sizes[size] || sizes.sm;

  return (
    <span
      className={`mascot mascot-${size} mascot-mood-${mood}`}
      style={{ width: dimension, height: dimension }}
      aria-hidden="true"
    >
      {name === "charizard" ? (
        imageFailed ? (
          <DragonFallback dimension={dimension} />
        ) : (
          <img
            src="/avatars/charizard.png"
            alt=""
            width={dimension}
            height={dimension}
            onError={() => setImageFailed(true)}
          />
        )
      ) : name === "book-bot" ? (
        <BookBot dimension={dimension} />
      ) : (
        <Star dimension={dimension} />
      )}
    </span>
  );
}
