import { useState } from "react";
import { pickNote } from "@/lib/funnyNotes.js";

export default function FunnyNote({ context, enabled = true }) {
  const [note] = useState(() => pickNote(context));
  if (!enabled) return null;
  return <p className="funny-note">{note}</p>;
}
