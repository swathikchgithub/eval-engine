#!/usr/bin/env python3
"""Autonomous Website & Quality Gate Monitoring Agent.

Probes the live LLM Evaluation Engine production deployment across 5 operational tiers:
1. Edge CDN & Infrastructure Health (HTTP 200, TTFB, SSL)
2. Evaluation Regression Gate Integrity (QWK >= 0.70, severe misalignments == 0, status == 'PASSED')
3. Client-Side Browser & DOM Synthetics (Playwright headless verification of UI and console errors)
4. Edge Chat & Rate Limiting Verification (Headers, response generation, shadow evaluation sampling)
5. Passive Telemetry Drift Detection (Population Stability Index PSI and Total Variation Distance TVD)

Outputs:
- Append-only structured log: artifacts/monitoring/monitor_log.jsonl
- Self-updating live executive dashboard: artifacts/monitoring/STATUS_REPORT.md
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
import logging
import math
import os
from pathlib import Path
import subprocess
import sys
import time
from typing import Any, Optional
import urllib.error
import urllib.request

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Paths
MONITORING_DIR = REPO_ROOT / "artifacts" / "monitoring"
LOG_FILE = MONITORING_DIR / "monitor_log.jsonl"
STATUS_REPORT_FILE = MONITORING_DIR / "STATUS_REPORT.md"
GOLDEN_SET_FILE = REPO_ROOT / "data" / "eval_golden_set.jsonl"
SHADOW_LOG_FILE = REPO_ROOT / "artifacts" / "shadow_eval_log.jsonl"

DEFAULT_TARGET_URL = os.environ.get("E2E_TARGET_URL", "https://eval-engine-coral.vercel.app").rstrip("/")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("eval-engine.monitor_agent")


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------
@dataclass
class Anomaly:
    severity: str  # "CRITICAL" | "WARNING" | "INFO"
    layer: str
    check_name: str
    message: str
    observed: Any
    threshold: Any


@dataclass
class CheckResult:
    name: str
    layer: str
    status: str  # "PASS" | "WARN" | "FAIL" | "SKIP"
    latency_ms: float
    http_code: Optional[int]
    details: dict[str, Any]


@dataclass
class ProbeReport:
    run_id: str
    timestamp: str
    target_url: str
    overall_status: str  # "HEALTHY" | "DEGRADED" | "OUTAGE"
    checks: list[dict[str, Any]]
    anomalies: list[dict[str, Any]]
    total_latency_ms: float


# ---------------------------------------------------------------------------
# Mathematical Utilities (PSI / TVD Drift calculation)
# ---------------------------------------------------------------------------
def _compute_psi(baseline: list[int], production: list[int], categories: tuple[int, ...] = (1, 2, 3, 4, 5)) -> float:
    if not baseline or not production:
        return 0.0
    epsilon = 1e-4
    b_counts = {c: baseline.count(c) + epsilon for c in categories}
    p_counts = {c: production.count(c) + epsilon for c in categories}
    b_total = sum(b_counts.values())
    p_total = sum(p_counts.values())

    psi = 0.0
    for c in categories:
        b_prob = b_counts[c] / b_total
        p_prob = p_counts[c] / p_total
        psi += (p_prob - b_prob) * math.log(p_prob / b_prob)
    return round(float(psi), 4)


def _compute_tvd(baseline: list[int], production: list[int], categories: tuple[int, ...] = (1, 2, 3, 4, 5)) -> float:
    if not baseline or not production:
        return 0.0
    b_counts = {c: baseline.count(c) for c in categories}
    p_counts = {c: production.count(c) for c in categories}
    b_total = max(1, sum(b_counts.values()))
    p_total = max(1, sum(p_counts.values()))

    tvd = 0.5 * sum(abs((p_counts[c] / p_total) - (b_counts[c] / b_total)) for c in categories)
    return round(float(tvd), 4)


# ---------------------------------------------------------------------------
# Probing Routines
# ---------------------------------------------------------------------------
def probe_edge_homepage(base_url: str) -> tuple[CheckResult, list[Anomaly]]:
    """Probes edge homepage for availability, TTFB latency, and HTTP status."""
    url = f"{base_url}/"
    t0 = time.perf_counter()
    anomalies: list[Anomaly] = []
    http_code: Optional[int] = None
    status = "PASS"
    details: dict[str, Any] = {}

    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Antigravity-MonitorAgent/1.0 (+https://eval-engine-coral.vercel.app)"},
    )

    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            latency_ms = round((time.perf_counter() - t0) * 1000, 2)
            http_code = resp.status
            details["headers"] = {
                "server": resp.headers.get("server", "unknown"),
                "content_type": resp.headers.get("content-type", "unknown"),
                "cache_control": resp.headers.get("cache-control", ""),
            }

            if latency_ms > 1200:
                status = "WARN"
                anomalies.append(
                    Anomaly(
                        severity="WARNING",
                        layer="Edge Infrastructure",
                        check_name="edge_homepage",
                        message=f"High Time to First Byte (TTFB): {latency_ms}ms",
                        observed=latency_ms,
                        threshold=1200,
                    )
                )
    except urllib.error.HTTPError as e:
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        http_code = e.code
        status = "FAIL"
        anomalies.append(
            Anomaly(
                severity="CRITICAL",
                layer="Edge Infrastructure",
                check_name="edge_homepage",
                message=f"HTTP Error {e.code}: {e.reason}",
                observed=e.code,
                threshold=200,
            )
        )
    except Exception as err:
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        status = "FAIL"
        anomalies.append(
            Anomaly(
                severity="CRITICAL",
                layer="Edge Infrastructure",
                check_name="edge_homepage",
                message=f"Connection failure: {str(err)}",
                observed="ERROR",
                threshold="CONNECTED",
            )
        )

    check = CheckResult(
        name="edge_homepage",
        layer="Edge Infrastructure",
        status=status,
        latency_ms=latency_ms,
        http_code=http_code,
        details=details,
    )
    return check, anomalies


def probe_metrics_gate(base_url: str) -> tuple[CheckResult, list[Anomaly]]:
    """Probes /api/metrics for schema integrity and quality gate metrics (QWK, severe errors)."""
    url = f"{base_url}/api/metrics"
    t0 = time.perf_counter()
    anomalies: list[Anomaly] = []
    http_code: Optional[int] = None
    status = "PASS"
    details: dict[str, Any] = {}

    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Antigravity-MonitorAgent/1.0"},
    )

    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            latency_ms = round((time.perf_counter() - t0) * 1000, 2)
            http_code = resp.status
            raw_body = resp.read().decode("utf-8")
            payload = json.loads(raw_body)

            metrics = payload.get("metrics", {})
            qwk = metrics.get("qwk")
            adjacent_acc = metrics.get("adjacent_agreement")
            severe_errors = metrics.get("severe_misalignments")
            gate_status = metrics.get("status")
            golden_samples = payload.get("golden_samples", [])

            details.update(
                {
                    "gate_status": gate_status,
                    "qwk": qwk,
                    "adjacent_acc": adjacent_acc,
                    "severe_errors": severe_errors,
                    "golden_sample_count": len(golden_samples),
                }
            )

            # Assertions
            if gate_status != "PASSED":
                status = "FAIL"
                anomalies.append(
                    Anomaly(
                        severity="CRITICAL",
                        layer="Quality Gate",
                        check_name="api_metrics_gate",
                        message=f"CI Quality Gate status is not PASSED: '{gate_status}'",
                        observed=gate_status,
                        threshold="PASSED",
                    )
                )

            if qwk is not None and qwk < 0.70:
                status = "FAIL" if status != "FAIL" else status
                anomalies.append(
                    Anomaly(
                        severity="CRITICAL",
                        layer="Quality Gate",
                        check_name="api_metrics_gate",
                        message=f"Quadratic Weighted Kappa fell below gate threshold: {qwk}",
                        observed=qwk,
                        threshold=0.70,
                    )
                )

            if severe_errors is not None and severe_errors > 0:
                status = "FAIL"
                anomalies.append(
                    Anomaly(
                        severity="CRITICAL",
                        layer="Quality Gate",
                        check_name="api_metrics_gate",
                        message=f"Severe prediction misalignments detected: {severe_errors}",
                        observed=severe_errors,
                        threshold=0,
                    )
                )

            if len(golden_samples) < 5:
                status = "WARN" if status == "PASS" else status
                anomalies.append(
                    Anomaly(
                        severity="WARNING",
                        layer="Quality Gate",
                        check_name="api_metrics_gate",
                        message=f"Golden benchmark dataset explorer incomplete (found {len(golden_samples)} samples)",
                        observed=len(golden_samples),
                        threshold=5,
                    )
                )
    except urllib.error.HTTPError as e:
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        http_code = e.code
        status = "FAIL"
        anomalies.append(
            Anomaly(
                severity="CRITICAL",
                layer="Quality Gate",
                check_name="api_metrics_gate",
                message=f"HTTP Error {e.code} on /api/metrics",
                observed=e.code,
                threshold=200,
            )
        )
    except Exception as err:
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        status = "FAIL"
        anomalies.append(
            Anomaly(
                severity="CRITICAL",
                layer="Quality Gate",
                check_name="api_metrics_gate",
                message=f"Failed to fetch or parse /api/metrics: {str(err)}",
                observed="ERROR",
                threshold="VALID_JSON",
            )
        )

    check = CheckResult(
        name="api_metrics_gate",
        layer="Quality Gate",
        status=status,
        latency_ms=latency_ms,
        http_code=http_code,
        details=details,
    )
    return check, anomalies


def probe_browser_synthetics(base_url: str) -> tuple[CheckResult, list[Anomaly]]:
    """Runs Playwright headless browser check to verify DOM rendering and console errors."""
    t0 = time.perf_counter()
    anomalies: list[Anomaly] = []
    status = "PASS"
    details: dict[str, Any] = {}

    cmd = [
        "npx",
        "playwright",
        "test",
        "e2e/dashboard.spec.ts",
        "--grep",
        "1. Dashboard loads",
        "--reporter=json",
    ]
    env = os.environ.copy()
    env["E2E_TARGET_URL"] = base_url

    try:
        proc = subprocess.run(
            cmd,
            cwd=str(REPO_ROOT),
            env=env,
            capture_output=True,
            text=True,
            timeout=25,
        )
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        details["exit_code"] = proc.returncode

        if proc.returncode == 0:
            details["result"] = "Dashboard rendered with 0 console errors and valid DOM elements"
        else:
            status = "FAIL"
            errMsg = (proc.stderr or proc.stdout)[:300].strip()
            anomalies.append(
                Anomaly(
                    severity="CRITICAL",
                    layer="Browser Synthetics",
                    check_name="browser_synthetics",
                    message=f"Playwright browser verification failed: {errMsg}",
                    observed=proc.returncode,
                    threshold=0,
                )
            )
    except FileNotFoundError:
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        status = "SKIP"
        details["note"] = "npx / playwright not available in environment; probe skipped"
    except subprocess.TimeoutExpired:
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        status = "WARN"
        anomalies.append(
            Anomaly(
                severity="WARNING",
                layer="Browser Synthetics",
                check_name="browser_synthetics",
                message="Playwright browser probe timed out after 25s",
                observed=latency_ms,
                threshold=25000,
            )
        )
    except Exception as err:
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        status = "WARN"
        details["error"] = str(err)

    check = CheckResult(
        name="browser_synthetics",
        layer="Browser Synthetics",
        status=status,
        latency_ms=latency_ms,
        http_code=None,
        details=details,
    )
    return check, anomalies


def probe_chat_edge(base_url: str, zero_cost: bool = True) -> tuple[CheckResult, list[Anomaly]]:
    """Probes POST /api/chat verifying Edge response time and Layer 5 rate limit headers."""
    url = f"{base_url}/api/chat"
    t0 = time.perf_counter()
    anomalies: list[Anomaly] = []
    http_code: Optional[int] = None
    status = "PASS"
    details: dict[str, Any] = {}

    payload = {
        "prompt": "Antigravity synthetic health probe test query",
        "context": "Hardware policy context for synthetic probe",
        "force_eval": not zero_cost,
    }
    data_bytes = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=data_bytes,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Antigravity-MonitorAgent/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            latency_ms = round((time.perf_counter() - t0) * 1000, 2)
            http_code = resp.status
            resp_body = json.loads(resp.read().decode("utf-8"))

            rl_limit = resp.headers.get("x-ratelimit-limit")
            rl_rem = resp.headers.get("x-ratelimit-remaining")
            details["rate_limit_limit"] = rl_limit
            details["rate_limit_remaining"] = rl_rem
            details["edge_latency_reported_ms"] = resp_body.get("user_latency_ms")
            details["shadow_evaluation"] = resp_body.get("shadow_evaluation", {}).get("status")

            if rl_limit is None or rl_rem is None:
                anomalies.append(
                    Anomaly(
                        severity="WARNING",
                        layer="Chat API & Rate Limiting",
                        check_name="chat_edge_api",
                        message="Missing X-RateLimit-* headers in Edge API response",
                        observed="MISSING_HEADERS",
                        threshold="HEADERS_PRESENT",
                    )
                )

            if latency_ms > 2000:
                status = "WARN" if status == "PASS" else status
                anomalies.append(
                    Anomaly(
                        severity="WARNING",
                        layer="Chat API & Rate Limiting",
                        check_name="chat_edge_api",
                        message=f"Edge API roundtrip exceeded 2000ms: {latency_ms}ms",
                        observed=latency_ms,
                        threshold=2000,
                    )
                )
    except urllib.error.HTTPError as e:
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        http_code = e.code
        if e.code == 429:
            status = "WARN"
            anomalies.append(
                Anomaly(
                    severity="WARNING",
                    layer="Chat API & Rate Limiting",
                    check_name="chat_edge_api",
                    message="HTTP 429 Rate Limit Encountered during probe",
                    observed=429,
                    threshold=200,
                )
            )
        else:
            status = "FAIL"
            anomalies.append(
                Anomaly(
                    severity="CRITICAL",
                    layer="Chat API & Rate Limiting",
                    check_name="chat_edge_api",
                    message=f"HTTP Error {e.code} on /api/chat: {e.reason}",
                    observed=e.code,
                    threshold=200,
                )
            )
    except Exception as err:
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        status = "FAIL"
        anomalies.append(
            Anomaly(
                severity="CRITICAL",
                layer="Chat API & Rate Limiting",
                check_name="chat_edge_api",
                message=f"Chat API probe failed: {str(err)}",
                observed="ERROR",
                threshold="SUCCESS",
            )
        )

    check = CheckResult(
        name="chat_edge_api",
        layer="Chat API & Rate Limiting",
        status=status,
        latency_ms=latency_ms,
        http_code=http_code,
        details=details,
    )
    return check, anomalies


def probe_telemetry_drift() -> tuple[CheckResult, list[Anomaly]]:
    """Passively computes PSI and TVD drift comparing production shadow logs against baseline."""
    t0 = time.perf_counter()
    anomalies: list[Anomaly] = []
    status = "PASS"
    details: dict[str, Any] = {}

    baseline_scores: list[int] = []
    if GOLDEN_SET_FILE.is_file():
        try:
            for line in GOLDEN_SET_FILE.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    item = json.loads(line)
                    if "human_score" in item:
                        baseline_scores.append(int(item["human_score"]))
        except Exception as e:
            logger.warning(f"Error reading golden set: {e}")

    prod_scores: list[int] = []
    if SHADOW_LOG_FILE.is_file():
        try:
            for line in SHADOW_LOG_FILE.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    item = json.loads(line)
                    score = item.get("llm_score") or item.get("score")
                    if score is not None:
                        prod_scores.append(int(score))
        except Exception as e:
            logger.warning(f"Error reading shadow log: {e}")

    psi = _compute_psi(baseline_scores, prod_scores) if prod_scores else 0.0
    tvd = _compute_tvd(baseline_scores, prod_scores) if prod_scores else 0.0

    details["baseline_samples"] = len(baseline_scores)
    details["production_samples"] = len(prod_scores)
    details["psi"] = psi
    details["tvd"] = tvd

    if psi > 0.25:
        status = "WARN"
        anomalies.append(
            Anomaly(
                severity="WARNING",
                layer="Model Telemetry Drift",
                check_name="telemetry_drift",
                message=f"High Population Stability Index drift: PSI={psi} (> 0.25 threshold)",
                observed=psi,
                threshold=0.25,
            )
        )

    if tvd > 0.20:
        status = "WARN" if status == "PASS" else status
        anomalies.append(
            Anomaly(
                severity="WARNING",
                layer="Model Telemetry Drift",
                check_name="telemetry_drift",
                message=f"High Total Variation Distance drift: TVD={tvd} (> 0.20 threshold)",
                observed=tvd,
                threshold=0.20,
            )
        )

    latency_ms = round((time.perf_counter() - t0) * 1000, 2)
    check = CheckResult(
        name="telemetry_drift",
        layer="Model Telemetry Drift",
        status=status,
        latency_ms=latency_ms,
        http_code=None,
        details=details,
    )
    return check, anomalies


# ---------------------------------------------------------------------------
# Logging & Markdown Status Dashboard Generation
# ---------------------------------------------------------------------------
def append_to_log(report: ProbeReport) -> None:
    """Appends probe record as a single JSON line to artifacts/monitoring/monitor_log.jsonl."""
    MONITORING_DIR.mkdir(parents=True, exist_ok=True)
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(asdict(report)) + "\n")


def update_status_report(current_report: ProbeReport) -> None:
    """Renders self-updating executive status report from historical monitoring logs."""
    MONITORING_DIR.mkdir(parents=True, exist_ok=True)

    records: list[dict[str, Any]] = []
    if LOG_FILE.is_file():
        try:
            for line in LOG_FILE.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    records.append(json.loads(line))
        except Exception as e:
            logger.warning(f"Error reading log file: {e}")

    # Retain up to last 100 runs
    recent = records[-100:] if records else [asdict(current_report)]
    total_runs = len(recent)
    healthy_runs = sum(1 for r in recent if r.get("overall_status") in ("HEALTHY", "DEGRADED"))
    sla_pct = round((healthy_runs / total_runs) * 100, 2) if total_runs else 100.0

    # Calculate edge API latencies across historical records
    edge_latencies = []
    for r in recent:
        for c in r.get("checks", []):
            if c.get("name") in ("edge_homepage", "api_metrics_gate"):
                edge_latencies.append(float(c.get("latency_ms", 0)))
    edge_latencies.sort()
    p50 = edge_latencies[int(len(edge_latencies) * 0.50)] if edge_latencies else 0.0
    p95 = edge_latencies[int(len(edge_latencies) * 0.95)] if edge_latencies else 0.0

    badge = (
        "🟢 SYSTEM OPERATIONAL"
        if current_report.overall_status == "HEALTHY"
        else "🟡 PERFORMANCE DEGRADED"
        if current_report.overall_status == "DEGRADED"
        else "🔴 CRITICAL OUTAGE / ANOMALY"
    )

    md_lines = [
        "# 📡 LLM Evaluation Engine — Live System Status & Monitoring Report",
        "",
        f"**Current Status:** `{badge}`  ",
        f"**Monitored Target:** [{current_report.target_url}]({current_report.target_url})  ",
        f"**Last Probe Timestamp:** `{current_report.timestamp}`  ",
        f"**Run Identifier:** `{current_report.run_id}`  ",
        f"**Total Sweep Duration:** `{current_report.total_latency_ms:.1f} ms`  ",
        "",
        "---",
        "",
        "## 1. Executive SLA & Operational Metrics",
        "",
        "| Metric | Current Value | Target Threshold | Health |",
        "| :--- | :--- | :--- | :--- |",
        f"| **Rolling Uptime / Availability** | `{sla_pct}%` | `>= 99.5%` | {'✅' if sla_pct >= 99.5 else '⚠️'} |",
        f"| **Median Edge API Latency ($p_{{50}}$)** | `{p50:.1f} ms` | `< 500 ms` | {'✅' if p50 < 500 else '⚠️'} |",
        f"| **Tail Edge API Latency ($p_{{95}}$)** | `{p95:.1f} ms` | `< 1200 ms` | {'✅' if p95 < 1200 else '⚠️'} |",
        f"| **Total Probes Recorded** | `{total_runs}` | — | ℹ️ |",
        "",
        "---",
        "",
        "## 2. Latest Multi-Tier Probe Results",
        "",
        "| Layer | Check Name | Status | Latency | HTTP | Diagnostic Details |",
        "| :--- | :--- | :--- | :--- | :--- | :--- |",
    ]

    for c in current_report.checks:
        icon = "✅ PASS" if c["status"] == "PASS" else "⚠️ WARN" if c["status"] == "WARN" else "❌ FAIL" if c["status"] == "FAIL" else "⏭️ SKIP"
        details_snippet = ", ".join(f"{k}={v}" for k, v in c.get("details", {}).items() if not isinstance(v, (dict, list)))
        md_lines.append(
            f"| **{c['layer']}** | `{c['name']}` | {icon} | `{c['latency_ms']} ms` | `{c['http_code'] or '—'}` | {details_snippet[:65]} |"
        )

    md_lines.extend([
        "",
        "---",
        "",
        "## 3. Active / Recent Anomalies Detected",
        "",
    ])

    if not current_report.anomalies:
        md_lines.append("🎉 **Zero active anomalies detected.** All edge endpoints, browser synthetics, and regression gate checks are performing within operational bounds.")
    else:
        md_lines.extend([
            "| Severity | Layer | Check Name | Anomaly Description | Observed | Threshold |",
            "| :--- | :--- | :--- | :--- | :--- | :--- |",
        ])
        for a in current_report.anomalies:
            sev_icon = "🔴 CRITICAL" if a["severity"] == "CRITICAL" else "🟡 WARNING" if a["severity"] == "WARNING" else "ℹ️ INFO"
            md_lines.append(
                f"| {sev_icon} | **{a['layer']}** | `{a['check_name']}` | {a['message']} | `{a['observed']}` | `{a['threshold']}` |"
            )

    md_lines.extend([
        "",
        "---",
        "",
        "*Report autonomously generated by [Antigravity Monitoring Agent](file:///Volumes/LaCie/eval-engine/scripts/monitor_agent.py)*",
        f"*Telemetry stored at [`artifacts/monitoring/monitor_log.jsonl`](file:///Volumes/LaCie/eval-engine/artifacts/monitoring/monitor_log.jsonl)*",
    ])

    STATUS_REPORT_FILE.write_text("\n".join(md_lines), encoding="utf-8")


# ---------------------------------------------------------------------------
# Main Orchestration Loop
# ---------------------------------------------------------------------------
def run_monitoring_sweep(
    target_url: str = DEFAULT_TARGET_URL,
    zero_cost: bool = True,
    skip_browser: bool = False,
) -> ProbeReport:
    """Executes a complete multi-tier monitoring sweep."""
    t_start = time.perf_counter()
    run_id = f"mon_{int(time.time())}"
    timestamp = datetime.now(timezone.utc).isoformat()
    logger.info(f"[{run_id}] Starting monitoring sweep for {target_url} (zero_cost={zero_cost})...")

    all_checks: list[CheckResult] = []
    all_anomalies: list[Anomaly] = []

    # 1. Edge Homepage
    c1, a1 = probe_edge_homepage(target_url)
    all_checks.append(c1)
    all_anomalies.extend(a1)

    # 2. Metrics Gate
    c2, a2 = probe_metrics_gate(target_url)
    all_checks.append(c2)
    all_anomalies.extend(a2)

    # 3. Browser Synthetics
    if not skip_browser:
        c3, a3 = probe_browser_synthetics(target_url)
        all_checks.append(c3)
        all_anomalies.extend(a3)
    else:
        all_checks.append(
            CheckResult(
                name="browser_synthetics",
                layer="Browser Synthetics",
                status="SKIP",
                latency_ms=0.0,
                http_code=None,
                details={"reason": "Skipped via --skip-browser"},
            )
        )

    # 4. Chat Edge & Rate Limiter
    c4, a4 = probe_chat_edge(target_url, zero_cost=zero_cost)
    all_checks.append(c4)
    all_anomalies.extend(a4)

    # 5. Telemetry Drift
    c5, a5 = probe_telemetry_drift()
    all_checks.append(c5)
    all_anomalies.extend(a5)

    total_latency_ms = round((time.perf_counter() - t_start) * 1000, 2)

    # Determine overall status
    critical_count = sum(1 for a in all_anomalies if a.severity == "CRITICAL")
    warning_count = sum(1 for a in all_anomalies if a.severity == "WARNING")

    if critical_count > 0:
        overall_status = "OUTAGE"
    elif warning_count > 0:
        overall_status = "DEGRADED"
    else:
        overall_status = "HEALTHY"

    report = ProbeReport(
        run_id=run_id,
        timestamp=timestamp,
        target_url=target_url,
        overall_status=overall_status,
        checks=[asdict(c) for c in all_checks],
        anomalies=[asdict(a) for a in all_anomalies],
        total_latency_ms=total_latency_ms,
    )

    # Save to disk
    append_to_log(report)
    update_status_report(report)

    logger.info(
        f"[{run_id}] Finished in {total_latency_ms}ms: status={overall_status} | "
        f"Checks: {len(all_checks)} | Anomalies: {len(all_anomalies)} (Critical: {critical_count}, Warnings: {warning_count})"
    )
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Autonomous Website & Quality Gate Monitoring Agent")
    parser.add_argument("--target", default=DEFAULT_TARGET_URL, help="Target base URL")
    parser.add_argument("--interval", type=int, default=300, help="Poll interval in seconds for daemon mode")
    parser.add_argument("--daemon", action="store_true", help="Run continuously in background daemon loop")
    parser.add_argument("--once", action="store_true", default=True, help="Run single sweep and exit (default)")
    parser.add_argument("--skip-browser", action="store_true", help="Skip Playwright browser synthetics")
    parser.add_argument("--live-eval", action="store_true", help="Enable live paid OpenAI LLM evaluations during probe (Tier 3)")
    args = parser.parse_args()

    zero_cost = not args.live_eval

    if args.daemon:
        logger.info(f"Starting Monitoring Agent in DAEMON mode (interval={args.interval}s, target={args.target})")
        try:
            while True:
                report = run_monitoring_sweep(
                    target_url=args.target,
                    zero_cost=zero_cost,
                    skip_browser=args.skip_browser,
                )
                time.sleep(args.interval)
        except KeyboardInterrupt:
            logger.info("Monitoring Agent daemon stopped cleanly by user.")
            return 0
    else:
        report = run_monitoring_sweep(
            target_url=args.target,
            zero_cost=zero_cost,
            skip_browser=args.skip_browser,
        )
        # Print summary table
        print(f"\n=======================================================")
        print(f"📊 MONITORING AGENT SWEEP COMPLETE — [{report.overall_status}]")
        print(f"Target: {report.target_url}")
        print(f"Total Sweep Duration: {report.total_latency_ms} ms")
        print(f"Anomalies Detected: {len(report.anomalies)}")
        print(f"Audit Log: {LOG_FILE}")
        print(f"Status Dashboard: {STATUS_REPORT_FILE}")
        print(f"=======================================================\n")
        return 0 if report.overall_status in ("HEALTHY", "DEGRADED") else 1


if __name__ == "__main__":
    sys.exit(main())
