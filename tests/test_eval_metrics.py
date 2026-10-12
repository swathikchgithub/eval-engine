from __future__ import annotations

import unittest
import numpy as np

from scripts.eval_gate import compute_evaluation_metrics


class TestEvaluationMetrics(unittest.TestCase):
    def test_perfect_agreement(self):
        human = [1, 2, 3, 4, 5]
        llm = [1, 2, 3, 4, 5]
        res = compute_evaluation_metrics(human, llm)

        self.assertAlmostEqual(res["qwk"], 1.0, places=3)
        self.assertEqual(res["adjacent_agreement"], 1.0)
        self.assertEqual(res["exact_match"], 1.0)
        self.assertAlmostEqual(res["lenience_drift"], 0.0, places=3)
        self.assertEqual(res["severe_misalignments"], 0)
        self.assertEqual(res["confusion_matrix"].shape, (5, 5))
        # Diagonal elements should all be 1
        np.testing.assert_array_equal(np.diag(res["confusion_matrix"]), [1, 1, 1, 1, 1])

    def test_adjacent_disagreements_within_one(self):
        # All differences are +-1
        human = [1, 2, 3, 4, 5]
        llm = [2, 1, 4, 3, 4]
        res = compute_evaluation_metrics(human, llm)

        self.assertEqual(res["adjacent_agreement"], 1.0)
        self.assertEqual(res["exact_match"], 0.0)
        self.assertEqual(res["severe_misalignments"], 0)
        self.assertTrue(res["qwk"] > 0.5)

    def test_severe_misalignments_detected(self):
        # 2 severe errors (diff >= 2)
        human = [1, 2, 3, 4, 5]
        llm = [4, 2, 1, 4, 5]  # |4-1|=3, |1-3|=2
        res = compute_evaluation_metrics(human, llm)

        self.assertEqual(res["severe_misalignments"], 2)
        self.assertEqual(res["adjacent_agreement"], 0.6)  # 3 out of 5 are <= 1
        self.assertEqual(res["exact_match"], 0.6)

    def test_lenience_drift_positive_and_negative(self):
        # Generous judge (rates higher than human)
        human = [2, 3, 2, 3]
        llm_generous = [4, 4, 4, 4]
        res_gen = compute_evaluation_metrics(human, llm_generous)
        self.assertTrue(res_gen["lenience_drift"] > 1.0)

        # Strict judge (rates lower than human)
        llm_strict = [1, 1, 1, 1]
        res_strict = compute_evaluation_metrics(human, llm_strict)
        self.assertTrue(res_strict["lenience_drift"] < -1.0)

    def test_constant_ratings_edge_case(self):
        # Handles edge cases where raters assign identical values without crashing
        human = [3, 3, 3, 3]
        llm = [3, 3, 3, 3]
        res = compute_evaluation_metrics(human, llm)
        self.assertEqual(res["qwk"], 1.0)
        self.assertEqual(res["severe_misalignments"], 0)


if __name__ == "__main__":
    unittest.main()
