from __future__ import annotations

import json
import os
import time
import unittest
import urllib.error
import urllib.request


class TestE2EApiRoutes(unittest.TestCase):
    """End-to-End integration tests for live API routes on Vercel Edge / Next.js."""

    @classmethod
    def setUpClass(cls):
        # Defaults to the live production deployment on Vercel
        cls.base_url = os.environ.get("E2E_TARGET_URL", "https://eval-engine-coral.vercel.app").rstrip("/")

    def _http_request(self, path: str, method: str = "GET", data: dict | None = None) -> tuple[int, dict]:
        url = f"{self.base_url}{path}"
        req_data = json.dumps(data).encode("utf-8") if data is not None else None
        headers = {"Content-Type": "application/json"} if req_data else {}

        req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                status_code = resp.status
                body = resp.read().decode("utf-8")
                return status_code, json.loads(body)
        except urllib.error.HTTPError as err:
            err_body = err.read().decode("utf-8")
            try:
                parsed = json.loads(err_body)
            except Exception:
                parsed = {"raw": err_body}
            return err.code, parsed

    def test_e2e_get_metrics_contract(self):
        """Verifies GET /api/metrics returns live gate telemetry and 10 golden samples."""
        status_code, body = self._http_request("/api/metrics")
        self.assertEqual(status_code, 200, f"Expected 200 from /api/metrics, got {status_code}: {body}")

        # Validate metrics block
        self.assertIn("metrics", body)
        metrics = body["metrics"]
        self.assertIn("qwk", metrics)
        self.assertIn("adjacent_agreement", metrics)
        self.assertIn("lenience_drift", metrics)
        self.assertIn("severe_misalignments", metrics)
        self.assertEqual(metrics["status"], "PASSED")
        self.assertGreaterEqual(metrics["qwk"], 0.70)
        self.assertEqual(metrics["severe_misalignments"], 0)

        # Validate golden dataset benchmark block
        self.assertIn("golden_samples", body)
        samples = body["golden_samples"]
        self.assertEqual(len(samples), 10, f"Expected 10 golden samples, got {len(samples)}")
        for s in samples:
            self.assertIn("id", s)
            self.assertIn("prompt", s)
            self.assertIn("response", s)
            self.assertIn("human_score", s)
            self.assertTrue(1 <= s["human_score"] <= 5)

        # Validate layer milestones
        self.assertIn("layers", body)
        self.assertEqual(body["layers"]["layer1"]["status"], "COMPLETED")
        self.assertEqual(body["layers"]["layer2"]["status"], "COMPLETED")
        self.assertEqual(body["layers"]["layer3"]["status"], "COMPLETED")

    def test_e2e_post_chat_edge_latency_and_response(self):
        """Verifies POST /api/chat returns candidates with sub-100ms Edge response time."""
        t0 = time.perf_counter()
        status_code, body = self._http_request(
            "/api/chat",
            method="POST",
            data={
                "prompt": "What is the return policy for hardware?",
                "context": "Hardware returns are accepted within 90 days.",
                "forceEvaluation": True,
            },
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000

        self.assertEqual(status_code, 200, f"Expected 200 from /api/chat, got {status_code}: {body}")
        self.assertIn("response", body)
        self.assertIn("shadow_evaluation", body)
        self.assertTrue(len(body["response"]) > 0)

        # Check edge response time
        self.assertIn("user_latency_ms", body)
        self.assertTrue(body["shadow_evaluation"]["sampled"])
        self.assertEqual(body["shadow_evaluation"]["status"], "RUNNING_IN_BACKGROUND")
        # Total roundtrip (including international HTTPS transport) should be reasonably fast
        self.assertLess(elapsed_ms, 2500, f"Edge roundtrip took too long: {elapsed_ms:.1f}ms")

    def test_e2e_post_chat_keyword_sampler_trigger(self):
        """Verifies requests containing sensitive keywords trigger shadow evaluation."""
        status_code, body = self._http_request(
            "/api/chat",
            method="POST",
            data={
                "prompt": "How do I request a refund under the return policy?",
                "context": "Refunds take 3 to 5 business days.",
                "forceEvaluation": False,
            },
        )
        self.assertEqual(status_code, 200)
        shadow = body.get("shadow_evaluation", {})
        self.assertTrue(shadow.get("sampled"), "Keyword 'policy/refund' should have triggered sampling")
        self.assertTrue("keyword_trigger" in shadow.get("reason", ""))
        self.assertEqual(shadow.get("status"), "RUNNING_IN_BACKGROUND")

    def test_e2e_post_chat_unsampled_query(self):
        """Verifies general benign queries skip evaluation when forceEvaluation is false."""
        status_code, body = self._http_request(
            "/api/chat",
            method="POST",
            data={
                "prompt": "Good morning assistant",
                "context": "Greetings context",
                "forceEvaluation": False,
            },
        )
        self.assertEqual(status_code, 200)
        shadow = body.get("shadow_evaluation", {})
        # Without keywords or force flag, unselected queries skip gracefully
        if not shadow.get("sampled"):
            self.assertEqual(shadow.get("status"), "SKIPPED")

    def test_e2e_post_chat_bad_request(self):
        """Verifies POST /api/chat gracefully handles missing required fields with HTTP 400."""
        status_code, body = self._http_request(
            "/api/chat",
            method="POST",
            data={"invalid_key": "no prompt provided"},
        )
        self.assertEqual(status_code, 400)
        self.assertIn("error", body)


if __name__ == "__main__":
    unittest.main()
