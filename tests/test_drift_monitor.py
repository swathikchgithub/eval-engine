#!/usr/bin/env python3
"""Unit tests for Layer 5 Continuous Calibration & Longitudinal Drift Monitor."""

import json
import tempfile
import unittest
from pathlib import Path

from scripts.drift_monitor import (
    compute_distribution,
    compute_psi,
    compute_tvd,
    slice_production_failures,
    analyze_drift,
    export_candidates_to_jsonl,
    generate_drift_reports,
)


class TestDriftMath(unittest.TestCase):
    def test_identical_distributions_zero_psi_and_tvd(self):
        dist = {1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2}
        psi = compute_psi(dist, dist)
        tvd = compute_tvd(dist, dist)
        self.assertAlmostEqual(psi, 0.0, places=4)
        self.assertAlmostEqual(tvd, 0.0, places=4)

    def test_severely_shifted_distribution_high_psi(self):
        baseline = {1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2}
        skewed = {1: 0.02, 2: 0.02, 3: 0.02, 4: 0.04, 5: 0.90}
        psi = compute_psi(baseline, skewed)
        tvd = compute_tvd(baseline, skewed)
        self.assertGreater(psi, 0.25)  # Well past the critical shift boundary
        self.assertGreater(tvd, 0.40)

    def test_moderate_shift_psi(self):
        baseline = {1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2}
        shifted = {1: 0.12, 2: 0.16, 3: 0.20, 4: 0.24, 5: 0.28}
        psi = compute_psi(baseline, shifted)
        self.assertGreater(psi, 0.02)
        self.assertLess(psi, 0.25)

    def test_compute_distribution_normalization(self):
        scores = [1, 1, 2, 3, 4, 5, 5, 5, 5, 5]
        dist = compute_distribution(scores)
        self.assertAlmostEqual(sum(dist.values()), 1.0, places=4)
        self.assertEqual(dist[5], 0.5)
        self.assertEqual(dist[1], 0.2)
        self.assertEqual(dist[2], 0.1)


class TestFailureSlicing(unittest.TestCase):
    def test_slices_severe_disagreement(self):
        records = [
            {
                "id": "rec_01",
                "prompt": "How do I return?",
                "context": "30 days return window",
                "response": "No returns allowed",
                "human_score": 5,
                "llm_score": 1,
            }
        ]
        slices = slice_production_failures(records)
        self.assertEqual(len(slices), 1)
        self.assertIn("severe_delta_4", slices[0]["curation_reasons"])
        self.assertEqual(slices[0]["human_review_status"], "PENDING_REVIEW")

    def test_slices_low_score_on_critical_keyword(self):
        records = [
            {
                "id": "rec_02",
                "prompt": "Can I cancel my subscription and get a prorated refund?",
                "context": "No prorated refunds allowed",
                "response": "We will give you full cash back.",
                "llm_score": 2,
                "reasoning": "Hallucinated cash back policy.",
            }
        ]
        slices = slice_production_failures(records)
        self.assertEqual(len(slices), 1)
        self.assertTrue(any("low_score_critical_kw" in r for r in slices[0]["curation_reasons"]))

    def test_ignores_healthy_aligned_samples(self):
        records = [
            {
                "id": "rec_03",
                "prompt": "What are your hours?",
                "context": "Open 9am-5pm",
                "response": "We are open from 9am to 5pm.",
                "human_score": 5,
                "llm_score": 5,
            }
        ]
        slices = slice_production_failures(records)
        self.assertEqual(len(slices), 0)


class TestDriftIntegration(unittest.TestCase):
    def test_full_drift_analysis_pipeline(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            golden_file = tmp_path / "golden.jsonl"
            shadow_file = tmp_path / "shadow.jsonl"
            candidates_file = tmp_path / "candidates.jsonl"

            # Create balanced baseline golden set
            golden_data = [
                {"prompt": f"p{i}", "context": "c", "response": "r", "human_score": (i % 5) + 1}
                for i in range(25)
            ]
            with open(golden_file, "w") as f:
                for row in golden_data:
                    f.write(json.dumps(row) + "\n")

            # Create production shadow records matching baseline
            shadow_data = [
                {"id": f"s_{i}", "prompt": f"p{i}", "context": "c", "response": "r", "llm_score": (i % 5) + 1, "human_score": (i % 5) + 1}
                for i in range(25)
            ]
            with open(shadow_file, "w") as f:
                for row in shadow_data:
                    f.write(json.dumps(row) + "\n")

            drift_status = analyze_drift(golden_path=golden_file, shadow_path=shadow_file, rolling_window=50)

            self.assertEqual(drift_status.status, "HEALTHY")
            self.assertLess(drift_status.psi, 0.05)
            self.assertLess(drift_status.tvd, 0.05)
            self.assertAlmostEqual(drift_status.rolling_qwk, 1.0, places=2)
            self.assertEqual(drift_status.rolling_adjacent_agreement, 1.0)
            self.assertAlmostEqual(drift_status.rolling_lenience_drift, 0.0, places=2)

            # Export candidates
            candidates = slice_production_failures(shadow_data)
            count = export_candidates_to_jsonl(candidates, out_path=candidates_file)
            self.assertEqual(count, 0)


if __name__ == "__main__":
    unittest.main()
