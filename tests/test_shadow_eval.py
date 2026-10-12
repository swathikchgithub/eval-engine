from __future__ import annotations

import asyncio
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from scripts.router import BaseJudgeClient, JudgeOutput
from scripts.shadow_eval import ShadowEvaluationService, ShadowSampler


class TestShadowSampler(unittest.TestCase):
    def test_force_eval(self):
        sampler = ShadowSampler(sample_rate=0.0)
        sampled, reason = sampler.should_sample("Hello world", force_eval=True)
        self.assertTrue(sampled)
        self.assertEqual(reason, "force_eval")

    def test_keyword_trigger(self):
        sampler = ShadowSampler(sample_rate=0.0)
        sampled, reason = sampler.should_sample("Can I get a refund for this item?")
        self.assertTrue(sampled)
        self.assertIn("keyword_trigger", reason)

    def test_zero_rate_skips_generic(self):
        sampler = ShadowSampler(sample_rate=0.0)
        sampled, reason = sampler.should_sample("Explain quantum computing in simple terms.")
        self.assertFalse(sampled)
        self.assertEqual(reason, "skipped")

    def test_full_rate_samples_generic(self):
        sampler = ShadowSampler(sample_rate=1.0)
        sampled, reason = sampler.should_sample("Explain quantum computing in simple terms.")
        self.assertTrue(sampled)
        self.assertEqual(reason, "random_sample")


class TestShadowEvaluationService(unittest.IsolatedAsyncioTestCase):
    async def test_latency_isolation_and_processing(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            temp_log = Path(tmp_dir) / "test_shadow_log.jsonl"

            # Create mock judge client
            mock_judge = MagicMock(spec=BaseJudgeClient)
            mock_judge.name = "mock:judge"

            async def _slow_eval(prompt: str):
                await asyncio.sleep(0.05)  # Simulate 50ms evaluation
                return JudgeOutput(chain_of_thought="Grounded", score=5), "mock:judge"

            mock_judge.evaluate = AsyncMock(side_effect=_slow_eval)

            with patch("scripts.shadow_eval.SHADOW_LOG_FILE", temp_log):
                sampler = ShadowSampler(sample_rate=1.0)
                service = ShadowEvaluationService(
                    router=mock_judge,
                    sampler=sampler,
                    concurrency=2,
                )
                await service.start()

                # Test that enqueue returns immediately (<10ms) even though eval takes 50ms
                t0 = time.perf_counter()
                meta = await service.enqueue(
                    prompt="What is the return policy?",
                    response="Returns accepted within 30 days.",
                    context="Returns accepted within 30 days.",
                    request_id="req_test_01",
                )
                enqueue_latency_ms = (time.perf_counter() - t0) * 1000

                self.assertLess(enqueue_latency_ms, 20.0)
                self.assertEqual(meta["status"], "QUEUED")
                self.assertTrue(meta["sampled"])

                # Wait for background queue to flush and stop
                await service.stop()

                # Verify telemetry log
                self.assertTrue(temp_log.exists())
                lines = temp_log.read_text(encoding="utf-8").strip().splitlines()
                self.assertEqual(len(lines), 1)

                entry = json.loads(lines[0])
                self.assertEqual(entry["id"], "req_test_01")
                self.assertEqual(entry["llm_score"], 5)
                self.assertEqual(entry["provider"], "mock:judge")
                self.assertEqual(entry["status"], "SUCCESS")
                self.assertIn("eval_latency_ms", entry)


if __name__ == "__main__":
    unittest.main()
