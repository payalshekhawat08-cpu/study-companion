"""Simulate quiz students using only questions already stored in SQLite."""

import argparse
import json
import random
import sqlite3
import uuid
from pathlib import Path

import main
from config import P_INIT
from store import (
    DATABASE_PATH,
    get_student_mastery,
    get_unseen_questions,
    initialize_store,
    serve_questions,
)

BASE_DIR = Path(__file__).resolve().parent
RESULTS_DIR = BASE_DIR / "eval_results"
RANDOM_SEED = 42
STUDENT_TYPES = {
    "weak": 0.30,
    "average": 0.60,
    "strong": 0.85,
}
QUESTION_TYPES = ["mcq", "short", "numerical"]


def unseen_saved_questions(student_id: str) -> list[dict]:
    questions = []
    for diagnostic in (False, True):
        questions.extend(
            get_unseen_questions(
                student_id,
                topics=[],
                source_ids=[],
                types=QUESTION_TYPES,
                difficulty="mixed",
                diagnostic=diagnostic,
            )
        )
    return sorted(questions, key=lambda question: (question["created_at"], question["id"]))


def simulated_answer(question: dict, should_be_correct: bool) -> str | int | float:
    if question["type"] == "mcq":
        correct_index = int(question["correct_answer"])
        if should_be_correct:
            return correct_index
        options = json.loads(question["options"] or "[]")
        wrong_indexes = [index for index in range(len(options)) if index != correct_index]
        if not wrong_indexes:
            raise ValueError(f"Question {question['id']} has no incorrect MCQ option.")
        return wrong_indexes[0]

    if question["type"] == "numerical":
        if should_be_correct:
            return question["correct_answer"]
        expected = main._extract_number(question["correct_answer"])
        if expected is None:
            raise ValueError(f"Question {question['id']} has an invalid saved numeric answer.")
        return expected + max(abs(expected), 1) * 100

    if question["type"] == "short":
        key_terms = json.loads(question["key_terms"])
        if should_be_correct:
            if not key_terms:
                raise ValueError(
                    f"Question {question['id']} has no key terms for answer grading."
                )
            return " ".join(key_terms)
        return "!"

    raise ValueError(f"Question {question['id']} has unsupported type {question['type']!r}.")


def clear_simulated_student_rows():
    with sqlite3.connect(DATABASE_PATH) as connection:
        for table in ("mastery", "mastery_history", "student_questions"):
            connection.execute(
                f"DELETE FROM {table} WHERE substr(student_id, 1, 4) = 'sim_'"
            )


def simulate_students() -> dict:
    randomizer = random.Random(RANDOM_SEED)
    run_id = uuid.uuid4().hex[:8]
    students = []

    for student_type, correct_probability in STUDENT_TYPES.items():
        student_id = f"sim_{student_type}_{run_id}"
        seen_ids = set()
        practiced_topics = set()
        questions_served = 0
        repeated_questions = 0
        pool_exhausted = False
        sessions_completed = 0

        for _session in range(3):
            for _ in range(5):
                available = unseen_saved_questions(student_id)
                if not available:
                    pool_exhausted = True
                    break

                question = randomizer.choice(available)
                served = serve_questions(student_id, [question["id"]])
                if not served:
                    raise RuntimeError(
                        f"Could not serve unseen saved question {question['id']}."
                    )
                question = served[0]
                if question["id"] in seen_ids:
                    repeated_questions += 1
                seen_ids.add(question["id"])
                practiced_topics.add(question["topic"])
                should_be_correct = randomizer.random() < correct_probability
                answer = simulated_answer(question, should_be_correct)
                result = main.quiz_answer(
                    main.QuizAnswerRequest(
                        question_id=question["id"],
                        answer=answer,
                    ),
                    student_id=student_id,
                )
                if result["correct"] != should_be_correct:
                    raise RuntimeError(
                        f"Saved answer grading differed from the simulation for "
                        f"question {question['id']}."
                    )
                questions_served += 1

            if pool_exhausted:
                break
            sessions_completed += 1

        mastery_after = get_student_mastery(student_id)["mastery"]
        mastery_before = {topic: P_INIT for topic in sorted(practiced_topics)}
        mastery_after_by_topic = {
            topic: mastery_after[topic]["p_known"]
            for topic in sorted(practiced_topics)
        }
        gains = [
            mastery_after_by_topic[topic] - mastery_before[topic]
            for topic in mastery_before
        ]

        students.append(
            {
                "type": student_type,
                "student_id": student_id,
                "correct_probability": correct_probability,
                "mastery_before": mastery_before,
                "mastery_after": mastery_after_by_topic,
                "average_mastery_gain": sum(gains) / len(gains) if gains else 0.0,
                "questions_served": questions_served,
                "repeated_questions": repeated_questions,
                "repetition_rate_percent": (
                    100 * repeated_questions / questions_served
                    if questions_served
                    else 0.0
                ),
                "sessions_completed": sessions_completed,
                "pool_exhausted": pool_exhausted,
                "pool_status": "pool exhausted" if pool_exhausted else "available",
            }
        )

    return {"seed": RANDOM_SEED, "students": students}


def write_results(results: dict):
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    (RESULTS_DIR / "students.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    rows = [
        "# Simulated student evaluation",
        "",
        f"Fixed random seed: {results['seed']}. Questions came only from the saved quiz table.",
        "",
        "## Mastery by practiced topic",
        "",
        "| Student type | Topic | Before | After | Gain |",
        "|---|---|---:|---:|---:|",
    ]
    for student in results["students"]:
        for topic, before in student["mastery_before"].items():
            after = student["mastery_after"][topic]
            rows.append(
                f"| {student['type']} | {topic} | {before:.3f} | "
                f"{after:.3f} | {after - before:+.3f} |"
            )
    rows.extend(
        [
            "",
            "## Session summary",
            "",
            "| Student type | Average mastery gain | Questions served | Repeated questions | Repetition rate | Sessions completed | Pool status |",
            "|---|---:|---:|---:|---:|---:|---|",
        ]
    )
    for student in results["students"]:
        rows.append(
            f"| {student['type']} | {student['average_mastery_gain']:.3f} | "
            f"{student['questions_served']} | {student['repeated_questions']} | "
            f"{student['repetition_rate_percent']:.1f}% | "
            f"{student['sessions_completed']} | {student['pool_status']} |"
        )
    (RESULTS_DIR / "students.md").write_text("\n".join(rows) + "\n", encoding="utf-8")


def main_cli():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--keep",
        action="store_true",
        help="Keep the simulated mastery and served-question rows in SQLite.",
    )
    args = parser.parse_args()

    initialize_store()
    try:
        results = simulate_students()
        write_results(results)
        for student in results["students"]:
            print(
                f"{student['type']}: {student['questions_served']} questions, "
                f"average mastery gain {student['average_mastery_gain']:.3f}, "
                f"{student['pool_status']}"
            )
        print(f"Results saved in {RESULTS_DIR}")
    finally:
        if not args.keep:
            clear_simulated_student_rows()
            print("Removed simulation rows from mastery, mastery_history, and student_questions.")


if __name__ == "__main__":
    main_cli()
