from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch
import urllib.error

from scripts.monitor_agent import (
    Anomaly,
    CheckResult,
    ProbeReport,
    _compute_psi,
    _compute_tvd,
    append_to_log,
    probe_chat_edge,
    probe_edge_homepage,
    probe_metrics_gate,
    probe_telemetry_drift,
    run_monitoring_sweep,
    update_status_report,
)


class TestMathematicalDriftUtilities(unittest.TestCase):
    def test_identical_distributions_yield_zero_drift(self):
        baseline = [1, 2, 3, 4, 5] * 20
        production = [1, 2, 3, 4, 5] * 20
        psi = _compute_psi(baseline, production)
        tvd = _compute_tvd(baseline, production)
        self.assertAlmostEqual(psi, 0.0, places=3)
        self.assertAlmostEqual(tvd, 0.0, places=3)

    def test_divergent_distributions_yield_high_drift(self):
        baseline = [1] * 50 + [2] * 50
        production = [5] * 100
        psi = _compute_psi(baseline, production)
        tvd = _compute_tvd(baseline, production)
        self.assertGreater(psi, 0.25)
        self.assertGreater(tvd, 0.20)


class TestMonitoringProbes(unittest.TestCase):
    @patch("urllib.request.urlopen")
    def test_probe_edge_homepage_success(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.headers = {"server": "Vercel", "content-type": "text/html"}
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        check, anomalies = probe_edge_homepage("https://mock-site.com")
        self.assertEqual(check.status, "PASS")
        self.assertEqual(check.http_code, 200)
        self.assertEqual(len(anomalies), 0)

    @patch("urllib.request.urlopen")
    def test_probe_edge_homepage_http_error(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.HTTPError(
            url="https://mock-site.com", code=503, msg="Service Unavailable", hdrs={}, fp=None
        )

        check, anomalies = probe_edge_homepage("https://mock-site.com")
        self.assertEqual(check.status, "FAIL")
        self.assertEqual(check.http_code, 503)
        self.assertEqual(len(anomalies), 1)
        self.assertEqual(anomalies[0].severity, "CRITICAL")

    @patch("urllib.request.urlopen")
    def test_probe_metrics_gate_healthy(self, mock_urlopen):
        mock_payload = {
            "metrics": {
                "status": "PASSED",
                "qwk": 0.969,
                "adjacent_agreement": 1.0,
                "severe_misalignments": 0,
            },
            "golden_samples": [{"id": f"s_{i}"} for i in range(10)],
        }
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = json.dumps(mock_payload).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        check, anomalies = probe_metrics_gate("https://mock-site.com")
        self.assertEqual(check.status, "PASS")
        self.assertEqual(len(anomalies), 0)
        self.assertEqual(check.details["qwk"], 0.969)

    @patch("urllib.request.urlopen")
    def test_probe_metrics_gate_severe_regression(self, mock_urlopen):
        mock_payload = {
            "metrics": {
                "status": "FAILED",
                "qwk": 0.45,
                "adjacent_agreement": 0.70,
                "severe_misalignments": 2,
            },
            "golden_samples": [],
        }
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = json.dumps(mock_payload).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        check, anomalies = probe_metrics_gate("https://mock-site.com")
        self.assertEqual(check.status, "FAIL")
        # Should flag gate status, qwk drop, severe misalignments, and missing samples
        self.assertGreaterEqual(len(anomalies), 3)
        crit_severities = [a.severity for a in anomalies if a.severity == "CRITICAL"]
        self.assertGreaterEqual(len(crit_severities), 2)

    @patch("urllib.request.urlopen")
    def test_probe_chat_edge_success_and_headers(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.headers = {
            "x-ratelimit-limit": "60",
            "x-ratelimit-remaining": "58",
        }
        mock_resp.read.return_value = json.dumps({
            "id": "edge_123",
            "response": "Hello test",
            "user_latency_ms": 42,
            "shadow_evaluation": {"status": "SKIPPED"},
        }).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        check, anomalies = probe_chat_edge("https://mock-site.com", zero_cost=True)
        self.assertEqual(check.status, "PASS")
        self.assertEqual(check.details["rate_limit_limit"], "60")
        self.assertEqual(check.details["rate_limit_remaining"], "58")
        self.assertEqual(len(anomalies), 0)

    @patch("urllib.request.urlopen")
    def test_probe_chat_edge_rate_limited(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.HTTPError(
            url="https://mock-site.com/api/chat", code=429, msg="Too Many Requests", hdrs={}, fp=None
        )

        check, anomalies = probe_chat_edge("https://mock-site.com", zero_cost=True)
        self.assertEqual(check.status, "WARN")
        self.assertEqual(check.http_code, 429)
        self.assertEqual(len(anomalies), 1)
        self.assertEqual(anomalies[0].severity, "WARNING")


class TestReportingAndLogging(unittest.TestCase):
    def test_status_report_markdown_and_log_generation(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            test_log = tmp_path / "monitor_log.jsonl"
            test_report_file = tmp_path / "STATUS_REPORT.md"

            with patch("scripts.monitor_agent.LOG_FILE", test_log), \
                 patch("scripts.monitor_agent.STATUS_REPORT_FILE", test_report_file), \
                 patch("scripts.monitor_agent.MONITORING_DIR", tmp_path):

                report = ProbeReport(
                    run_id="mon_test_01",
                    timestamp="2026-10-12T16:00:00Z",
                    target_url="https://mock-site.com",
                    overall_status="HEALTHY",
                    checks=[
                        {
                            "name": "edge_homepage",
                            "layer": "Edge Infrastructure",
                            "status": "PASS",
                            "latency_ms": 120.0,
                            "http_code": 200,
                            "details": {"server": "Vercel"},
                        }
                    ],
                    anomalies=[],
                    total_latency_ms=150.0,
                )

                append_to_log(report)
                self.assertTrue(test_log.is_file())
                log_lines = test_log.read_text(encoding="utf-8").splitlines()
                self.assertEqual(len(log_lines), 1)
                parsed = json.loads(log_lines[0])
                self.assertEqual(parsed["run_id"], "mon_test_01")

                update_status_report(report)
                self.assertTrue(test_report_file.is_file())
                md_content = test_report_file.read_text(encoding="utf-8")
                self.assertIn("SYSTEM OPERATIONAL", md_content)
                self.assertIn("edge_homepage", md_content)
                self.assertIn("Zero active anomalies detected", md_content)


if __name__ == "__main__":
    unittest.main()
