"""Offline tests for the answer-quality evaluator."""

import unittest
from unittest.mock import patch

import eval_ragas


class JudgePromptTests(unittest.TestCase):
    def test_prompt_builds_without_calling_gemini(self):
        records = [
            {
                "id": "offline-question",
                "question": "What is the answer?",
                "ground_truth": "A fake answer.",
                "answer": "A fake answer.",
                "grounded": True,
                "citations": [],
                "retrieved_context": [],
            }
        ]

        with patch.object(
            eval_ragas,
            "generate_json",
            side_effect=AssertionError("The offline prompt test must not call Gemini."),
        ):
            prompt = eval_ragas.build_judge_prompt(records)

        self.assertIn('{"results":[{"id":"..."', prompt)
        self.assertIn('"id": "offline-question"', prompt)
        self.assertNotIn("__EVALUATION_RECORDS__", prompt)
        print(prompt[:300])


if __name__ == "__main__":
    unittest.main()
