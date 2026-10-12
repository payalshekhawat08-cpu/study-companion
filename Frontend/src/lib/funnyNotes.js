const notes = {
  welcome: [
    "Every big idea starts with one curious question.",
    "Your next bright idea is warming up.",
    "Ready, set, learn. Tiny steps count.",
    "A little study spark can light up a whole topic.",
  ],
  emptyLibrary: [
    "Your book-bot is ready to meet your notes.",
    "Add a source and let the learning take flight.",
    "Even a dragon starts with one little page.",
    "Your library is just waiting for its first plot twist.",
  ],
  emptyChat: [
    "Ask away; the book-bot has its listening ears on.",
    "Curiosity is the coziest place to start.",
    "Your question can be small; your ideas can soar.",
    "The dragon is all ears (and absolutely no scales on the keyboard).",
  ],
  loading: [
    "The dragon is tracing a thought through your notes.",
    "One tiny book-bot, carefully checking the pages.",
    "Gathering the right sparks from your material.",
    "Your answer is taking the scenic route through the notes.",
  ],
  notCovered: [
    "That topic may be hiding in another source.",
    "No worries; a different question might find the right trail.",
    "The dragon couldn't spot that detail in these notes.",
    "Try another angle and see where the pages lead.",
  ],
  quizHigh: [
    "Look at those ideas taking flight!",
    "Your study sparks made a fine little blaze.",
    "That was some bright-brained work.",
    "The dragon gives your effort a happy tail-flap.",
  ],
  quizMid: [
    "Every answer is another step along the trail.",
    "You're building a sturdy little tower of knowledge.",
    "Keep going; the next spark is just ahead.",
    "A few more practice laps and you'll soar further.",
  ],
  quizLow: [
    "One quiz is just a snapshot; keep learning at your pace.",
    "Every mix-up can point toward a useful next step.",
    "You're still in the story; turn the page when you're ready.",
    "Small practice steps help ideas find their wings.",
  ],
  streakBroken: [
    "A little rest is part of the learning journey.",
    "The dragon saved you a fresh page for today.",
    "No worries; every new streak starts with one day.",
    "Your book-bot kept your place while you were away.",
  ],
  streakMilestone: [
    "Your learning streak is on fire (the friendly kind).",
    "Another bright day in your study story!",
    "The dragon is doing a tiny victory flap.",
    "More study sparks, more reasons to soar.",
  ],
  progressEmpty: [
    "Your progress story is ready for its first chapter.",
    "A little practice will give this chart something to celebrate.",
    "Your star is waiting for the next learning milestone.",
    "One study session at a time, the picture will take shape.",
  ],
};

const lastNotes = new Map();

export function pickNote(context) {
  const lines = notes[context];
  if (!lines) {
    throw new Error(`Unknown funny note context: ${context}`);
  }

  const previous = lastNotes.get(context);
  let index = Math.floor(Math.random() * lines.length);
  if (lines[index] === previous) {
    index = (index + 1) % lines.length;
  }
  lastNotes.set(context, lines[index]);
  return lines[index];
}
