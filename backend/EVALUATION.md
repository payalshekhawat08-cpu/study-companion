# Backend evaluation scripts

Both scripts run from PowerShell and do not start the web server.

## Simulated students

From the project folder, run:

```powershell
.\venv\Scripts\python.exe .\backend\eval_students.py
```

This uses saved quiz questions and the same quiz-answer and mastery update path as
the API. It never calls Gemini or creates questions. It removes the simulation
rows from `mastery`, `mastery_history`, and `student_questions` when it finishes.
To keep those rows for inspection, run:

```powershell
.\venv\Scripts\python.exe .\backend\eval_students.py --keep
```

The JSON and readable table are saved to `backend\eval_results\students.json`
and `backend\eval_results\students.md`. The table shows mastery before and after
for practiced topics, average topic mastery gain, question counts, repetition,
and whether the saved question pool ran out.

## Answer-quality evaluation

The evaluator checks whether RAGAS and its Gemini integration can be imported
from the already-installed packages. In an environment where that integration
does not work, it uses a small RAGAS-style judge with the same four scores.
The current backend environment uses the RAGAS-style judge because RAGAS fails
to import its installed dependencies.

The default command is a dry run:

```powershell
.\venv\Scripts\python.exe .\backend\eval_ragas.py
```

It prints all five test questions, writes fake scores to prove the output works,
and makes **zero Gemini calls**. A real run requires explicit opt-in:

```powershell
.\venv\Scripts\python.exe .\backend\eval_ragas.py --real
```

The real run checks that up to six text calls remain available before doing
anything with Gemini. It asks the existing backend question-answering logic for
each test question and scores all answers together in one judge call. Up to six
calls count against the daily text-call limit; the five query embeddings are
additional Gemini requests but are not text calls. Depending on retrieval, the
run makes up to eleven Gemini requests total. The actual counts are saved in
`backend\eval_results\ragas.json` and shown in
`backend\eval_results\ragas.md`. The off-topic question passes when the backend
returns `grounded: false`.
